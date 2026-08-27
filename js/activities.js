(() => {
  "use strict";

  const LOCAL_KEY = "rdvs_activities_v1";
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const FALLBACK_STRUCTURES = [
    { id: "europe", name: "Europe", color: "#2563eb" },
    { id: "artois-champagne", name: "Artois Champagne", color: "#f97316" },
    { id: "neuville", name: "Neuville", color: "#16a34a" },
    { id: "quentin-web", name: "Quentin Web", color: "#7c3aed" },
    { id: "benjamin-rouche", name: "Benjamin Rouché", color: "#db2777" },
    { id: "autre", name: "Autre", color: "#64748b" }
  ];

  let activities = loadLocal();
  let selectedFilter = "all";
  let editingId = null;

  const $ = selector => document.querySelector(selector);

  function loadLocal() {
    try {
      const value = JSON.parse(localStorage.getItem(LOCAL_KEY));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(activities));
    } catch (error) {
      console.warn("Impossible d'enregistrer les activités localement :", error);
    }
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "activity_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    }[char]));
  }

  function safeUrl(value) {
    const url = String(value || "").trim();
    return /^(https:\/\/|data:image\/)/i.test(url) ? url : "";
  }

  function getFlyerImageUrl(item) {
  const fileId = String(item?.fileId || "").trim();

  if (fileId) {
    return "https://drive.google.com/thumbnail?id="
      + encodeURIComponent(fileId)
      + "&sz=w1600";
  }

  return safeUrl(item?.fileUrl || item?.fileData || "");
}

  function apiUrl() {
    const value = String(window.APP_CONFIG?.activitiesScriptUrl || "").trim();
    return value && !value.includes("COLLE_ICI") ? value : "";
  }

  function hasRemoteBackend() {
    return Boolean(apiUrl());
  }

  function isAdminUser() {
    try {
      return typeof window.isAdmin === "function" && window.isAdmin();
    } catch {
      return false;
    }
  }

  function localDateValue(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function todayValue() {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    return localDateValue(now);
  }

  function parseDate(value) {
    return value ? new Date(`${value}T12:00:00`) : null;
  }

  function formatDate(value) {
    const date = parseDate(value);
    if (!date) return "";
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function getStructures() {
    try {
      const raw = localStorage.getItem("rdvs_structures_v1");
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {}
    return FALLBACK_STRUCTURES;
  }

  function getStructure(idOrName) {
    return getStructures().find(s => s.id === idOrName || s.name === idOrName) || {
      id: "autre",
      name: idOrName || "Autre",
      color: "#64748b"
    };
  }

  function populateStructureSelectors() {
    const structures = getStructures();
    const options = structures
      .map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`)
      .join("");

    const publicFilter = $("#activities-site-filter");
    if (publicFilter) {
      const previous = selectedFilter;
      publicFilter.innerHTML = `<option value="all">Tous les sites</option>${options}`;
      const valid = previous === "all" || structures.some(s => s.id === previous);
      selectedFilter = valid ? previous : "all";
      publicFilter.value = selectedFilter;
    }

    const adminSelect = $("#activity-structure");
    if (adminSelect) {
      const previous = adminSelect.value;
      adminSelect.innerHTML = options;
      if (structures.some(s => s.id === previous)) adminSelect.value = previous;
    }
  }

  function statusOf(item) {
  if (item.pinned) return "pinned";

  const today = todayValue();
  const start = item.date || "";
  const end = item.endDate || start;

  if (start && start <= today && today <= end) return "today";
  if (start > today) return "future";
  return "past";
}

  function sortActivities(items) {
  const groupOrder = {
    pinned: 0,
    today: 1,
    future: 2,
    past: 3
  };

  return [...items].sort((a, b) => {
    const statusA = statusOf(a);
    const statusB = statusOf(b);

    if (groupOrder[statusA] !== groupOrder[statusB]) {
      return groupOrder[statusA] - groupOrder[statusB];
    }

    // Les flyers épinglés suivent l'ordre choisi par glisser-déposer
    if (statusA === "pinned") {
      return Number(a.order ?? 9999) - Number(b.order ?? 9999);
    }

    if (statusA === "past") {
      const endA = a.endDate || a.date || "";
      const endB = b.endDate || b.date || "";
      return endB.localeCompare(endA);
    }

    return String(a.date || "").localeCompare(String(b.date || ""));
  });
}

  function visibleActivities() {
    return sortActivities(
      activities.filter(item => selectedFilter === "all" || item.structureId === selectedFilter)
    );
  }

  function dateLabel(item) {
    const start = item.date || "";
    const end = item.endDate || start;
    if (start && end && start !== end) {
      return `${formatDate(start)} → ${formatDate(end)}`;
    }
    return formatDate(start);
  }

  function flyerMediaHtml(item) {
  const type = String(item.fileType || "");
  const source = safeUrl(item.fileData || item.fileUrl || "");

  if (source && type.startsWith("image/")) {
    return `
      <img
        class="activity-flyer-media"
        src="${escapeHtml(source)}"
        alt="Flyer : ${escapeHtml(item.title)}"
        loading="lazy"
      />
    `;
  }

  if (source && type === "application/pdf") {
    return `<div class="activity-flyer-placeholder">📄</div>`;
  }

  return `<div class="activity-flyer-placeholder">📢</div>`;
}

  function activityCardHtml(item) {
    const structure = getStructure(item.structureId);
    const status = statusOf(item);
    return `
      <button
        type="button"
        class="activity-flyer-card"
        style="--activity-color:${escapeHtml(structure.color)}"
        data-view-activity="${escapeHtml(item.id)}"
      >
        ${status === "today" ? `<span class="activity-today-ribbon">Aujourd'hui</span>` : ""}
        ${flyerMediaHtml(item)}
        <div class="activity-flyer-content">
          <span class="activity-site-badge">${escapeHtml(structure.name)}</span>
          <h5>${escapeHtml(item.title)}</h5>
          ${item.date
  ? `<p class="activity-date-line"><strong>${escapeHtml(dateLabel(item))}</strong></p>`
  : item.pinned
    ? `<p class="activity-date-line"><strong>📌 Épinglé</strong></p>`
    : ""
}
    ${item.description ? `<p class="activity-description-line">${escapeHtml(item.description)}</p>` : ""}
        </div>
      </button>
    `;
  }

  function renderPublic() {
    const list = $("#activities-public-list");
    if (!list) return;

    populateStructureSelectors();

    const grouped = {
  pinned: [],
  today: [],
  future: [],
  past: []
};
  visibleActivities().forEach(item => {
  const status = statusOf(item);

  if (grouped[status]) {
    grouped[status].push(item);
  }
});

    const sections = [
  ["pinned", "📌 À la une"],
  ["today", "🔴 Aujourd'hui"],
  ["future", "🟠 À venir"],
  ["past", "⚪ Activités passées"]
];

    const html = sections.map(([key, title]) => {
      const items = grouped[key];
      if (!items.length) return "";
      return `
        <section class="activities-group">
          <h2 class="activities-group-title">
            ${title}
            <span class="activities-group-count">${items.length}</span>
          </h2>
          <div class="activities-grid">${items.map(activityCardHtml).join("")}</div>
        </section>
      `;
    }).join("");

    list.innerHTML = html || `<div class="activities-empty">Aucune activité à afficher pour le moment.</div>`;

    list.querySelectorAll("[data-view-activity]").forEach(button => {
      button.addEventListener("click", () => openActivity(button.dataset.viewActivity));
    });
  }

  function renderAdmin() {
  const list = $("#activity-admin-list");
  if (!list) return;

  populateStructureSelectors();
  updateBackendWarning();

  const sorted = sortActivities(activities);

  if (!sorted.length) {
    list.innerHTML = `<div class="activities-empty">Aucune activité enregistrée.</div>`;
    return;
  }

  list.innerHTML = sorted.map(item => {
    const structure = getStructure(item.structureId);

    const infoDate = item.pinned
      ? (item.date ? `📌 Épinglé · ${dateLabel(item)}` : "📌 Épinglé")
      : dateLabel(item);

    return `
      <article
        class="activity-admin-row ${item.pinned ? "activity-admin-pinned" : ""}"
        style="--activity-color:${escapeHtml(structure.color)}"
        data-admin-activity="${escapeHtml(item.id)}"
        data-pinned="${item.pinned ? "true" : "false"}"
        draggable="${item.pinned ? "true" : "false"}"
      >
        <div class="activity-admin-info">

          ${item.pinned
            ? `<span class="activity-drag-handle" title="Glisser pour déplacer">☰</span>`
            : ""
          }

          <strong>${escapeHtml(item.title)}</strong>

          <div class="activity-admin-meta">
            ${escapeHtml(structure.name)} · ${escapeHtml(infoDate)}
          </div>
        </div>

        <div class="activity-admin-actions">
          <button
            type="button"
            class="small-btn"
            data-edit-activity="${escapeHtml(item.id)}"
          >
            Modifier
          </button>

          <button
            type="button"
            class="small-btn danger"
            data-delete-activity="${escapeHtml(item.id)}"
          >
            Supprimer
          </button>
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-edit-activity]").forEach(button => {
    button.addEventListener("click", () => {
      editActivity(button.dataset.editActivity);
    });
  });

  list.querySelectorAll("[data-delete-activity]").forEach(button => {
    button.addEventListener("click", () => {
      deleteActivity(button.dataset.deleteActivity);
    });
  });

  let draggedRow = null;

  list
    .querySelectorAll('.activity-admin-row[data-pinned="true"]')
    .forEach(row => {

      row.addEventListener("dragstart", event => {
        draggedRow = row;
        row.classList.add("dragging");

        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
        }
      });

      row.addEventListener("dragover", event => {
        event.preventDefault();

        if (!draggedRow || draggedRow === row) return;

        const rect = row.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2;

        if (after) {
          row.after(draggedRow);
        } else {
          row.before(draggedRow);
        }
      });

      row.addEventListener("drop", async event => {
        event.preventDefault();
        await savePinnedOrderFromDom();
      });

      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        draggedRow = null;
      });
    });
}

  async function savePinnedOrderFromDom() {
  const list = $("#activity-admin-list");
  if (!list) return;

  const pinnedRows = [
    ...list.querySelectorAll(
      '.activity-admin-row[data-pinned="true"]'
    )
  ];

  const orders = pinnedRows.map((row, index) => ({
    id: row.dataset.adminActivity,
    order: index
  }));

  activities = activities.map(item => {
    const position = orders.find(entry => entry.id === item.id);

    if (!position) return item;

    return {
      ...item,
      order: position.order
    };
  });

  saveLocal();
  renderPublic();

  if (hasRemoteBackend()) {
    setFormMessage("Enregistrement de l'ordre…");

    await postRemote("activity_reorder", {
      orders: orders
    });

    await delay(700);
    await loadRemote();

    setFormMessage(
      "Ordre des flyers enregistré.",
      "success"
    );
  }

  renderAdmin();
  renderPublic();
}

  function updateBackendWarning() {
    const warning = $("#activities-backend-warning");
    if (warning) warning.hidden = hasRemoteBackend();
  }

  function setPublicStatus(message) {
    const status = $("#activities-public-status");
    if (status) status.textContent = message || "";
  }

  function setFormMessage(message, type = "") {
    const el = $("#activity-form-message");
    if (!el) return;
    el.textContent = message || "";
    el.className = "activities-form-message activities-form-full" + (type ? ` ${type}` : "");
  }

  function showPublicScreen() {
    const login = $("#login-screen");
    const app = $("#app-screen");
    const publicScreen = $("#activities-public");
    if (!publicScreen) return;

    if (login) login.hidden = true;
    if (app) app.hidden = true;
    publicScreen.hidden = false;
    selectedFilter = "all";
    renderPublic();
    refreshFromRemote(true);
  }

  function leavePublicScreen() {
    const publicScreen = $("#activities-public");
    if (publicScreen) publicScreen.hidden = true;

    // L'espace public est ouvert depuis l'écran de connexion.
    // On revient donc simplement à la connexion.
    const login = $("#login-screen");
    if (login) login.hidden = false;
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve(null);
      if (file.size > MAX_FILE_BYTES) {
        return reject(new Error("Le flyer dépasse 8 Mo."));
      }

      const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (file.type && !allowed.includes(file.type)) {
        return reject(new Error("Format non accepté. Utilise JPG, PNG, WebP ou PDF."));
      }

      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        type: file.type || guessMime(file.name),
        size: file.size,
        data: reader.result
      });
      reader.onerror = () => reject(new Error("Impossible de lire le fichier choisi."));
      reader.readAsDataURL(file);
    });
  }

  function guessMime(name) {
    const lower = String(name || "").toLowerCase();
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }

  async function saveActivity(event) {
    event.preventDefault();
    if (!isAdminUser()) {
      setFormMessage("Seul l'administrateur peut gérer les activités.", "error");
      return;
    }

    const submit = $("#activity-submit");
    if (submit) submit.disabled = true;
    setFormMessage("Préparation du flyer…");

    try {
      const title = $("#activity-title").value.trim();
      const structureId = $("#activity-structure").value;
      const pinned = $("#activity-pinned").checked;
      const date = $("#activity-date").value;
      const endDate = date
      ? ($("#activity-end-date").value || date)
        : "";
      const description = $("#activity-description").value.trim();
      const file = await readFile($("#activity-file").files[0]);
      const existing = editingId ? activities.find(item => item.id === editingId) : null;

      if (!title || !structureId) {
  throw new Error("Titre et site sont obligatoires.");
}

if (!pinned && !date) {
  throw new Error("La date est obligatoire sauf pour un flyer épinglé.");
}
      if (endDate < date) throw new Error("La date de fin doit être après la date de début.");
      if (!existing && !file) throw new Error("Choisis un flyer avant de publier.");

      const now = new Date().toISOString();
      const item = {
        ...(existing || {}),
        id: existing?.id || uid(),
        title,
        structureId,
        date,
        endDate,
        description,
        pinned,
        order: existing?.order ?? activities.filter(a => a.pinned).length,
        updatedAt: now,
        createdAt: existing?.createdAt || now
      };

      if (file) {
        item.fileName = file.name;
        item.fileType = file.type;
        item.fileSize = file.size;
        item.fileData = file.data;
      }

      if (hasRemoteBackend()) {
        setFormMessage("Publication du flyer…");
        await postRemote(existing ? "activity_update" : "activity_create", item);

        // Google Apps Script est appelé en no-cors. On recharge ensuite la liste
        // publique pour confirmer que l'enregistrement est bien partagé.
        let confirmed = false;

for (let attempt = 0; attempt < 6 && !confirmed; attempt++) {
  await delay(1500);

  const loaded = await loadRemote();

  if (loaded) {
    confirmed = activities.some(remote => remote.id === item.id);
  }
}

        if (!confirmed) {
          // On conserve une copie locale pour ne pas perdre le formulaire,
          // mais on avertit clairement qu'on n'a pas confirmé la publication.
          activities = upsertLocalItem(item);
          saveLocal();
          setFormMessage("Le flyer a été envoyé, mais la publication partagée n'a pas encore pu être confirmée. Utilise Actualiser dans quelques secondes.", "warning");
        } else {
          setFormMessage("Activité publiée pour tous les visiteurs.", "success");
        }
      } 

        // Actualisation automatique après la publication
setTimeout(() => {
  refreshFromRemote(false);
}, 3000);

setTimeout(() => {
  refreshFromRemote(false);
}, 8000);
        
      else {
        activities = upsertLocalItem(item);
        saveLocal();
        setFormMessage("Activité enregistrée seulement sur cet appareil. Configure le service Flyers pour la rendre visible à tous.", "warning");
      }

      resetForm(false);
      renderAdmin();
      renderPublic();
    } catch (error) {
      setFormMessage(error.message || String(error), "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function upsertLocalItem(item) {
    const exists = activities.some(existing => existing.id === item.id);
    return exists
      ? activities.map(existing => existing.id === item.id ? item : existing)
      : [...activities, item];
  }

  async function deleteActivity(id) {
    if (!isAdminUser()) return;
    const item = activities.find(activity => activity.id === id);
    if (!item) return;
    if (!confirm(`Supprimer « ${item.title} » ?`)) return;

    if (hasRemoteBackend()) {
      await postRemote("activity_delete", { id });
      await delay(900);
      await loadRemote();
    } else {
      activities = activities.filter(activity => activity.id !== id);
      saveLocal();
    }

    if (editingId === id) resetForm();
    renderAdmin();
    renderPublic();
  }

  function editActivity(id) {
    if (!isAdminUser()) return;
    const item = activities.find(activity => activity.id === id);
    if (!item) return;

    editingId = id;
    $("#activity-title").value = item.title || "";
    $("#activity-structure").value = item.structureId || "";
    $("#activity-pinned").checked = Boolean(item.pinned);
    $("#activity-date").value = item.date || "";
    $("#activity-end-date").value = item.endDate || item.date || "";
    $("#activity-description").value = item.description || "";
    $("#activity-file").value = "";
    $("#activity-submit").textContent = "Enregistrer les modifications";
    $("#activity-cancel").hidden = false;
    setFormMessage("Tu peux conserver le flyer actuel en ne choisissant pas de nouveau fichier.");
    $("#activity-title").focus();
  }

  function resetForm(clearMessage = true) {
    editingId = null;
    const form = $("#activity-admin-form");
    if (form) form.reset();
    populateStructureSelectors();
    if ($("#activity-date")) $("#activity-date").value = todayValue();
    if ($("#activity-submit")) $("#activity-submit").textContent = "Publier l'activité";
    if ($("#activity-cancel")) $("#activity-cancel").hidden = true;
    if (clearMessage) setFormMessage("");
  }

  function openActivity(id) {
  const item = activities.find(activity => activity.id === id);
  if (!item) return;

  const structure = getStructure(item.structureId);
  const modal = $("#detail-modal");
  if (!modal) return;

  const isImage = String(item.fileType || "").startsWith("image/");
  const isPdf = String(item.fileType || "") === "application/pdf";

  const imageUrl = safeUrl(item.fileData || item.fileUrl || "");
  const previewUrl = safeUrl(item.filePreviewUrl || item.fileUrl || "");

  let media = `<div class="activities-empty">Aucun flyer disponible.</div>`;

  if (isImage && imageUrl) {
    media = `
      <img
        class="activity-modal-image"
        src="${escapeHtml(imageUrl)}"
        alt="Flyer : ${escapeHtml(item.title)}"
      />
    `;
  } else if (isPdf && previewUrl) {
    media = `
      <iframe
        class="activity-modal-frame"
        src="${escapeHtml(previewUrl)}"
        title="Flyer PDF : ${escapeHtml(item.title)}">
      </iframe>
    `;
  }

  $("#detail-modal-title").textContent = item.title;

  $("#detail-modal-content").innerHTML = `
    <div class="activity-detail-meta">

      <div>
        <strong>Site :</strong>
        ${escapeHtml(structure.name)}
      </div>

      ${item.date
        ? `<div><strong>Date :</strong> ${escapeHtml(dateLabel(item))}</div>`
        : ""
      }

      ${item.description
        ? `<div>${escapeHtml(item.description)}</div>`
        : ""
      }

    </div>

    ${media}
  `;

  $("#detail-modal-actions").innerHTML = "";
  modal.hidden = false;
}

  function postRemote(action, item) {
    const url = apiUrl();
    if (!url) return Promise.resolve(false);

    return fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, item })
    }).then(() => true);
  }

  function loadRemote() {
    const url = apiUrl();
    if (!url) return Promise.resolve(false);

    return new Promise(resolve => {
      const callbackName = "rdvsActivitiesCallback_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
      const script = document.createElement("script");
      let finished = false;

      const finish = success => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        try { delete window[callbackName]; } catch {}
        if (script.parentNode) script.remove();
        resolve(success);
      };

      const timeout = setTimeout(() => finish(false), 20000);

      window[callbackName] = data => {
        if (data && data.ok && Array.isArray(data.activities)) {
          activities = data.activities;
          saveLocal();
          finish(true);
        } else {
          finish(false);
        }
      };

      script.onerror = () => finish(false);
      const separator = url.includes("?") ? "&" : "?";
      script.src = `${url}${separator}action=loadActivities&callback=${encodeURIComponent(callbackName)}&t=${Date.now()}`;
      document.body.appendChild(script);
    });
  }

  async function refreshFromRemote(showStatus = false) {
    populateStructureSelectors();
    if (!hasRemoteBackend()) {
      if (showStatus) setPublicStatus("Affichage des activités enregistrées sur cet appareil.");
      renderPublic();
      renderAdmin();
      return false;
    }

    if (showStatus) setPublicStatus("Actualisation des activités…");
    const loaded = await loadRemote();
    if (showStatus) {
      setPublicStatus(loaded ? "Activités à jour." : "Impossible d'actualiser les activités pour le moment.");
    }
    renderPublic();
    renderAdmin();
    return loaded;
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function bindEvents() {
    $("#public-activities-btn")?.addEventListener("click", showPublicScreen);
    $("#activities-back-login")?.addEventListener("click", leavePublicScreen);
    $("#activities-site-filter")?.addEventListener("change", event => {
      selectedFilter = event.target.value;
      renderPublic();
    });
    $("#activities-refresh")?.addEventListener("click", () => refreshFromRemote(true));
    $("#activities-admin-refresh")?.addEventListener("click", () => refreshFromRemote(false));
    $("#activity-admin-form")?.addEventListener("submit", saveActivity);
    $("#activity-cancel")?.addEventListener("click", () => resetForm());

    // Quand l'onglet admin est ouvert, on recharge les structures/couleurs
    // et la liste des flyers afin de refléter les dernières modifications.
    document.querySelector('[data-tab="activities-admin"]')?.addEventListener("click", () => {
      populateStructureSelectors();
      renderAdmin();
      if (hasRemoteBackend()) refreshFromRemote(false);
    });
  }

  function initActivities() {
    populateStructureSelectors();
    resetForm();
    renderPublic();
    renderAdmin();
    updateBackendWarning();
    bindEvents();

    // Les visiteurs peuvent consulter la page sans connexion. Le chargement
    // distant est donc effectué dès l'ouverture du site.
    refreshFromRemote(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initActivities);
  } else {
    initActivities();
  }
})();
