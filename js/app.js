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

  /*
    Important :
    - payload garde type + item pour la synchronisation
    - payload.mail est recopié à la racine pour le mail / Power Automate / calendrier Microsoft
  */
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
    const loaded = await loadSharedData();

    if (loaded && currentUser) {
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
  $("#week-label").textContent = `Semaine du ${formatDateLongFr(currentWeekStart)} au ${formatDateLongFr(addDays(currentWeekStart, 6))}`;
}

function syncPlanningTitleWithType() {
  if ($("#planning-type").value === "faq") {
    $("#planning-title").value = "FAQ Numérique";
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

  if (!dateValue) return alert("Choisis une date.");
  if (minutes(end) <= minutes(start)) return alert("L'heure de fin doit être après l'heure de début.");

  const newItem = {
    id: uid(),
    ownerId: currentUser.id,
    ownerName: currentUser.name,
    date: dateValue,
    day: dayFromDate(dateValue),
    start,
    end,
    type,
    title,
    structureId,
    place: structure.name,
    color: structure.color,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  planningItems.push(newItem);
  currentWeekStart = getMonday(new Date(`${dateValue}T12:00:00`));
  saveLocal();
  renderAll();

  syncSharedDataDebounced({
    type: "upsert-planning",
    item: newItem,
    notify: window.APP_CONFIG?.enableMailNotification === true,
    mail: buildPlanningMail("Créneau planning ajouté", newItem)
  });

  event.target.reset();
  $("#planning-date").value = dateValue;
  $("#planning-start").value = "09:00";
  $("#planning-end").value = "10:00";
  $("#planning-type").value = "faq";
  $("#planning-title").value = "FAQ Numérique";
  renderStructureOptions();
}

function deletePlanningItem(id) {
  if (!isAdmin()) return alert("Seul l'admin peut supprimer un créneau.");
  const item = planningItems.find(p => p.id === id);
  if (!item) return;

  const linkedFaq = faqItems.filter(f => f.slotId === id);
  const message = linkedFaq.length
    ? `Ce créneau contient ${linkedFaq.length} rendez-vous. Supprimer quand même ?`
    : "Supprimer ce créneau ?";

  if (!confirm(message)) return;

  planningItems = planningItems.filter(p => p.id !== id);
  faqItems = faqItems.filter(f => f.slotId !== id);
  saveLocal();
  renderAll();

  syncSharedDataDebounced({
    type: "delete-planning",
    id,
    notify: window.APP_CONFIG?.enableMailNotification === true,
    mail: buildPlanningMail("Créneau planning supprimé", item)
  });
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
  renderFaqSlots();
  renderFaqList();
  renderStructures();
}

function renderStructureOptions() {
  const optionHtml = structures.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join("");
  ["#planning-place", "#faq-place"].forEach(selector => {
    const el = $(selector);
    if (el) el.innerHTML = optionHtml;
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

  const color = item.color || structure.color;

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
      <strong>${escapeHtml(item.title)}</strong>
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
      <article class="slot-card" style="border-left-color:${escapeHtml(slot.color || structure.color)}">
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
      <span class="color-dot"></span>

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

  const structure = findStructure(newStructureId);

  item.date = newDate;
  item.day = dayFromDate(newDate);
  item.start = newStart;
  item.end = newEnd;
  item.type = newType;
  item.title = newType === "faq" ? "FAQ Numérique" : newTitle;
  item.structureId = newStructureId;
  item.place = structure.name;
  item.color = structure.color;
  item.updatedAt = new Date().toISOString();

  currentWeekStart = getMonday(new Date(`${newDate}T12:00:00`));

  saveLocal();
  renderAll();
  closeDetailModal();

  syncSharedDataDebounced({
    type: "upsert-planning",
    item,
    notify: window.APP_CONFIG?.enableMailNotification === true,
    mail: buildPlanningMail("Créneau planning modifié", item)
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
