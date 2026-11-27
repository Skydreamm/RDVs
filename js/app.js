const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const HOURS = Array.from({ length: 13 }, (_, i) => `${String(i + 8).padStart(2, "0")}:00`);
const DAY_START_MINUTES = 8 * 60;
const DAY_END_MINUTES = 20 * 60;
const MINUTE_HEIGHT = 2;

const STORAGE_KEYS = {
  session: "rdvs_session_v1",
  planning: "rdvs_planning_v1",
  faq: "rdvs_faq_v1",
  structures: "rdvs_structures_v1"
};

const DEFAULT_STRUCTURES = [
  { id: "europe", name: "Europe", color: "#2563eb" },
  { id: "artois-champagne", name: "Artois Champagne", color: "#f97316" },
  { id: "neuville", name: "Neuville", color: "#16a34a" },
  { id: "quentin-web", name: "Quentin Web", color: "#7c3aed" },
  { id: "benjamin-rouche", name: "Benjamin Rouché", color: "#db2777" },
  { id: "autre", name: "Autre", color: "#64748b" }
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let currentUser = null;
let planningItems = load(STORAGE_KEYS.planning, []);
let faqItems = load(STORAGE_KEYS.faq, []);
let structures = load(STORAGE_KEYS.structures, DEFAULT_STRUCTURES);
let currentWeekStart = getMonday(new Date());
let syncTimer = null;
let lastLoadAt = null;
let isEditingStructureColor = false;
let pauseSyncUntil = 0;

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEYS.planning, JSON.stringify(planningItems));
  localStorage.setItem(STORAGE_KEYS.faq, JSON.stringify(faqItems));
  localStorage.setItem(STORAGE_KEYS.structures, JSON.stringify(structures));
}

function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "id_" + Date.now() + "_" + Math.random().toString(16).slice(2);
}

function getSyncUrl() {
  const url = window.APP_CONFIG?.syncDataUrl || window.APP_CONFIG?.googleScriptUrl || "";
  if (!url || url.includes("COLLE_ICI")) return "";
  return url;
}

function setSyncLabel(text, type = "neutral") {
  const el = $("#sync-label");
  if (!el) return;
  el.textContent = text;
  if (type === "ok") {
    el.style.background = "#dcfce7";
    el.style.color = "#166534";
  } else if (type === "error") {
    el.style.background = "#fee2e2";
    el.style.color = "#991b1b";
  } else {
    el.style.background = "#f1f5f9";
    el.style.color = "#475569";
  }
}

function syncSharedDataDebounced(payload) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => postToAppsScript(payload), 500);
}

async function postToAppsScript(payload) {
  const url = getSyncUrl();

  if (!url) {
    setSyncLabel("Mode local : URL Apps Script non configurée", "error");
    return;
  }

  const bodyToSend = payload.mail
    ? {
        ...payload,
        ...payload.mail
      }
    : payload;

  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(bodyToSend)
    });

    setSyncLabel("Synchronisation envoyée", "ok");
  } catch (error) {
    console.warn("Synchronisation impossible :", error);
    setSyncLabel("Erreur de synchronisation", "error");
  }
}

function loadJsonp(url) {
  return new Promise((resolve, reject) => {
    const callbackName = "jsonpCallback_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    let finished = false;
    const script = document.createElement("script");

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      delete window[callbackName];
      if (script.parentNode) script.remove();
      reject(new Error("Temps dépassé pour le chargement des données partagées"));
    }, 5000);

    window[callbackName] = function (data) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      delete window[callbackName];
      if (script.parentNode) script.remove();
      resolve(data);
    };

    const separator = url.includes("?") ? "&" : "?";
    script.src = url + separator + "action=load&callback=" + encodeURIComponent(callbackName) + "&t=" + Date.now();
    script.onerror = function () {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      delete window[callbackName];
      if (script.parentNode) script.remove();
      reject(new Error("Impossible de charger les données partagées"));
    };

    document.body.appendChild(script);
  });
}

async function loadSharedData() {
  const url = getSyncUrl();
  if (!url) {
    setSyncLabel("Mode local : configure data/config.js", "error");
    return false;
  }

  try {
    setSyncLabel("Chargement des données partagées...", "neutral");
    const data = await loadJsonp(url);

    if (!data || !data.ok) {
      setSyncLabel("Données partagées non disponibles", "error");
      return false;
    }

    planningItems = Array.isArray(data.planning) ? data.planning : [];
    faqItems = Array.isArray(data.faq) ? data.faq : [];
    structures = Array.isArray(data.structures) && data.structures.length ? data.structures : DEFAULT_STRUCTURES;
    saveLocal();

    lastLoadAt = new Date();
    setSyncLabel("Synchronisé à " + lastLoadAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), "ok");
    return true;
  } catch (error) {
    console.warn("Chargement des données partagées impossible :", error);
    setSyncLabel("Impossible de charger Google Sheets", "error");
    return false;
  }
}

function toDateInputValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function getMonday(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function formatDateFr(date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" }).format(date);
}

function formatDateLongFr(date) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function getWeekDates() {
  return DAYS.map((day, index) => {
    const date = addDays(currentWeekStart, index);
    return { day, date, dateValue: toDateInputValue(date), label: `${day} ${formatDateFr(date)}` };
  });
}

function minutes(timeValue) {
  const [h, m] = String(timeValue || "00:00").split(":").map(Number);
  return (h * 60) + (m || 0);
}

function slug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "structure";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
  }[c]));
}

function findStructure(nameOrId) {
  return structures.find(s => s.id === nameOrId || s.name === nameOrId) || {
    id: "autre",
    name: nameOrId || "Autre",
    color: "#64748b"
  };
}

function isAdmin() {
  return currentUser?.role === "admin";
}

function dayFromDate(dateValue) {
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T12:00:00`);
  const names = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  return names[date.getDay()];
}

function formatSlotLabel(slot) {
  const structure = findStructure(slot.structureId || slot.place);
  const dateText = slot.date
    ? new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(`${slot.date}T12:00:00`))
    : slot.day;
  return `${dateText} · ${slot.start}–${slot.end} · ${structure.name}`;
}

function faqSlots() {
  return planningItems
    .filter(item => item.type === "faq")
    .sort((a, b) => `${a.date || ""} ${a.start}`.localeCompare(`${b.date || ""} ${b.start}`));
}

function init() {
  localStorage.removeItem(STORAGE_KEYS.session);

  applySavedTheme();
  $("#theme-toggle").addEventListener("click", toggleTheme);
  
  $("#login-form").addEventListener("submit", onLogin);
  $("#logout-btn").addEventListener("click", logout);
  $("#refresh-btn").addEventListener("click", refreshNow);
  $("#planning-form").addEventListener("submit", addPlanningItem);
  $("#planning-type").addEventListener("change", syncPlanningTitleWithType);
 $("#planning-recurrence")?.addEventListener("change", toggleRecurrenceEndField);
  $("#planning-date")?.addEventListener("change", syncDefaultRecurrenceEndDate);
  $("#duplicate-week-btn")?.addEventListener("click", duplicateDisplayedWeek);
  $("#faq-form").addEventListener("submit", addFaqItem);
  $("#faq-slot").addEventListener("change", applySelectedSlotToFaqForm);
  $("#faq-date").addEventListener("change", validateFaqFormLive);
  $("#faq-start").addEventListener("change", validateFaqFormLive);
  $("#faq-end").addEventListener("change", validateFaqFormLive);
  $("#faq-place").addEventListener("change", validateFaqFormLive);
  $("#export-faq").addEventListener("click", exportFaqCsv);
  $("#clear-demo").addEventListener("click", clearAllData);
  $("#structure-form").addEventListener("submit", addStructure);
  $("#prev-week").addEventListener("click", () => changeWeek(-7));
  $("#next-week").addEventListener("click", () => changeWeek(7));
  $("#detail-modal-close").addEventListener("click", closeDetailModal);
  $("#detail-modal").addEventListener("click", (event) => {
    if (event.target.id === "detail-modal") closeDetailModal();
  });

  $$(".tab-btn").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

  $("#duplicate-select-all")?.addEventListener("click", () => {
    $$("#duplicate-slots-list input[type='checkbox']").forEach(cb => cb.checked = true);
  });
  $("#duplicate-unselect-all")?.addEventListener("click", () => {
    $$("#duplicate-slots-list input[type='checkbox']").forEach(cb => cb.checked = false);
  });
  
  const today = new Date();
  $("#faq-date").value = toDateInputValue(today);
  $("#planning-date").value = toDateInputValue(today);
  renderStructureOptions();
  updateWeekLabel();

  loadSharedData().then((loaded) => {
    if (loaded && currentUser) renderAll();
  });

  const refreshSeconds = Number(window.APP_CONFIG?.refreshSeconds || 2);

  setInterval(async () => {
    // Ne pas écraser l'interface si l'utilisateur est en train de choisir une couleur
    // ou juste après une sauvegarde (le temps que Google Sheets enregistre)
    if (isEditingStructureColor || Date.now() < pauseSyncUntil) return;

    const loaded = await loadSharedData();

    if (loaded && currentUser && !isEditingStructureColor && Date.now() >= pauseSyncUntil) {
      renderAll();
    }
  }, Math.max(refreshSeconds, 1) * 1000);

  window.addEventListener("focus", refreshNow);
}

async function refreshNow() {
  const loaded = await loadSharedData();

  if (loaded && currentUser) {
    renderAll();
  }
}

function onLogin(event) {
  event.preventDefault();

  const username = $("#username").value.trim();
  const password = $("#password").value;

  const users = Array.isArray(window.APP_USERS) ? window.APP_USERS : [];
  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    $("#login-error").hidden = false;
    return;
  }

  login(user);
}

function login(user) {
  currentUser = user;

  const loginScreen = $("#login-screen");
  const appScreen = $("#app-screen");

  $("#login-error").hidden = true;

  $("#user-label").textContent = `${user.name} — ${user.role === "admin" ? "Administrateur" : "Collègue"}`;

  loginScreen.classList.add("opening");

  setTimeout(() => {
    document.body.classList.add("app-ready");

    loginScreen.hidden = true;
    loginScreen.classList.remove("opening");

    appScreen.hidden = false;

    try {
      setupRoleDisplay();
      renderStructureOptions();
      renderAll();
    } catch (error) {
      console.error("Erreur après connexion :", error);
      alert("Connexion OK, mais erreur d'affichage. Regarde la console F12.");
    }

    refreshNow();
  }, 650);
}

function logout() {
  currentUser = null;
  $("#app-screen").hidden = true;
  $("#login-screen").hidden = false;
  $("#login-form").reset();
  $("#login-error").hidden = true;
  $("#username").focus();
}

function setupRoleDisplay() {
  $$(".admin-only").forEach(el => el.hidden = !isAdmin());
  if (!isAdmin() && $("#structures").classList.contains("active")) switchTab("planning");
  $("#planning-help").textContent = isAdmin()
    ? "Tu peux créer ici les créneaux qui seront visibles sur tous les PC."
    : "Tu peux consulter les créneaux créés par l'admin et ajouter des rendez-vous FAQ.";
}

function switchTab(tabId) {
  if (tabId === "structures" && !isAdmin()) tabId = "planning";
  $$(".tab-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabId));
  $$(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === tabId));
  if (tabId === "faq") renderFaqSlots();
}

function changeWeek(days) {
  currentWeekStart = addDays(currentWeekStart, days);
  $("#planning-date").value = toDateInputValue(currentWeekStart);
  updateWeekLabel();
  renderAll();
}

function updateWeekLabel() {
  const weekNum = getISOWeekNumber(currentWeekStart);
  $("#week-label").innerHTML = `
    <span class="week-num-pill">Semaine n° ${weekNum}</span>
    Semaine du ${formatDateLongFr(currentWeekStart)} au ${formatDateLongFr(addDays(currentWeekStart, 6))}
  `;

  // Pré-remplit par défaut le lundi de la semaine suivante et 4 semaines plus tard
  const nextMonday = addDays(currentWeekStart, 7);
  const defaultEnd = addDays(nextMonday, 27);
  if ($("#duplicate-start-date") && !$("#duplicate-start-date").value) {
    $("#duplicate-start-date").value = toDateInputValue(nextMonday);
  }
  if ($("#duplicate-end-date") && !$("#duplicate-end-date").value) {
    $("#duplicate-end-date").value = toDateInputValue(defaultEnd);
  }
}

function syncPlanningTitleWithType() {
  if ($("#planning-type").value === "faq") {
    $("#planning-title").value = "FAQ Numérique";
  }
}

function toggleRecurrenceEndField() {
  const interval = parseInt($("#planning-recurrence")?.value || "0", 10);
  const wrap = $("#planning-recurrence-end-wrap");
  if (wrap) wrap.hidden = interval === 0;
  if (interval > 0) syncDefaultRecurrenceEndDate();
}

function syncDefaultRecurrenceEndDate() {
  const startVal = $("#planning-date")?.value;
  const endInput = $("#planning-recurrence-end");
  if (!startVal || !endInput) return;

  // Pré-remplit par défaut 1 mois plus tard si vide ou antérieur à la date de début
  if (!endInput.value || endInput.value < startVal) {
    endInput.value = toDateInputValue(addDays(new Date(`${startVal}T12:00:00`), 28));
  }
  endInput.min = startVal;
}

async function syncMultipleItems(payloads) {
  for (const payload of payloads) {
    await postToAppsScript(payload);
    await new Promise(r => setTimeout(r, 180));
  }
}

function addPlanningItem(event) {
  event.preventDefault();
  if (!isAdmin()) return alert("Seul l'admin peut ajouter des créneaux dans le planning.");

  const dateValue = $("#planning-date").value;
  const start = $("#planning-start").value;
  const end = $("#planning-end").value;
  const type = $("#planning-type").value;
  const title = type === "faq" ? "FAQ Numérique" : $("#planning-title").value.trim();
  const structureId = $("#planning-place").value;
  const structure = findStructure(structureId);

  const intervalWeeks = parseInt($("#planning-recurrence")?.value || "0", 10);
  const isRecurring = intervalWeeks > 0;
  const recurrenceEndStr = $("#planning-recurrence-end")?.value || "";

  if (!dateValue) return alert("Choisis une date.");
  if (minutes(end) <= minutes(start)) return alert("L'heure de fin doit être après l'heure de début.");

  if (isRecurring) {
    if (!recurrenceEndStr) {
      return alert("Choisis une date butoir pour la récurrence.");
    }
    if (recurrenceEndStr < dateValue) {
      return alert("La date butoir doit être après la date de début.");
    }
  }

  const baseDate = new Date(`${dateValue}T12:00:00`);
  const limitDate = isRecurring ? new Date(`${recurrenceEndStr}T23:59:59`) : baseDate;

  // On génère un recurrenceId uniquement s'il y a au moins 2 occurrences
  const previewDates = [];
  let cursor = new Date(baseDate);
  while (cursor <= limitDate) {
    previewDates.push(toDateInputValue(cursor));
    if (!isRecurring) break;
    cursor = addDays(cursor, intervalWeeks * 7);
  }

  const recurrenceId = previewDates.length > 1
    ? "rec_" + Date.now() + "_" + Math.random().toString(16).slice(2, 6)
    : "";

  const createdItems = [];

  for (const targetDateStr of previewDates) {
    const newItem = {
      id: uid(),
      ownerId: currentUser.id,
      ownerName: currentUser.name,
      date: targetDateStr,
      day: dayFromDate(targetDateStr),
      start,
      end,
      type,
      title,
      structureId,
      place: structure.name,
      color: structure.color,
      recurrenceId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    planningItems.push(newItem);
    createdItems.push(newItem);
  }

  currentWeekStart = getMonday(baseDate);
  saveLocal();
  renderAll();

  if (createdItems.length === 1) {
    syncSharedDataDebounced({
      type: "upsert-planning",
      item: createdItems[0],
      notify: window.APP_CONFIG?.enableMailNotification === true,
      mail: buildPlanningMail("Créneau planning ajouté", createdItems[0])
    });
  } else {
    syncMultipleItems(createdItems.map(item => ({
      type: "upsert-planning",
      item,
      notify: window.APP_CONFIG?.enableMailNotification === true,
      mail: buildPlanningMail("Créneau planning ajouté", item)
    })));
  }

  event.target.reset();
  $("#planning-date").value = dateValue;
  $("#planning-start").value = "09:00";
  $("#planning-end").value = "10:00";
  $("#planning-type").value = "faq";
  $("#planning-title").value = "FAQ Numérique";
  if ($("#planning-recurrence")) $("#planning-recurrence").value = "0";
  toggleRecurrenceEndField();
  renderStructureOptions();
}

function normalizeDateStr(val) {
  if (!val) return "";
  // Gère "2026-01-12" comme "2026-01-12T00:00:00.000Z"
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  return str;
}

function renderDuplicateSlotsPicker() {
  const container = $("#duplicate-slots-list");
  if (!container) return;

  const weekDates = getWeekDates().map(d => d.dateValue);
  const weekSlots = planningItems
    .filter(item => weekDates.includes(normalizeDateStr(item.date)))
    .sort((a, b) => `${normalizeDateStr(a.date)} ${a.start}`.localeCompare(`${normalizeDateStr(b.date)} ${b.start}`));

  if (!weekSlots.length) {
    container.innerHTML = `<span class="muted" style="font-size:0.83rem;">Aucun créneau sur cette semaine.</span>`;
    return;
  }

  // Conserve l'état décoché si l'utilisateur avait décoché un créneau avant un refresh
  const previousUnchecked = new Set(
    [...container.querySelectorAll("input[type='checkbox']")]
      .filter(cb => !cb.checked)
      .map(cb => String(cb.value))
  );

  container.innerHTML = weekSlots.map(slot => {
    const cleanDate = normalizeDateStr(slot.date);
    const structure = findStructure(slot.structureId || slot.place);
    const color = structure.color || slot.color || "#2563eb";
    const dayName = dayFromDate(cleanDate).slice(0, 3);
    const isChecked = !previousUnchecked.has(String(slot.id));

    return `
      <label class="duplicate-slot-chip" style="--chip-color:${escapeHtml(color)}">
        <input type="checkbox" value="${escapeHtml(slot.id)}" ${isChecked ? "checked" : ""} />
        <span><strong>${escapeHtml(dayName)}</strong> ${escapeHtml(slot.start)}–${escapeHtml(slot.end)} · ${escapeHtml(slot.title)} <em>(${escapeHtml(structure.name)})</em></span>
      </label>
    `;
  }).join("");
}

function duplicateDisplayedWeek() {
  if (!isAdmin()) return alert("Seul l'admin peut dupliquer une semaine.");

  const checkedIds = new Set(
    $$("#duplicate-slots-list input[type='checkbox']:checked").map(cb => String(cb.value))
  );

  const sourceSlots = planningItems.filter(item => checkedIds.has(String(item.id)));

  if (!sourceSlots.length) {
    return alert("Coche au moins un atelier à dupliquer.");
  }

  const startDateStr = $("#duplicate-start-date")?.value;
  const endDateStr = $("#duplicate-end-date")?.value;
  const intervalWeeks = Math.min(12, Math.max(1, parseInt($("#duplicate-interval-weeks")?.value, 10) || 1));

  if (!startDateStr || !endDateStr) {
    return alert("Choisis une date de début et une date de fin pour la duplication.");
  }

  const targetFirstMonday = getMonday(new Date(`${startDateStr}T12:00:00`));
  const limitDate = new Date(`${endDateStr}T23:59:59`);

  if (limitDate < targetFirstMonday) {
    return alert("La date de fin doit être après la date de début.");
  }

  const createdItems = [];
  let currentTargetMonday = new Date(targetFirstMonday);
  let targetWeeksCount = 0;

  while (currentTargetMonday <= limitDate) {
    const daysOffset = Math.round((currentTargetMonday - currentWeekStart) / 86400000);
    let weekHasAtLeastOneSlot = false;

    for (const slot of sourceSlots) {
      const cleanDate = normalizeDateStr(slot.date);
      const shiftedDateObj = addDays(new Date(`${cleanDate}T12:00:00`), daysOffset);
      if (shiftedDateObj > limitDate) continue;

      const shiftedDateStr = toDateInputValue(shiftedDateObj);
      const structure = findStructure(slot.structureId || slot.place);

      const copy = {
        ...slot,
        id: uid(),
        date: shiftedDateStr,
        day: dayFromDate(shiftedDateStr),
        color: structure.color,
        place: structure.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      createdItems.push(copy);
      weekHasAtLeastOneSlot = true;
    }

    if (weekHasAtLeastOneSlot) targetWeeksCount++;
    currentTargetMonday = addDays(currentTargetMonday, intervalWeeks * 7);
  }

  if (!createdItems.length) {
    return alert("Aucun créneau ne tombe dans la plage de dates sélectionnée.");
  }

  if (!confirm(
    `Copier les ${sourceSlots.length} atelier(s) coché(s) sur ${targetWeeksCount} semaine(s) ` +
    `(toutes les ${intervalWeeks} semaine(s) du ${startDateStr} au ${endDateStr}), soit ${createdItems.length} créneau(x) au total ?`
  )) {
    return;
  }

  planningItems.push(...createdItems);
  saveLocal();
  renderAll();

  syncMultipleItems(createdItems.map(item => ({
    type: "upsert-planning",
    item,
    notify: window.APP_CONFIG?.enableMailNotification === true,
    mail: buildPlanningMail("Créneau planning ajouté", item)
  })));

  alert(`✅ ${createdItems.length} créneau(x) créé(s) et envoyé(s) vers Outlook !`);
}

function deletePlanningItem(id) {
  if (!isAdmin()) return alert("Seul l'admin peut supprimer un créneau.");
  const item = planningItems.find(p => p.id === id);
  if (!item) return;

  // Si l'événement fait partie d'une série récurrente, proposer le choix style Google Calendar
  if (item.recurrenceId) {
    const followingCount = planningItems.filter(
      p => p.recurrenceId === item.recurrenceId && p.date >= item.date
    ).length;

    if (followingCount > 1) {
      openRecurrenceChoiceModal({
        actionLabel: "Supprimer l'atelier périodique",
        confirmLabel: "Supprimer",
        confirmClass: "danger-btn",
        onConfirm: (scope) => executePlanningDelete(item, scope)
      });
      return;
    }
  }

  const linkedFaq = faqItems.filter(f => f.slotId === id);
  const message = linkedFaq.length
    ? `Ce créneau contient ${linkedFaq.length} rendez-vous. Supprimer quand même ?`
    : "Supprimer ce créneau ?";

  if (!confirm(message)) return;
  executePlanningDelete(item, "single");
}

function executePlanningDelete(item, scope) {
  const targets = scope === "following" && item.recurrenceId
    ? planningItems.filter(p => p.recurrenceId === item.recurrenceId && p.date >= item.date)
    : [item];

  const targetIds = new Set(targets.map(t => t.id));
  planningItems = planningItems.filter(p => !targetIds.has(p.id));
  faqItems = faqItems.filter(f => !targetIds.has(f.slotId));

  saveLocal();
  renderAll();

  if (targets.length === 1) {
    syncSharedDataDebounced({
      type: "delete-planning",
      id: item.id,
      notify: window.APP_CONFIG?.enableMailNotification === true,
      mail: buildPlanningMail("Créneau planning supprimé", item)
    });
  } else {
    syncMultipleItems(targets.map((t, idx) => ({
      type: "delete-planning",
      id: t.id,
      notify: idx === 0 && window.APP_CONFIG?.enableMailNotification === true,
      mail: buildPlanningMail(`Série supprimée (${targets.length} créneaux)`, t)
    })));
  }
}

function addFaqItem(event) {
  event.preventDefault();

  const selectedSlotId = $("#faq-slot").value;
  const slot = faqSlots().find(s => s.id === selectedSlotId);
  const error = $("#faq-form-error");
  error.hidden = true;
  error.textContent = "";

  if (!slot) {
    error.textContent = "Aucun créneau FAQ numérique autorisé n'est sélectionné.";
    error.hidden = false;
    return;
  }

  const dateValue = $("#faq-date").value;
  const start = $("#faq-start").value;
  const end = $("#faq-end").value;
  const place = $("#faq-place").value;
  const validation = validateFaqAgainstSlot(slot, dateValue, start, end, place);

  if (!validation.ok) {
    error.textContent = validation.message;
    error.hidden = false;
    return;
  }

  const overlapValidation = validateNoFaqOverlap(dateValue, start, end, place);
  if (!overlapValidation.ok) {
    error.textContent = overlapValidation.message;
    error.hidden = false;
    return;
  }

  const newItem = {
    id: uid(),
    slotId: slot.id,
    ownerId: currentUser.id,
    ownerName: currentUser.name,
    date: dateValue,
    day: dayFromDate(dateValue),
    start,
    end,
    structureId: place,
    place: findStructure(place).name,
    person: $("#faq-person").value.trim(),
    need: $("#faq-need").value.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  faqItems.push(newItem);
  saveLocal();
  renderAll();

  syncSharedDataDebounced({
    type: "upsert-faq",
    item: newItem,
    notify: window.APP_CONFIG?.enableMailNotification === true,
    mail: buildFaqMail("Rendez-vous FAQ ajouté", newItem, slot)
  });

  $("#faq-person").value = "";
  $("#faq-need").value = "";
}

function deleteFaqItem(id) {
  const item = faqItems.find(f => f.id === id);
  if (!item) return;

  if (!isAdmin() && item.ownerId !== currentUser?.id) {
    return alert("Tu peux supprimer uniquement les rendez-vous que tu as ajoutés.");
  }

  if (!confirm("Supprimer ce rendez-vous ?")) return;
  faqItems = faqItems.filter(f => f.id !== id);
  saveLocal();
  renderAll();

  syncSharedDataDebounced({
    type: "delete-faq",
    id,
    notify: window.APP_CONFIG?.enableMailNotification === true,
    mail: buildFaqMail("Rendez-vous FAQ supprimé", item, planningItems.find(p => p.id === item.slotId))
  });
}

function validateFaqAgainstSlot(slot, dateValue, start, end, place) {
  if (!dateValue || !start || !end || !place) {
    return { ok: false, message: "Tous les champs du rendez-vous sont obligatoires." };
  }
  if (dateValue !== slot.date) {
    return { ok: false, message: "La date doit correspondre au créneau FAQ sélectionné." };
  }
  if (place !== slot.structureId) {
    return { ok: false, message: "La structure doit correspondre au créneau FAQ sélectionné." };
  }
  if (minutes(start) < minutes(slot.start) || minutes(end) > minutes(slot.end)) {
    return { ok: false, message: "L'horaire doit rester dans le créneau FAQ sélectionné." };
  }
  if (minutes(end) <= minutes(start)) {
    return { ok: false, message: "L'heure de fin doit être après l'heure de début." };
  }
  return { ok: true };
}

function validateNoFaqOverlap(dateValue, start, end, place) {
  const newStart = minutes(start);
  const newEnd = minutes(end);
  const overlap = faqItems.some(item => {
    if (item.date !== dateValue || item.structureId !== place) return false;
    const existingStart = minutes(item.start);
    const existingEnd = minutes(item.end);
    return newStart < existingEnd && newEnd > existingStart;
  });

  if (overlap) {
    return { ok: false, message: "Un rendez-vous existe déjà sur ce même horaire et cette structure." };
  }
  return { ok: true };
}

function validateFaqFormLive() {
  const error = $("#faq-form-error");
  if (!$("#faq-slot").value) return;

  const slot = faqSlots().find(s => s.id === $("#faq-slot").value);
  if (!slot) return;

  const validation = validateFaqAgainstSlot(
    slot,
    $("#faq-date").value,
    $("#faq-start").value,
    $("#faq-end").value,
    $("#faq-place").value
  );

  error.textContent = validation.ok ? "" : validation.message;
  error.hidden = validation.ok;
}

function applySelectedSlotToFaqForm() {
  const slot = faqSlots().find(s => s.id === $("#faq-slot").value);
  if (!slot) return;

  $("#faq-date").value = slot.date;
  $("#faq-start").value = slot.start;
  $("#faq-end").value = slot.end;
  $("#faq-place").value = slot.structureId;
  validateFaqFormLive();
}

function addStructure(event) {
  event.preventDefault();
  if (!isAdmin()) return alert("Seul l'admin peut ajouter une structure.");

  const name = $("#structure-name").value.trim();
  const color = $("#structure-color").value;
  if (!name) return;

  const id = slug(name);
  if (structures.some(s => s.id === id || s.name.toLowerCase() === name.toLowerCase())) {
    return alert("Cette structure existe déjà.");
  }

  const item = { id, name, color };
  structures.push(item);
  saveLocal();
  renderAll();

  syncSharedDataDebounced({ type: "upsert-structure", item });
  event.target.reset();
  $("#structure-color").value = "#2563eb";
}

function updateStructureColor(id, newColor) {
  pauseSyncUntil = Date.now() + 5000;
  if (!isAdmin()) return;
  const structure = structures.find(s => s.id === id);
  if (!structure || structure.color === newColor) return;

  structure.color = newColor;

  // Met à jour la couleur stockée sur les créneaux existants de cette structure
  const impactedSlots = [];
  planningItems.forEach(item => {
    if (item.structureId === id) {
      item.color = newColor;
      item.updatedAt = new Date().toISOString();
      impactedSlots.push(item);
    }
  });

  saveLocal();
  renderAll();

  // Synchronise la structure + les créneaux impactés
  syncMultipleItems([
    { type: "upsert-structure", item: structure },
    ...impactedSlots.map(slot => ({
      type: "upsert-planning",
      item: slot,
      notify: false
    }))
  ]);
}

function deleteStructure(id) {
  if (!isAdmin()) return;
  const used = planningItems.some(p => p.structureId === id) || faqItems.some(f => f.structureId === id);
  if (used) return alert("Impossible de supprimer cette structure car elle est utilisée dans le planning ou les rendez-vous.");
  if (!confirm("Supprimer cette structure ?")) return;

  structures = structures.filter(s => s.id !== id);
  saveLocal();
  renderAll();
  syncSharedDataDebounced({ type: "delete-structure", id });
}

function renderAll() {
  setupRoleDisplay();
  renderStructureOptions();
  updateWeekLabel();
  renderPlanning();
  renderDuplicateSlotsPicker()
  renderFaqSlots();
  renderFaqList();
  renderStructures();
}

function renderStructureOptions() {
  const optionHtml = structures.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join("");
  ["#planning-place", "#faq-place"].forEach(selector => {
    const el = $(selector);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = optionHtml;
    if (structures.some(s => s.id === prev)) el.value = prev;
  });
}

function renderPlanning() {
  const grid = $("#planning-grid");
  const dates = getWeekDates();
  const totalHeight = (DAY_END_MINUTES - DAY_START_MINUTES) * MINUTE_HEIGHT;

  grid.innerHTML = dates.map(({ day, dateValue, label }) => {
    const planningCards = planningItems
      .filter(item => item.date === dateValue)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map(item => eventCardHtml(item))
      .join("");

    const faqCards = faqItems
      .filter(item => item.date === dateValue)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map(item => faqOverlayCardHtml(item))
      .join("");

    return `
      <section class="day-column" data-day="${escapeHtml(day)}">
        <div class="day-title">
          <strong>${escapeHtml(day)}</strong>
          <small>${escapeHtml(label.replace(day, "").trim())}</small>
        </div>

        <div class="day-timeline" style="height:${totalHeight}px">
          ${hourLinesHtml()}
          ${currentTimeLineHtml(dateValue)}
          ${planningCards}
          ${faqCards}
        </div>
      </section>
    `;
  }).join("");

  grid.querySelectorAll("[data-action='detail-planning']").forEach(btn => {
    btn.addEventListener("click", () => showPlanningDetails(btn.dataset.id));
  });

  grid.querySelectorAll("[data-action='detail-faq']").forEach(btn => {
    btn.addEventListener("click", () => showFaqDetails(btn.dataset.id));
  });
}

renderDuplicateSlotsPicker();

function hourLinesHtml() {
  return HOURS.map(hour => `
    <div class="hour-line">
      <span>${escapeHtml(hour)}</span>
    </div>
  `).join("");
}

function currentTimeLineHtml(dateValue) {
  const today = toDateInputValue(new Date());
  if (dateValue !== today) return "";

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (nowMinutes < DAY_START_MINUTES || nowMinutes > DAY_END_MINUTES) {
    return "";
  }

  const top = (nowMinutes - DAY_START_MINUTES) * MINUTE_HEIGHT;

  const label = now.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  });

  return `
    <div class="current-time-line" style="top:${top}px">
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function eventCardHtml(item) {
  const structure = findStructure(item.structureId || item.place);

  const startMinutes = minutes(item.start);
  const endMinutes = minutes(item.end);

  const visibleStart = Math.max(startMinutes, DAY_START_MINUTES);
  const visibleEnd = Math.min(endMinutes, DAY_END_MINUTES);

  const top = Math.max(0, (visibleStart - DAY_START_MINUTES) * MINUTE_HEIGHT);
  const height = Math.max(42, (visibleEnd - visibleStart) * MINUTE_HEIGHT);

  // Priorité à la couleur à jour de la structure pour répercussion immédiate
  const color = structure.color || item.color;

  return `
    <button
      type="button"
      class="activity-card timeline-card planning-click-card ${item.type === "faq" ? "faq-slot-card" : ""}"
      style="
        top:${top}px;
        --slot-height:${height}px;
        height:${height}px;
        --card-color:${escapeHtml(color)};
      "
      data-action="detail-planning"
      data-id="${escapeHtml(item.id)}"
    >
      <strong>${escapeHtml(item.title)} ${item.recurrenceId ? "🔁" : ""}</strong>
      <span class="activity-meta">${escapeHtml(item.start)} - ${escapeHtml(item.end)}</span>
      <span class="activity-meta">${escapeHtml(structure.name)}</span>
      ${item.type === "faq" ? `<span class="slot-badge">FAQ Numérique</span>` : ""}
    </button>
  `;
}

function faqOverlayCardHtml(item) {
  const structure = findStructure(item.structureId || item.place);

  const startMinutes = minutes(item.start);
  const endMinutes = minutes(item.end);

  const visibleStart = Math.max(startMinutes, DAY_START_MINUTES);
  const visibleEnd = Math.min(endMinutes, DAY_END_MINUTES);

  const top = Math.max(0, (visibleStart - DAY_START_MINUTES) * MINUTE_HEIGHT);
  const height = Math.max(36, (visibleEnd - visibleStart) * MINUTE_HEIGHT);

  return `
    <button
      type="button"
      class="activity-card timeline-card planning-click-card faq-rdv-overlay"
      style="
        top:${top}px;
        --slot-height:${height}px;
        height:${height}px;
        --card-color:${escapeHtml(structure.color)};
      "
      data-action="detail-faq"
      data-id="${escapeHtml(item.id)}"
    >
      <strong>${escapeHtml(item.person || "Rendez-vous")}</strong>
      <span class="activity-meta">${escapeHtml(item.start)} - ${escapeHtml(item.end)}</span>
      <span class="activity-meta">${escapeHtml(structure.name)}</span>
    </button>
  `;
}

function renderFaqSlots() {
  const select = $("#faq-slot");
  const container = $("#available-slots");
  const slots = faqSlots();

  if (!slots.length) {
    select.innerHTML = `<option value="">Aucun créneau FAQ disponible</option>`;
    container.innerHTML = `<div class="empty-state">Aucun créneau FAQ n'a encore été créé.</div>`;
    return;
  }

  select.innerHTML = slots.map(slot => `<option value="${escapeHtml(slot.id)}">${escapeHtml(formatSlotLabel(slot))}</option>`).join("");

  container.innerHTML = slots.slice(0, 5).map(slot => {
    const structure = findStructure(slot.structureId);
    return `
      <article class="slot-card" style="border-left-color:${escapeHtml(structure.color || slot.color)}">
        <p><strong>${escapeHtml(formatSlotLabel(slot))}</strong></p>
        <p>${escapeHtml(slot.title)}</p>
      </article>
    `;
  }).join("");

  applySelectedSlotToFaqForm();
}

function renderFaqList() {
  const list = $("#faq-list");
  const items = [...faqItems].sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));

  if (!items.length) {
    list.innerHTML = `<div class="empty-state">Aucun rendez-vous FAQ enregistré.</div>`;
    return;
  }

  list.innerHTML = items.map(item => {
    const structure = findStructure(item.structureId);
    const dateText = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${item.date}T12:00:00`));
    const canDelete = isAdmin() || item.ownerId === currentUser?.id;

    return `
      <article class="faq-card" style="border-left-color:${escapeHtml(structure.color)}">
        <h5>${escapeHtml(item.person)}</h5>
        <p><strong>${escapeHtml(dateText)}</strong></p>
        <p>${escapeHtml(item.start)} - ${escapeHtml(item.end)} · ${escapeHtml(structure.name)}</p>
        <p>${escapeHtml(item.need)}</p>
        <p>Ajouté par : ${escapeHtml(item.ownerName || item.ownerId || "")}</p>
        <div class="card-actions">
          <button type="button" class="small-btn" data-action="detail-faq" data-id="${escapeHtml(item.id)}">Détails</button>
          ${canDelete ? `<button type="button" class="small-btn danger" data-action="delete-faq" data-id="${escapeHtml(item.id)}">Supprimer</button>` : ""}
        </div>
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-action='detail-faq']").forEach(btn => {
    btn.addEventListener("click", () => showFaqDetails(btn.dataset.id));
  });
  list.querySelectorAll("[data-action='delete-faq']").forEach(btn => {
    btn.addEventListener("click", () => deleteFaqItem(btn.dataset.id));
  });
}

function renderStructures() {
  const list = $("#structure-list");

  if (!structures.length) {
    list.innerHTML = `<div class="empty-state">Aucune structure.</div>`;
    return;
  }

  list.innerHTML = structures.map(structure => `
    <article class="structure-card" style="--card-color:${escapeHtml(structure.color)}">
      <label class="color-dot" title="Cliquer pour changer la couleur de la structure">
        ${isAdmin() ? `
          <input
            type="color"
            value="${escapeHtml(structure.color)}"
            data-action="change-structure-color"
            data-id="${escapeHtml(structure.id)}"
          />
        ` : ""}
      </label>

      <div>
        <strong>${escapeHtml(structure.name)}</strong>
        <p class="muted">${escapeHtml(structure.id)}</p>
      </div>

      ${isAdmin() ? `
        <button
          type="button"
          class="delete-small"
          data-action="delete-structure"
          data-id="${escapeHtml(structure.id)}"
        >
          Supprimer
        </button>
      ` : ""}
    </article>
  `).join("");

  // Prévisualisation en direct de la pastille pendant le choix de couleur
  list.querySelectorAll("[data-action='change-structure-color']").forEach(input => {
    // Met en pause l'actualisation dès l'ouverture du sélecteur de couleur
    input.addEventListener("focus", () => {
      isEditingStructureColor = true;
    });
    input.addEventListener("click", () => {
      isEditingStructureColor = true;
    });

    // Prévisualisation en direct sans déclencher d'envoi
    input.addEventListener("input", (e) => {
      isEditingStructureColor = true;
      const card = e.target.closest(".structure-card");
      if (card) card.style.setProperty("--card-color", e.target.value);
    });

    // Validation définitive quand tu fermes/valides la palette
    input.addEventListener("change", (e) => {
      isEditingStructureColor = false;
      pauseSyncUntil = Date.now() + 5000; // Laisse 5s à Google Sheets pour enregistrer
      updateStructureColor(e.target.dataset.id, e.target.value);
    });

    // Si tu fermes la palette sans changer de couleur (Échap ou clic à côté)
    input.addEventListener("blur", () => {
      setTimeout(() => {
        isEditingStructureColor = false;
      }, 300);
    });
  });

  list.querySelectorAll("[data-action='delete-structure']").forEach(btn => {
    btn.addEventListener("click", () => deleteStructure(btn.dataset.id));
  });
}

function showPlanningDetails(id) {
  const item = planningItems.find(p => p.id === id);
  if (!item) return;

  const structure = findStructure(item.structureId);

  $("#detail-modal-title").textContent = item.title;

  $("#detail-modal-content").innerHTML = `
    <p><strong>Date :</strong> ${escapeHtml(item.date)}</p>
    <p><strong>Horaire :</strong> ${escapeHtml(item.start)} - ${escapeHtml(item.end)}</p>
    <p><strong>Structure :</strong> ${escapeHtml(structure.name)}</p>
    <p><strong>Type :</strong> ${item.type === "faq" ? "FAQ Numérique" : "Autre activité"}</p>
    ${item.recurrenceId ? `<p><strong>Récurrence :</strong> 🔁 Atelier hebdomadaire récurrent</p>` : ""}
    <p><strong>Ajouté par :</strong> ${escapeHtml(item.ownerName || item.ownerId || "")}</p>
  `;

  $("#detail-modal-actions").innerHTML = isAdmin()
    ? `
      <button type="button" class="primary-btn" id="modal-edit-planning">Modifier</button>
      <button type="button" class="danger-btn" id="modal-delete-planning">Supprimer</button>
    `
    : "";

  $("#detail-modal").hidden = false;

  const edit = $("#modal-edit-planning");
  if (edit) {
    edit.addEventListener("click", () => {
      editPlanningItem(id);
    });
  }

  const del = $("#modal-delete-planning");
  if (del) {
    del.addEventListener("click", () => {
      closeDetailModal();
      deletePlanningItem(id);
    });
  }
}

function editPlanningItem(id) {
  if (!isAdmin()) return;

  const item = planningItems.find(p => p.id === id);
  if (!item) return;

  const structureOptions = structures.map(structure => `
    <option value="${escapeHtml(structure.id)}" ${structure.id === item.structureId ? "selected" : ""}>
      ${escapeHtml(structure.name)}
    </option>
  `).join("");

  $("#detail-modal-title").textContent = "Modifier le créneau";

  $("#detail-modal-content").innerHTML = `
    <form id="planning-edit-form" class="modal-edit-form">
      <label>Date
        <input id="edit-planning-date" type="date" value="${escapeHtml(item.date)}" required />
      </label>

      <label>Début
        <input id="edit-planning-start" type="time" value="${escapeHtml(item.start)}" required />
      </label>

      <label>Fin
        <input id="edit-planning-end" type="time" value="${escapeHtml(item.end)}" required />
      </label>

      <label>Type
        <select id="edit-planning-type" required>
          <option value="faq" ${item.type === "faq" ? "selected" : ""}>FAQ Numérique</option>
          <option value="other" ${item.type === "other" ? "selected" : ""}>Autre activité</option>
        </select>
      </label>

      <label>Activité
        <input id="edit-planning-title" type="text" value="${escapeHtml(item.title)}" required />
      </label>

      <label>Structure
        <select id="edit-planning-place" required>
          ${structureOptions}
        </select>
      </label>

      <p id="edit-planning-error" class="error-text" hidden></p>
    </form>
  `;

  $("#detail-modal-actions").innerHTML = `
    <button type="button" class="ghost-btn" id="modal-cancel-edit">Annuler</button>
    <button type="button" class="primary-btn" id="modal-save-planning">Enregistrer</button>
  `;

  $("#edit-planning-type").addEventListener("change", () => {
    if ($("#edit-planning-type").value === "faq") {
      $("#edit-planning-title").value = "FAQ Numérique";
    }
  });

  $("#modal-cancel-edit").addEventListener("click", () => {
    showPlanningDetails(id);
  });

  $("#modal-save-planning").addEventListener("click", () => {
    savePlanningEdit(id);
  });
}

function savePlanningEdit(id) {
  if (!isAdmin()) return;

  const item = planningItems.find(p => p.id === id);
  if (!item) return;

  const error = $("#edit-planning-error");

  const newDate = $("#edit-planning-date").value;
  const newStart = $("#edit-planning-start").value;
  const newEnd = $("#edit-planning-end").value;
  const newType = $("#edit-planning-type").value;
  const newTitle = $("#edit-planning-title").value.trim();
  const newStructureId = $("#edit-planning-place").value;

  if (!newDate || !newStart || !newEnd || !newType || !newTitle || !newStructureId) {
    error.textContent = "Tous les champs sont obligatoires.";
    error.hidden = false;
    return;
  }

  if (minutes(newEnd) <= minutes(newStart)) {
    error.textContent = "L'heure de fin doit être après l'heure de début.";
    error.hidden = false;
    return;
  }

  const updatedValues = {
    date: newDate,
    start: newStart,
    end: newEnd,
    type: newType,
    title: newType === "faq" ? "FAQ Numérique" : newTitle,
    structureId: newStructureId
  };

  // Si l'événement est récurrent et a d'autres occurrences suivantes, demander façon Google Calendar
  if (item.recurrenceId) {
    const followingCount = planningItems.filter(
      p => p.recurrenceId === item.recurrenceId && p.date >= item.date
    ).length;

    if (followingCount > 1) {
      openRecurrenceChoiceModal({
        actionLabel: "Modifier l'atelier périodique",
        confirmLabel: "Enregistrer",
        confirmClass: "primary-btn",
        onConfirm: (scope) => applyPlanningEdit(item, updatedValues, scope)
      });
      return;
    }
  }

  applyPlanningEdit(item, updatedValues, "single");
}

function applyPlanningEdit(item, updatedValues, scope) {
  const structure = findStructure(updatedValues.structureId);
  const oldDateObj = new Date(`${item.date}T12:00:00`);
  const newDateObj = new Date(`${updatedValues.date}T12:00:00`);
  const deltaDays = Math.round((newDateObj - oldDateObj) / 86400000);

  const targets = scope === "following" && item.recurrenceId
    ? planningItems.filter(p => p.recurrenceId === item.recurrenceId && p.date >= item.date)
    : [item];

  targets.forEach(target => {
    const shiftedDateStr = target.id === item.id
      ? updatedValues.date
      : toDateInputValue(addDays(new Date(`${target.date}T12:00:00`), deltaDays));

    target.date = shiftedDateStr;
    target.day = dayFromDate(shiftedDateStr);
    target.start = updatedValues.start;
    target.end = updatedValues.end;
    target.type = updatedValues.type;
    target.title = updatedValues.title;
    target.structureId = updatedValues.structureId;
    target.place = structure.name;
    target.color = structure.color;
    target.updatedAt = new Date().toISOString();

    // Si on ne modifie que cet événement d'une série, on le détache de la série
    if (scope === "single" && target.recurrenceId) {
      target.recurrenceId = "";
    }
  });

  currentWeekStart = getMonday(newDateObj);

  saveLocal();
  renderAll();
  closeDetailModal();

  if (targets.length === 1) {
    syncSharedDataDebounced({
      type: "upsert-planning",
      item,
      notify: window.APP_CONFIG?.enableMailNotification === true,
      mail: buildPlanningMail("Créneau planning modifié", item)
    });
  } else {
    syncMultipleItems(targets.map((t, idx) => ({
      type: "upsert-planning",
      item: t,
      notify: idx === 0 && window.APP_CONFIG?.enableMailNotification === true,
      mail: buildPlanningMail(`Série modifiée (${targets.length} créneaux)`, t)
    })));
  }
}

function openRecurrenceChoiceModal({ actionLabel, confirmLabel, confirmClass, onConfirm }) {
  $("#detail-modal-title").textContent = actionLabel;
  $("#detail-modal-content").innerHTML = `
    <p class="muted">Cet atelier fait partie d'une série récurrente. Appliquer ce changement à :</p>
    <div class="recurrence-scope-list">
      <label class="recurrence-scope-option">
        <input type="radio" name="recurrence-scope" value="single" checked />
        <span><strong>Uniquement cet événement</strong></span>
      </label>
      <label class="recurrence-scope-option">
        <input type="radio" name="recurrence-scope" value="following" />
        <span><strong>Cet événement et tous les suivants</strong></span>
      </label>
    </div>
  `;

  $("#detail-modal-actions").innerHTML = `
    <button type="button" class="ghost-btn" id="modal-rec-cancel">Annuler</button>
    <button type="button" class="${confirmClass}" id="modal-rec-confirm">${escapeHtml(confirmLabel)}</button>
  `;

  $("#detail-modal").hidden = false;

  $("#modal-rec-cancel").addEventListener("click", closeDetailModal);
  $("#modal-rec-confirm").addEventListener("click", () => {
    const selected = document.querySelector('input[name="recurrence-scope"]:checked')?.value || "single";
    closeDetailModal();
    onConfirm(selected);
  });
}

function showFaqDetails(id) {
  const item = faqItems.find(f => f.id === id);
  if (!item) return;
  const structure = findStructure(item.structureId);
  $("#detail-modal-title").textContent = item.person;
  $("#detail-modal-content").innerHTML = `
    <p><strong>Date :</strong> ${escapeHtml(item.date)}</p>
    <p><strong>Horaire :</strong> ${escapeHtml(item.start)} - ${escapeHtml(item.end)}</p>
    <p><strong>Structure :</strong> ${escapeHtml(structure.name)}</p>
    <p><strong>Demande :</strong> ${escapeHtml(item.need)}</p>
    <p><strong>Ajouté par :</strong> ${escapeHtml(item.ownerName || item.ownerId || "")}</p>
  `;
  const canDelete = isAdmin() || item.ownerId === currentUser?.id;
  $("#detail-modal-actions").innerHTML = canDelete
    ? `<button type="button" class="danger-btn" id="modal-delete-faq">Supprimer</button>`
    : "";
  $("#detail-modal").hidden = false;

  const del = $("#modal-delete-faq");
  if (del) del.addEventListener("click", () => {
    closeDetailModal();
    deleteFaqItem(id);
  });
}

function closeDetailModal() {
  $("#detail-modal").hidden = true;
}

function buildPlanningMail(action, item) {
  const structure = findStructure(item.structureId);
  return {
    action,
    subject: `[Planning FAQ] ${action}`,
    actor: currentUser?.name || "",
    owner: item.ownerName || currentUser?.name || "",
    date: item.date,
    start: item.start,
    end: item.end,
    structure: structure.name,
    title: item.title,
    slot: formatSlotLabel(item)
  };
}

function buildFaqMail(action, item, slot) {
  const structure = findStructure(item.structureId);
  return {
    action,
    subject: `[Planning FAQ] ${action}`,
    actor: currentUser?.name || "",
    owner: item.ownerName || currentUser?.name || "",
    date: item.date,
    start: item.start,
    end: item.end,
    structure: structure.name,
    title: "Rendez-vous FAQ numérique",
    person: item.person,
    need: item.need,
    slot: slot ? formatSlotLabel(slot) : ""
  };
}

function exportFaqCsv() {
  if (!faqItems.length) return alert("Aucun rendez-vous à exporter.");

  const headers = ["Date", "Début", "Fin", "Structure", "Nom / prénom", "Demande", "Ajouté par"];
  const rows = faqItems.map(item => [
    item.date,
    item.start,
    item.end,
    findStructure(item.structureId).name,
    item.person,
    item.need,
    item.ownerName || item.ownerId || ""
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "rdvs-faq.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function clearAllData() {
  if (!isAdmin()) return alert("Seul l'admin peut vider les données.");
  if (!confirm("Cela va vider le planning et les rendez-vous pour tout le monde. Continuer ?")) return;

  planningItems = [];
  faqItems = [];
  saveLocal();
  renderAll();
  syncSharedDataDebounced({ type: "clear-all" });
}

function applySavedTheme() {
  const savedTheme = localStorage.getItem("rdvs_theme_v1");
  const theme = savedTheme || "light";

  const isDark = theme === "dark";

  document.documentElement.classList.toggle("dark-mode", isDark);
  document.body.classList.toggle("dark-mode", isDark);

  const btn = $("#theme-toggle");
  if (btn) {
    btn.textContent = isDark ? "☀️ Mode clair" : "🌙 Mode sombre";
  }
}

function toggleTheme() {
  const isDark = !document.body.classList.contains("dark-mode");

  document.documentElement.classList.toggle("dark-mode", isDark);
  document.body.classList.toggle("dark-mode", isDark);

  localStorage.setItem("rdvs_theme_v1", isDark ? "dark" : "light");

  const btn = $("#theme-toggle");
  if (btn) {
    btn.textContent = isDark ? "☀️ Mode clair" : "🌙 Mode sombre";
  }
}

init();
