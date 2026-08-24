/**
 * Script Google Apps Script pour envoyer automatiquement un mail
 * + ajouter des lignes faciles à lire par Power Automate :
 *
 * PA_TITLE=
 * PA_DATE=
 * PA_START=
 * PA_END=
 * PA_STRUCTURE=
 * PA_ACTION=
 *
 * IMPORTANT :
 * - Remplace ADMIN_EMAIL par ton adresse mail.
 * - Déploie en Application Web.
 * - Exécuter en tant que : Moi.
 * - Qui a accès : Tout le monde.
 */

const ADMIN_EMAIL = "ton-adresse-mail@exemple.fr";

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) ? e.postData.contents : "{}");

    const action = data.action || "Notification";
    const subject = data.subject || ("[Planning FAQ] " + action);

    const paTitle = buildPowerAutomateTitle(data);
    const paDate = data.date || "";
    const paStart = data.start || "";
    const paEnd = data.end || "";
    const paStructure = data.structure || "";
    const paAction = action;
    const paId = (data.item && data.item.id) || data.id || "";
    const paType = data.type || "";

    const body = [
      "Bonjour,",
      "",
      "Une action vient d'être effectuée sur le site Planning & FAQ Numérique.",
      "",
      "Action : " + action,
      "Effectué par : " + (data.actor || ""),
      "",
      "Ajouté par / propriétaire : " + (data.owner || ""),
      "Date : " + paDate,
      "Horaire : " + paStart + " - " + paEnd,
      "Structure : " + paStructure,
      "Titre : " + (data.title || ""),
      "Nom / prénom : " + (data.person || ""),
      "Demande : " + (data.need || ""),
      "Créneau : " + (data.slot || ""),
      "",
      data.beforeSummary || "",
      data.afterSummary || "",
      "",
      "----- POWER AUTOMATE -----",
      "PA_TITLE=" + paTitle,
      "PA_DATE=" + paDate,
      "PA_START=" + paStart,
      "PA_END=" + paEnd,
      "PA_STRUCTURE=" + paStructure,
      "PA_ACTION=" + paAction,
      "----- FIN POWER AUTOMATE -----",
      "",
      "Message envoyé automatiquement depuis le site Planning & FAQ Numérique."
    ].filter(String).join("\n");

    const attachments = [];
    const ics = buildIcsFile(data, paTitle);
    if (ics) {
      attachments.push(Utilities.newBlob(ics, "text/calendar", "planning-faq.ics"));
    }

    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: subject,
      body: body,
      attachments: attachments
    });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: "[Planning FAQ] Erreur notification",
      body: "Erreur Apps Script : " + String(error)
    });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function buildPowerAutomateTitle(data) {
  const person = data.person || "";
  const title = data.title || "";

  // Ne pas mettre "créé", "ajouté" ou "modifié" dans le titre Outlook
  if (person) {
    return "RDV FAQ - " + person;
  }

  if (title) {
    return title;
  }

  return "Planning FAQ numérique";
}

function buildIcsFile(data, paTitle) {
  if (!data.date || !data.start || !data.end) return "";

  const title = paTitle || data.title || data.person || data.action || "Planning FAQ numérique";
  const description = [
    "Action : " + (data.action || ""),
    "Effectué par : " + (data.actor || ""),
    "Structure : " + (data.structure || ""),
    "Nom / prénom : " + (data.person || ""),
    "Demande : " + (data.need || ""),
    data.beforeSummary || "",
    data.afterSummary || ""
  ].filter(String).join("\\n");

  const dtStart = toIcsDateTime(data.date, data.start);
  const dtEnd = toIcsDateTime(data.date, data.end);
  const now = Utilities.formatDate(new Date(), "Europe/Paris", "yyyyMMdd'T'HHmmss'Z'");
  const uid = Utilities.getUuid() + "@planning-faq";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Planning FAQ Numerique//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + uid,
    "DTSTAMP:" + now,
    "DTSTART:" + dtStart,
    "DTEND:" + dtEnd,
    "SUMMARY:" + escapeIcs(title),
    "LOCATION:" + escapeIcs(data.structure || ""),
    "DESCRIPTION:" + escapeIcs(description),
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\\r\\n");
}

function toIcsDateTime(dateValue, timeValue) {
  const parts = dateValue.split("-");
  const time = timeValue.split(":");
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), Number(time[0]), Number(time[1]), 0);
  return Utilities.formatDate(date, "Europe/Paris", "yyyyMMdd'T'HHmmss");
}

function escapeIcs(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function doGet() {
  return ContentService
    .createTextOutput("Service mail FAQ numérique actif.")
    .setMimeType(ContentService.MimeType.TEXT);
}
