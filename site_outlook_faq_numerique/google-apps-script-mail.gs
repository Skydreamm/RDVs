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
    const paPerson = data.person || "";
    const paDemande = data.need || "";

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
      "Nom / prénom : " + paPerson,
      "Demande : " + paDemande,
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
      "PA_PERSON=" + paPerson,
      "PA_DEMANDE=" + paDemande,
      "----- FIN POWER AUTOMATE -----",
      "",
      "Message envoyé automatiquement depuis le site Planning & FAQ Numérique."
    ].filter(String).join("\n");

    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: subject,
      body: body,
      name: "Planning FAQ Numérique"
    });

    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: "[Planning FAQ] Erreur notification",
      body: "Erreur Apps Script : " + String(error),
      name: "Planning FAQ Numérique"
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(error) })).setMimeType(ContentService.MimeType.JSON);
  }
}

function buildPowerAutomateTitle(data) {
  const action = data.action || "Planning FAQ";
  const person = data.person || "";
  const title = data.title || "";
  if (person) return action + " - " + person;
  if (title) return action + " - " + title;
  return action;
}

function doGet() {
  return ContentService.createTextOutput("Service mail FAQ numérique actif.").setMimeType(ContentService.MimeType.TEXT);
}
