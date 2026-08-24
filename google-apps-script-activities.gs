/**
 * RDVs - Backend public pour "Activités de la semaine"
 * -----------------------------------------------------
 * Ce script est volontairement séparé du Google Apps Script déjà utilisé
 * pour le planning / FAQ afin de ne pas risquer de casser la synchronisation
 * existante.
 *
 * FONCTIONS :
 * - GET action=loadActivities : renvoie les activités en JSONP pour le site public.
 * - POST activity_create     : ajoute une activité et son flyer.
 * - POST activity_update     : modifie une activité, et remplace le flyer si besoin.
 * - POST activity_delete     : supprime l'activité et met le flyer à la corbeille.
 *
 * STOCKAGE :
 * - Un dossier Google Drive "RDVs - Flyers" est créé automatiquement.
 * - Les flyers sont stockés dans ce dossier.
 * - La liste des activités est stockée dans un fichier activities.json du même dossier.
 *
 * DEPLOIEMENT :
 * 1. Créer un NOUVEAU projet Google Apps Script.
 * 2. Copier tout ce fichier dans Code.gs.
 * 3. Déployer > Nouveau déploiement > Application Web.
 * 4. Exécuter en tant que : Moi.
 * 5. Qui a accès : Tout le monde.
 * 6. Copier l'URL /exec dans data/config.js > activitiesScriptUrl.
 */

const ACTIVITY_FOLDER_NAME = "RDVs - Flyers";
const ACTIVITY_DATA_FILE = "activities.json";
const ACTIVITY_FOLDER_PROPERTY = "RDVS_ACTIVITY_FOLDER_ID_V1";
const MAX_ACTIVITY_FILE_BYTES = 8 * 1024 * 1024;

function doGet(e) {
  const action = e && e.parameter ? String(e.parameter.action || "") : "";
  const callback = e && e.parameter ? String(e.parameter.callback || "") : "";

  if (action === "loadActivities") {
    const result = { ok: true, activities: loadActivities_() };
    return outputJsonOrJsonp_(result, callback);
  }

  return ContentService
    .createTextOutput("Service RDVs - Activites de la semaine actif.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    const data = JSON.parse(raw);
    const action = String(data.action || "");
    const item = data.item || {};

    if (action === "activity_create") {
      return json_(createOrUpdateActivity_(item, false));
    }

    if (action === "activity_update") {
      return json_(createOrUpdateActivity_(item, true));
    }

    if (action === "activity_delete") {
      return json_(deleteActivity_(String(item.id || "")));
    }

    return json_({ ok: false, error: "Action inconnue." });
  } catch (error) {
    return json_({ ok: false, error: String(error) });
  }
}

function createOrUpdateActivity_(incoming, isUpdate) {
  validateActivity_(incoming);

  const items = loadActivities_();
  const index = items.findIndex(item => item.id === incoming.id);
  const existing = index >= 0 ? items[index] : null;

  if (isUpdate && !existing) {
    throw new Error("Activite introuvable.");
  }

  const item = Object.assign({}, existing || {}, sanitizeActivity_(incoming));

  if (incoming.fileData) {
    const uploaded = saveFlyer_(incoming.fileData, incoming.fileName || "flyer", incoming.fileType || "");

    if (existing && existing.fileId && existing.fileId !== uploaded.fileId) {
      try {
        DriveApp.getFileById(existing.fileId).setTrashed(true);
      } catch (_) {}
    }

    item.fileId = uploaded.fileId;
    item.fileUrl = uploaded.fileUrl;
    item.filePreviewUrl = uploaded.filePreviewUrl;
    item.fileViewUrl = uploaded.fileViewUrl;
    item.fileType = uploaded.fileType;
    item.fileName = uploaded.fileName;
  }

  delete item.fileData;

  if (!item.fileId) {
    throw new Error("Un flyer est obligatoire pour cette activite.");
  }

  if (index >= 0) {
    items[index] = item;
  } else {
    items.push(item);
  }

  saveActivities_(items);
  return { ok: true, item: item };
}

function deleteActivity_(id) {
  if (!id) throw new Error("Identifiant manquant.");

  const items = loadActivities_();
  const existing = items.find(item => item.id === id);

  if (existing && existing.fileId) {
    try {
      DriveApp.getFileById(existing.fileId).setTrashed(true);
    } catch (_) {}
  }

  const remaining = items.filter(item => item.id !== id);
  saveActivities_(remaining);
  return { ok: true };
}

function validateActivity_(item) {
  if (!item || !item.id) throw new Error("Identifiant manquant.");
  if (!String(item.title || "").trim()) throw new Error("Titre manquant.");
  if (!String(item.structureId || "").trim()) throw new Error("Structure manquante.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ""))) throw new Error("Date invalide.");

  const endDate = String(item.endDate || item.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error("Date de fin invalide.");
  if (endDate < item.date) throw new Error("La date de fin est avant la date de debut.");
}

function sanitizeActivity_(item) {
  return {
    id: String(item.id || "").slice(0, 120),
    title: String(item.title || "").trim().slice(0, 250),
    structureId: String(item.structureId || "").trim().slice(0, 150),
    date: String(item.date || ""),
    endDate: String(item.endDate || item.date || ""),
    description: String(item.description || "").trim().slice(0, 3000),
    createdAt: String(item.createdAt || new Date().toISOString()),
    updatedAt: String(item.updatedAt || new Date().toISOString()),
    fileName: String(item.fileName || "").slice(0, 250),
    fileType: String(item.fileType || "").slice(0, 100),
    fileSize: Number(item.fileSize || 0) || 0,
    // Les champs Drive existants sont conservés lors d'une modification sans nouveau flyer.
    fileId: String(item.fileId || ""),
    fileUrl: String(item.fileUrl || ""),
    filePreviewUrl: String(item.filePreviewUrl || ""),
    fileViewUrl: String(item.fileViewUrl || "")
  };
}

function saveFlyer_(dataUrl, requestedName, requestedType) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Format du flyer invalide.");

  const mimeType = String(match[1] || requestedType || "application/octet-stream");
  const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (allowed.indexOf(mimeType) === -1) {
    throw new Error("Format du flyer non autorise.");
  }

  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > MAX_ACTIVITY_FILE_BYTES) {
    throw new Error("Le flyer depasse 8 Mo.");
  }

  const safeName = sanitizeFileName_(requestedName || "flyer");
  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  const file = getActivityFolder_().createFile(blob);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const id = file.getId();
  return {
    fileId: id,
    fileName: file.getName(),
    fileType: mimeType,
    fileUrl: "https://drive.google.com/uc?export=view&id=" + encodeURIComponent(id),
    filePreviewUrl: "https://drive.google.com/file/d/" + encodeURIComponent(id) + "/preview",
    fileViewUrl: "https://drive.google.com/file/d/" + encodeURIComponent(id) + "/view"
  };
}

function sanitizeFileName_(name) {
  const cleaned = String(name || "flyer")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "flyer";
}

function getActivityFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty(ACTIVITY_FOLDER_PROPERTY);

  if (savedId) {
    try {
      return DriveApp.getFolderById(savedId);
    } catch (_) {}
  }

  const folders = DriveApp.getFoldersByName(ACTIVITY_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(ACTIVITY_FOLDER_NAME);
  props.setProperty(ACTIVITY_FOLDER_PROPERTY, folder.getId());
  return folder;
}

function getDataFile_() {
  const folder = getActivityFolder_();
  const files = folder.getFilesByName(ACTIVITY_DATA_FILE);
  if (files.hasNext()) return files.next();

  return folder.createFile(
    ACTIVITY_DATA_FILE,
    "[]",
    MimeType.PLAIN_TEXT
  );
}

function loadActivities_() {
  try {
    const content = getDataFile_().getBlob().getDataAsString("UTF-8");
    const parsed = JSON.parse(content || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveActivities_(items) {
  getDataFile_().setContent(JSON.stringify(items || []));
}

function outputJsonOrJsonp_(data, callback) {
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + "(" + JSON.stringify(data) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(data);
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
