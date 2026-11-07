// ===== Листопульс: приложение «Тренер, который слушает тело» =====
// Одностраничное приложение без сервера: всё считается и хранится на устройстве.
import { h, s, icon, toast, sheet, confirmSheet, choice, toggle, ring, unlockAudio, beep, buzz, speak, keepAwake, confetti, download, mmss, fmtDate } from "./ui.js";
import * as store from "./store.js";
import {
  REGIONS, REGION_GROUPS, SIDES, HOTSPOTS, SEVERITY, SYMPTOMS, ONSET, TRIGGERS, CONDITIONS, AGE_GROUPS, GOALS, LEVELS,
  EQUIPMENT, WEIGHT_EQUIP, GROUPS, EXERCISES, EX, QUICK, PROGRAMS, RECORD_EX, BADGES, TIPS, RED_FLAGS, SCREENING, CHALLENGES, RUN_DAYS
} from "./data.js";
import { GUIDE, GUIDE_AREAS, GUIDE_BY_ID } from "./guide.js";
import * as E from "./engine.js";
import * as L from "./look.js";

const VERSION = "1.6.0";
const app = document.getElementById("app");
const REGION = Object.fromEntries(REGIONS.map(r => [r.id, r]));
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clean = (v, max) => String(v || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(36).padStart(2, "0")).join("").slice(0, 12);

let state = null;
let started = false;
// Оформление хранится отдельно от данных и применяется ещё до ввода пароля; фото — только после
let look = L.loadLook();
let media = {};
const mediaUrls = { avatar: "", bg: "" };
let lastRoute = "";
let installPrompt = null;
let player = null;
const postRender = []; // действия после вставки экрана в документ (например, размер 3D-сцены)

// ===== 3D-модель =====
// Один WebGL-контекст на всё приложение: сцена переносится между экранами, а не создаётся заново
let figure = null;
let figureFailed = false;
let figureMode = "rotate";
// 3D-модель и схемы движений подгружаются по требованию: первый экран открывается быстрее
let body3d = null;
let body3dLoading = null;
function loadBody3d() {
  if (body3d) return Promise.resolve(body3d);
  body3dLoading = body3dLoading || import("./body3d.js").then(m => (body3d = m)).catch(() => { figureFailed = true; return null; });
  return body3dLoading;
}
let animMod = null;
let animLoading = null;
function loadAnim() {
  if (animMod) return Promise.resolve(animMod);
  animLoading = animLoading || import("./anim.js").then(m => {
    animMod = m;
    if (m.setOptions) m.setOptions({ speed: look.speed, still: look.still });
    return m;
  }).catch(() => null);
  return animLoading;
}
// Блок со схемой движения: пока модуль грузится, место под схему уже занято
function demoBox(id) {
  const box = h("div", { class: "demo" });
  if (animMod) box.append(animMod.exerciseDemo(id));
  else {
    box.classList.add("is-loading");
    loadAnim().then(m => {
      box.classList.remove("is-loading");
      if (m) box.replaceChildren(m.exerciseDemo(id));
      else box.remove();
    });
  }
  return box;
}
// undefined — модуль ещё грузится, null — 3D недоступна
function getFigure() {
  if (figure || figureFailed) return figure;
  if (!body3d) return undefined;
  if (!body3d.webglSupported()) { figureFailed = true; return null; }
  try {
    figure = body3d.createFigure({
      regions: REGIONS.map(r => r.id),
      label: "3D-модель человека. Касание выбирает зону, режим «Обвести» выделяет область",
      onTap: (id, side) => regionSheet(id, side),
      onLasso: result => onLasso(result)
    });
  } catch (e) {
    figureFailed = true;
    figure = null;
  }
  return figure;
}
const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches);
};
const SEV_RGB = [null, [0.98, 0.76, 0.28], [0.98, 0.52, 0.22], [0.92, 0.25, 0.25]];
const mixRGB = (a, b, w) => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
// Что показывает модель: зоны боли или нагрузку мышц после тренировок (карта восстановления)
let bodyLayer = "pain";
const LOAD_RGB = [0.5, 0.36, 0.95];
// Зоны модели, которые закрашиваются на карте нагрузки, и их мышечные группы
const MUSCLE_KEYS = {
  neck: ["neck"], trapezius: ["upperBack", "neck"], shoulder: ["shoulder"], upperArm: ["elbow"], triceps: ["elbow"], forearm: ["wrist"],
  chest: ["chest"], abdomen: ["abdomen"], obliques: ["abdomen"], shoulderBlade: ["upperBack"], upperBack: ["upperBack"], lowerBack: ["lowerBack"],
  glute: ["hip"], hip: ["hip"], thighFront: ["knee"], thighOuter: ["hip"], thighInner: ["groin"], groin: ["groin"], hamstring: ["hamstring"],
  calf: ["ankle"], shin: ["ankle"]
};
function paintFigure() {
  if (!figure || !state) return;
  const dark = isDark();
  const tone = L.bodyColors(look, dark);
  figure.setTheme({ rim: tone.rim || (dark ? [0.3, 0.87, 0.5] : [0.09, 0.64, 0.29]), amb: dark ? 0.3 : 0.4 });
  const base = tone.base;
  if (bodyLayer === "load") {
    const f = E.muscleFatigue(state);
    const lvl = {};
    for (const [id, keys] of Object.entries(MUSCLE_KEYS)) lvl[id] = Math.max(...keys.map(k => f[k] || 0));
    figure.setColorizer(id => (lvl[id] > 0.03 ? mixRGB(base, LOAD_RGB, 0.25 + 0.7 * lvl[id]) : base));
    figure.repaint();
    return;
  }
  const tint = {};
  for (const reg of REGIONS) {
    const sev = E.regionSeverity(state, reg.id, E.dayKey(), false);
    if (sev) tint[reg.id] = { sev, sides: (state.body[reg.id] && state.body[reg.id].sides) || [] };
  }
  const marks = state.marks;
  figure.setColorizer((id, side, p, n) => {
    let col = base;
    const t = tint[id];
    if (t && (!t.sides.length || !side || t.sides.includes(side))) col = mixRGB(col, SEV_RGB[t.sev], 0.62);
    for (const m of marks) {
      const d = Math.hypot(p[0] - m.c[0], p[1] - m.c[1], p[2] - m.c[2]);
      if (d < m.r && n[0] * m.n[0] + n[1] * m.n[1] + n[2] * m.n[2] > -0.25) {
        col = mixRGB(col, SEV_RGB[Math.max(1, m.sev)], 0.5 + 0.45 * (1 - (d / m.r) ** 2));
      }
    }
    return col;
  });
  figure.repaint();
}

// ===== Сохранение =====
// Сохраняем только настоящие изменения: иначе вкладка со старыми данными при закрытии
// могла бы затереть то, что пользователь сделал в другой вкладке.
let saveTimer = null;
let dirty = false;
function persist() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
function flush() {
  clearTimeout(saveTimer);
  if (!state || !dirty) return Promise.resolve(true);
  dirty = false;
  return store.save(state).then(ok => {
    if (!ok) {
      dirty = true;
      toast("Не удалось сохранить данные: возможно, память браузера заполнена");
    }
    return ok;
  });
}

// Данные изменились в другой вкладке: подхватываем их, а зашифрованные — просим открыть заново
function onStorage(e) {
  if (e.key === "lpapp-theme") { applyTheme(store.getTheme()); return; }
  if (e.key === L.LOOK_KEY) {
    look = L.loadLook();
    applyLookNow();
    if (state && !player && !tracker) render();
    return;
  }
  if (e.key === "lpapp-media") {
    if (state) loadMediaNow().then(() => { if (state && !player && !tracker) render(); });
    return;
  }
  if (e.key !== null && e.key !== "lpapp-v1") return;
  if (!state || player || tracker) return;
  clearTimeout(saveTimer);
  dirty = false;
  planCache.key = "";
  const env = store.readEnvelope();
  document.querySelectorAll(".backdrop").forEach(n => n.remove());
  document.documentElement.classList.remove("no-scroll");
  if (env && env.enc === true) {
    store.forgetKey();
    state = null;
    showLock(env);
    return;
  }
  store.forgetKey();
  state = env ? store.loadPlain(env) : store.defaultState();
  applyGlass();
  render();
}

// ===== Тема и стекло =====
function applyTheme(t) {
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}
function applyGlass() {
  applyLookNow();
}
// ===== Оформление =====
function setMediaUrls() {
  for (const k of ["avatar", "bg"]) {
    if (mediaUrls[k]) URL.revokeObjectURL(mediaUrls[k]);
    mediaUrls[k] = media[k] ? L.dataUrlToBlobUrl(media[k]) : "";
  }
}
function applyLookNow() {
  L.applyLook(look, { photoUrl: mediaUrls.bg });
  if (animMod && animMod.setOptions) animMod.setOptions({ speed: look.speed, still: look.still });
  paintFigure();
}
async function loadMediaNow() {
  media = await store.loadMedia();
  setMediaUrls();
  applyLookNow();
}
function clearMedia() {
  media = {};
  setMediaUrls();
  applyLookNow();
}

// ===== Офлайн-режим =====
// Адрес service worker проходит через политику Trusted Types, которая пропускает только ./sw.js
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    let url = "./sw.js";
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
      const policy = window.trustedTypes.createPolicy("lp-sw", {
        createScriptURL: u => {
          if (u === "./sw.js") return u;
          throw new TypeError("Недопустимый адрес скрипта");
        }
      });
      url = policy.createScriptURL("./sw.js");
    }
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController) return;
      toast("Листопульс обновился", { action: { label: "Перезапустить", onClick: () => { if (player || tracker) { toast("Сначала завершите тренировку"); return; } flush().then(() => window.location.reload()); } } });
    });
    navigator.serviceWorker.register(url, { scope: "./" }).catch(() => {});
  } catch (e) { /* без офлайн-режима */ }
}

// ===== Запуск =====
function showFrameGuard() {
  const link = h("a", { class: "btn primary", href: window.location.href, target: "_top", rel: "noopener noreferrer", text: "Открыть напрямую" });
  document.body.append(h("div", { class: "frame-guard" },
    h("p", { text: "Листопульс открыт внутри другого сайта. Чтобы вас не обманули поддельными кнопками, откройте приложение напрямую." }), link));
}

function boot() {
  if (document.documentElement.classList.contains("is-framed")) return showFrameGuard();
  applyTheme(store.getTheme());
  applyLookNow();
  registerSW();
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    installPrompt = e;
  });
  const env = store.readEnvelope();
  if (env && env.enc === true) return showLock(env);
  state = env ? store.loadPlain(env) : store.defaultState();
  startApp();
}

function startApp() {
  // Переход со старой настройки «Меньше прозрачности» на оформление
  let storedLook = null;
  try { storedLook = localStorage.getItem(L.LOOK_KEY); } catch (e) { storedLook = null; }
  if (storedLook === null && state.settings.lessGlass) {
    look.glass = false;
    look.preset = matchPreset(look);
    L.saveLook(look);
  }
  applyLookNow();
  loadMediaNow().then(() => { if (state && (media.avatar || media.bg)) render(); });
  if (!started) {
    started = true;
    // Экран при запуске — как выбрано в персонализации
    if (!window.location.hash && look.start !== "today") history.replaceState(null, "", `#${look.start}`);
    window.addEventListener("hashchange", () => render());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", () => { flush(); });
    window.addEventListener("storage", onStorage);
    try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintFigure); } catch (e) { /* старый браузер */ }
    // Когда главный экран уже показан, тихо подгружаем 3D-модель и схемы движений
    if (state.profile.onboarded && state.settings.seenVersion !== VERSION && !state.sessions.length && !state.checkins.length) {
      state.settings.seenVersion = VERSION;
      persist();
    }
    const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1500));
    idle(() => { loadAnim(); loadBody3d(); });
  }
  render();
}

// Автоблокировка: если данные защищены паролем и приложение свёрнуто дольше 5 минут
let hiddenAt = 0;
function onVisibility() {
  if (document.visibilityState === "hidden") {
    hiddenAt = Date.now();
    flush();
    return;
  }
  if (player || tracker) keepAwake(true);
  if (state && store.isEncrypted() && hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000 && !player && !tracker) lockNow();
  hiddenAt = 0;
}

async function lockNow() {
  if (player) closePlayer(false);
  if (tracker) stopTracker();
  await flush();
  store.forgetKey();
  state = null;
  clearMedia();
  document.querySelectorAll(".backdrop").forEach(n => n.remove());
  document.documentElement.classList.remove("no-scroll");
  showLock(store.readEnvelope());
}

// ===== Экран блокировки =====
let failures = 0;
let blockedUntil = 0;
function showLock(env) {
  if (!env || env.enc !== true) {
    state = env ? store.loadPlain(env) : store.defaultState();
    return startApp();
  }
  const input = h("input", { class: "input", type: "password", autocomplete: "current-password", placeholder: "Пароль", "aria-label": "Пароль", maxlength: 128 });
  const error = h("p", { class: "error", role: "alert" });
  const btn = h("button", { class: "btn primary block", type: "button", text: "Открыть" });
  const tryUnlock = async () => {
    const wait = blockedUntil - Date.now();
    if (wait > 0) {
      error.textContent = `Слишком много попыток. Подождите ${Math.ceil(wait / 1000)} сек.`;
      return;
    }
    if (!input.value) {
      error.textContent = "Введите пароль";
      return;
    }
    btn.disabled = true;
    btn.textContent = "Проверяем…";
    error.textContent = "";
    try {
      state = await store.unlock(env, input.value);
      input.value = "";
      failures = 0;
      startApp();
    } catch (e) {
      failures += 1;
      if (failures >= 5) blockedUntil = Date.now() + 30000 * 2 ** Math.min(failures - 5, 5);
      error.textContent = "Неверный пароль";
      btn.disabled = false;
      btn.textContent = "Открыть";
      input.select();
    }
  };
  btn.addEventListener("click", tryUnlock);
  input.addEventListener("keydown", e => { if (e.key === "Enter") tryUnlock(); });
  const forgot = h("button", {
    class: "link-btn", type: "button", text: "Забыли пароль?",
    onClick: async () => {
      const ok = await confirmSheet({
        title: "Пароль нельзя восстановить",
        message: "Данные зашифрованы прямо на этом устройстве, и доступа к ним нет ни у кого — даже у нас. Можно удалить их и начать заново, а потом загрузить резервную копию, если она есть.",
        ok: "Удалить и начать заново", danger: true
      });
      if (ok) {
        dirty = false;
        store.wipe();
        state = store.defaultState();
        look = L.defaultLook();
        clearMedia();
        startApp();
      }
    }
  });
  app.replaceChildren(h("div", { class: "lock-screen" },
    h("div", { class: "lock-card glass" },
      h("img", { src: "icon.svg", alt: "", width: 56, height: 56 }),
      h("h1", { text: "Листопульс" }),
      h("p", { class: "muted", text: "Данные защищены паролем. Введите его, чтобы продолжить." }),
      input, error, btn,
      h("p", { class: "small", style: { marginTop: "16px" } }, forgot))));
  setTimeout(() => input.focus(), 50);
}

// ===== Маршруты =====
const ROUTES = { today: viewToday, workout: viewWorkout, body: viewBody, journal: viewJournal, more: viewMore, guide: viewGuide, program: viewProgram, builder: viewBuilder, challenge: viewChallenge, report: viewReport, run: viewRun };
const TAB_OF = { guide: "body", program: "workout", builder: "workout", challenge: "workout", report: "body", run: "workout" };
// Адрес приложения для приглашений и «Поделиться» (работает и на своём домене)
const appUrl = () => new URL("./", window.location.href).href;
const TABS = [["today", "Сегодня", "today"], ["workout", "Тренировки", "workout"], ["body", "Тело", "body"], ["journal", "Прогресс", "journal"], ["more", "Профиль", "user"]];

function render() {
  if (!state) return;
  postRender.length = 0;
  if (!state.profile.onboarded) return renderOnboarding();
  let hash = "";
  try { hash = decodeURIComponent(window.location.hash.replace(/^#\/?/, "")); } catch (e) { hash = ""; }
  const [section, sub] = hash.split("/");
  const name = own(ROUTES, section) ? section : "today";
  const key = `${name}/${sub || ""}`;
  const y = window.scrollY;
  const keep = key === lastRoute;
  lastRoute = key;
  const main = h("main", { class: "view", id: "main" }, ROUTES[name](sub));
  app.replaceChildren(h("div", { class: "shell" }, topbar(), main), tabbar(tabOf(name, sub)));
  window.scrollTo(0, keep ? y : 0);
  runPostRender();
}
function runPostRender() {
  const tasks = postRender.splice(0);
  for (const task of tasks) task();
}
const refresh = () => render();

function topbar() {
  return h("header", { class: "topbar glass-clear" },
    h("a", { class: "brand", href: "#today" }, h("img", { src: "icon.svg", alt: "", width: 26, height: 26 }), h("span", {}, "Листо", h("b", { text: "пульс" }))),
    store.isEncrypted() ? h("button", { class: "icon-btn", type: "button", "aria-label": "Заблокировать", title: "Заблокировать", onClick: lockNow }, icon("lock", 20)) : null,
    h("a", { class: "icon-btn", href: "#more/settings", "aria-label": "Настройки" }, icon("sliders", 20)));
}

function tabbar(active) {
  const tabs = look.tabs.map(id => TABS.find(t => t[0] === id)).filter(Boolean);
  return h("nav", { class: "tabbar glass-clear", "aria-label": "Разделы" },
    tabs.map(([id, label, ic]) => h("a", { class: "tab", href: `#${id}`, "aria-current": id === active ? "page" : null }, icon(ic, look.labels ? 22 : 26), h("span", { text: label }))));
}

// ===== План дня =====
let planCache = { key: "", plan: null };
const variant = () => (state.planVariant.d === E.dayKey() ? state.planVariant.n : 0);
function currentPlan() {
  const d = E.dayKey();
  const key = JSON.stringify([d, state.profile, state.body, state.marks, state.checkins.find(c => c.d === d) || null, state.modeOverride, variant(), state.progress.factor]);
  if (planCache.key !== key) planCache = { key, plan: E.buildSession(state, { variant: variant() }) };
  return planCache.plan;
}

const badgeToast = ids => `Новая награда: ${BADGES.find(b => b.id === ids[0]).name}!`;
const dayIndex = () => {
  const n = new Date();
  return Math.floor((n - new Date(n.getFullYear(), 0, 0)) / 864e5);
};
const say = t => { if (state && state.settings.voice) speak(t); };
const stat = (v, label) => h("div", { class: "stat" }, h("b", { text: String(v) }), h("span", { text: label }));
const feature = (ic, title, textValue) => h("div", { class: "feature" }, h("span", { class: "fi" }, icon(ic, 20)),
  h("span", {}, h("b", { text: title }), h("br"), h("span", { class: "muted small", text: textValue })));
const equipName = id => (EQUIPMENT.find(e => e.id === id) || { name: id }).name;

// ===== Сегодня =====
// Главный экран отвечает на один вопрос: что сделать сегодня. Одна главная кнопка — «Начать»,
// остальное — компактным списком, подсказки — по одной за раз
function viewToday() {
  const d = E.dayKey();
  const r = E.restrictions(state, d);
  const ci = state.checkins.find(c => c.d === d);
  // Порядок и набор блоков выбирает пользователь; предупреждения о боли всегда сверху
  const blocks = {
    hero: () => heroCard(currentPlan(), r, ci, state.sessions.filter(x => x.d === d)),
    tasks: () => todayTasks(),
    fav: () => favCard(),
    week: () => weekCard(),
    motto: () => (state.settings.motto ? h("p", { class: "motto-line", text: `«${state.settings.motto}»` }) : null),
    tip: () => h("p", { class: "tip-line" }, h("b", { text: "Совет. " }), TIPS[dayIndex() % TIPS.length])
  };
  const shown = look.home.filter(([, on]) => on).map(([id]) => blocks[id]()).filter(Boolean);
  return [
    h("div", { class: "today-head" },
      h("div", {},
        h("p", { class: "eyebrow", text: fmtDate(d, { weekday: "long", day: "numeric", month: "long" }) }),
        h("h1", { class: "page-title", text: greeting() })),
      avatarEl({ href: "#more", label: "Профиль" })),
    r.acute.length ? acuteCard(r) : null,
    todayNotice(),
    ...(shown.length ? shown : [h("section", { class: "card glass" },
      h("p", { class: "muted", text: "Все блоки главного экрана скрыты." }),
      h("a", { class: "btn ghost", href: "#more/look", text: "Настроить главный экран" }))])
  ];
}
// Избранные готовые тренировки — на главном экране одним касанием
function favCard() {
  const list = state.favs.map(id => QUICK.find(q => q.id === id)).filter(Boolean);
  if (!list.length) return null;
  return h("section", { class: "card glass" },
    h("p", { class: "eyebrow", text: "Избранное" }),
    h("div", { class: "list" }, list.map(q => h("button", { class: "row row-btn task-row", type: "button", onClick: () => quickSheet(q.id) },
      h("span", { class: "fi" }, icon("star", 18)),
      h("span", { class: "row-text" }, h("b", { text: q.name }), h("span", { class: "muted small", text: q.desc })),
      icon("chevron", 16)))));
}
// Аватар: буква имени, эмодзи или своё фото
function avatarEl({ big = false, href = "", label = "" } = {}) {
  const p = state.profile;
  const photo = look.avatar === "photo" && mediaUrls.avatar;
  const cls = `avatar${big ? " big" : ""}${photo ? " has-photo" : look.avatar === "emoji" ? " is-emoji" : ""}`;
  const inner = photo ? [h("img", { src: mediaUrls.avatar, alt: "" })] : [look.avatar === "emoji" ? look.emoji : (p.name || "Вы").slice(0, 1).toUpperCase()];
  if (href) return h("a", { class: cls, href, "aria-label": label }, ...inner);
  return h("span", { class: cls, "aria-hidden": "true" }, ...inner);
}
// Подсказки по важности: самое срочное — вопрос о боли после вчерашней тренировки
function todayNotice() {
  return followupCard() || rescreenCard() || weekSummaryCard() || whatsNewCard() || backupCard();
}
// Интенсивность дня словами: «обычная нагрузка», а не «режим обычная»
const MODE_PHRASE = { recovery: "день восстановления", light: "лёгкая нагрузка", normal: "обычная нагрузка", push: "нагрузка посильнее" };
function heroCard(plan, r, ci, done) {
  const mode = MODE_PHRASE[plan.mode] || E.MODES[plan.mode].name.toLowerCase();
  const ready = ci
    ? h("button", { class: "ready-chip", type: "button", onClick: checkinSheet, "aria-label": `Готовность ${ci.score} из 100, ${mode}. Изменить отметку самочувствия` },
      h("b", { text: String(ci.score) }), h("span", { text: `готовность · ${mode}` }), icon("chevron", 14))
    : h("button", { class: "ready-chip ask", type: "button", onClick: checkinSheet }, icon("heart", 16), h("span", { text: "Как самочувствие? Отметьте за 30 секунд" }), icon("chevron", 14));
  if (plan.blocked) {
    return h("section", { class: "card glass warn hero" },
      h("p", { class: "eyebrow", text: "Тренировка на сегодня" }),
      h("h2", { class: "hero-title", text: plan.title }),
      h("ul", { class: "adapt" }, plan.notes.map(n => h("li", { class: "note", text: n }))),
      ready,
      h("div", { class: "btn-row" }, h("a", { class: "btn primary", href: "#more/breath", text: "Дыхательная практика" })));
  }
  const care = r.reasons.slice(0, 3).join(", ").toLowerCase() + (r.reasons.length > 3 ? ` и ещё ${r.reasons.length - 3}` : "");
  return h("section", { class: "card glass hero" },
    h("p", { class: "eyebrow", text: "Тренировка на сегодня" }),
    h("h2", { class: "hero-title", text: plan.title }),
    h("p", { class: "muted", text: `≈ ${plan.est} мин · ${plan.count} ${E.plural(plan.count, "подход", "подхода", "подходов")}` }),
    r.reasons.length ? h("p", { class: "small hero-care" }, h("span", { class: "muted", text: "Учтено: " }), care) : null,
    done.length ? h("p", { class: "small hero-done", text: "Сегодня тренировка уже есть ✓ Можно отдохнуть или размяться перед сном." }) : null,
    ready,
    h("div", { class: "btn-row" },
      h("button", { class: "btn primary", type: "button", onClick: () => startPlayer(plan) }, icon("play", 18), "Начать"),
      h("a", { class: "btn ghost", href: "#workout", text: "Состав" })));
}
// Отметка самочувствия — в отдельном окне, чтобы главный экран оставался коротким
function checkinSheet() {
  const d = E.dayKey();
  const prev = state.checkins.find(c => c.d === d);
  const draft = prev
    ? { sleep: prev.sleep, energy: prev.energy, soreness: prev.soreness, stress: prev.stress, pain: prev.pain.slice() }
    : { sleep: 3, energy: 3, soreness: 2, stress: 2, pain: [] };
  const close = sheet({
    title: "Как вы сегодня?",
    body: [
      h("p", { class: "muted small", text: "30 секунд — и тренировка подстроится под ваше состояние." }),
      SCALES.map(sc => h("div", { class: "q" },
        h("b", { text: sc.q }),
        choice({
          className: "scale", label: sc.q, value: draft[sc.key],
          options: [1, 2, 3, 4, 5].map(v => ({ value: v, label: sc.up ? FACES[v - 1] : FACES[5 - v], aria: `${v} из 5` })),
          onChange: v => { draft[sc.key] = v; }
        }),
        h("div", { class: "scale-labels" }, h("span", { text: sc.lo }), h("span", { text: sc.hi })))),
      h("div", { class: "q" }, h("b", { text: "Что-то болит сегодня?" }), painPicker(draft))
    ],
    actions: [h("button", {
      class: "btn primary", type: "button", text: "Сохранить",
      onClick: () => {
        const entry = { d, sleep: draft.sleep, energy: draft.energy, soreness: draft.soreness, stress: draft.stress, pain: draft.pain.slice() };
        entry.score = E.readinessScore(entry);
        state.checkins = state.checkins.filter(c => c.d !== d).concat(entry).slice(-400);
        if (state.modeOverride && state.modeOverride.d === d) state.modeOverride = null;
        const nb = E.newBadges(state);
        persist();
        close();
        refresh();
        toast(nb.length ? badgeToast(nb) : `Сегодня: ${MODE_PHRASE[currentPlan().mode] || E.MODES[currentPlan().mode].name.toLowerCase()}`);
      }
    })]
  });
}
// «Ещё на сегодня»: зарядка, челленджи, бег и вода — короткими строками
function todayTasks() {
  const d = E.dayKey();
  const rows = [];
  const line = (lead, title, sub, trailing) => [lead, h("span", { class: "row-text" }, h("b", { text: title }), h("span", { class: "muted small", text: sub })), trailing];
  const lead = (ic, emoji) => (emoji ? h("span", { class: "fi emoji", "aria-hidden": "true", text: emoji }) : h("span", { class: "fi" }, icon(ic, 18)));
  // Утренняя зарядка — до 14:00
  const morningDone = state.sessions.some(x => x.d === d && x.goal === "morning");
  const hr = new Date().getHours();
  if (morningDone || (hr >= 4 && hr < 14)) {
    const s = E.buildMorning(state, d);
    const items = s.blocked ? [] : s.blocks.flatMap(b => b.items);
    if (items.length) {
      const open = () => sessionSheet(s, { title: s.title, info: `${roundsInfo(s)} · каждый день новый набор`, actions: close => [h("button", { class: "btn primary", type: "button", onClick: () => { close(); startPlayer(s); } }, icon("play", 18), "Начать зарядку")] });
      rows.push(h("button", { class: "row row-btn task-row", type: "button", onClick: open },
        line(lead("today"), "Утренняя зарядка", morningDone ? "Сделана — бодрого дня!" : `${s.est} мин без инвентаря · каждый день новая`, morningDone ? h("span", { class: "pill", text: "✓" }) : icon("chevron", 16))));
    }
  }
  // Челленджи
  for (const c of CHALLENGES) {
    if (!own(state.challenges, c.id)) continue;
    const cs = E.challengeState(state, c.id);
    if (cs.finished) continue;
    rows.push(h("a", { class: "row task-row", href: `#challenge/${c.id}` }, line(lead(null, c.icon), c.name, challengeLine(cs), cs.doneToday ? h("span", { class: "pill", text: "✓" }) : icon("chevron", 16))));
  }
  // Бег с нуля — в дни тренировок
  const rs = E.runState(state);
  const wd = new Date().getDay() || 7;
  if (rs.started && !rs.finished && !rs.blocked && (rs.doneToday || state.profile.days.includes(wd))) {
    rows.push(h("a", { class: "row task-row", href: "#run" }, line(lead(null, "👟"), "Бег с нуля", rs.doneToday ? `Занятие ${rs.done} сделано` : `Занятие ${rs.next}: ${runPlanText(rs.session)}`, rs.doneToday ? h("span", { class: "pill", text: "✓" }) : icon("chevron", 16))));
  }
  rows.push(waterRow());
  return h("section", { class: "card glass" },
    h("p", { class: "eyebrow", text: "Ещё на сегодня" }),
    h("div", { class: "list" }, rows));
}
// Вода: стакан добавляется одной кнопкой
function waterRow() {
  const goal = 8;
  let count = state.water.d === E.dayKey() ? state.water.n : 0;
  const sub = h("span", { class: "muted small" });
  const bar = h("i", {});
  const update = () => {
    sub.textContent = count >= goal ? "8 стаканов — норма на сегодня" : `${count} из ${goal} стаканов · ${(count * 0.25).toLocaleString("ru-RU")} л`;
    bar.style.width = `${Math.round((Math.min(count, goal) / goal) * 100)}%`;
  };
  const setCount = v => {
    const before = count;
    count = Math.max(0, Math.min(12, v));
    state.water = { d: E.dayKey(), n: count };
    update();
    if (count >= goal && before < goal) {
      const nb = E.newBadges(state);
      confetti();
      toast(nb.length ? badgeToast(nb) : "Водный баланс — в норме!");
    }
    persist();
  };
  update();
  return h("div", { class: "row task-row water-row" },
    h("span", { class: "fi water-fi" }, icon("drop", 18)),
    h("span", { class: "row-text" }, h("b", { text: "Вода" }), sub, h("span", { class: "progress slim water-bar", "aria-hidden": "true" }, bar)),
    h("div", { class: "row-tools" },
      h("button", { class: "icon-btn mini", type: "button", "aria-label": "Убрать стакан", onClick: () => setCount(count - 1) }, icon("minus", 16)),
      h("button", { class: "icon-btn mini on", type: "button", "aria-label": "Добавить стакан воды", onClick: () => setCount(count + 1) }, icon("plus", 16))));
}

function greeting() {
  const hr = new Date().getHours();
  const base = hr < 5 ? "Доброй ночи" : hr < 12 ? "Доброе утро" : hr < 18 ? "Добрый день" : "Добрый вечер";
  return state.profile.name ? `${base}, ${state.profile.name}!` : `${base}!`;
}

function acuteCard(r) {
  return h("section", { class: "card glass alert", role: "note" },
    h("h2", { text: `Острая боль: ${r.acute.join(", ").toLowerCase()}` }),
    h("p", { text: "Эту зону не нагружаем, тренировки — щадящие. Если боль сильная, нарастает или держится несколько дней — обратитесь к врачу." }),
    h("button", { class: "link-btn", type: "button", text: "Когда нужна срочная помощь", onClick: redFlagsSheet }));
}

function redFlagsSheet() {
  sheet({
    title: "Когда сразу остановиться",
    body: [
      h("p", { text: "Прекратите тренировку и обратитесь за медицинской помощью, если появились:" }),
      h("ul", { class: "bullets" }, RED_FLAGS.map(t => h("li", { text: t }))),
      h("p", {}, h("b", { text: "Боль в груди, обморок, сильная одышка — звоните 112." }))
    ]
  });
}

const SCALES = [
  { key: "sleep", q: "Как спали?", lo: "плохо", hi: "отлично", up: true },
  { key: "energy", q: "Сколько сил?", lo: "нет сил", hi: "много сил", up: true },
  { key: "soreness", q: "Как мышцы?", lo: "свежие", hi: "всё болит", up: false },
  { key: "stress", q: "Уровень стресса?", lo: "спокойно", hi: "очень высокий", up: false }
];
const FACES = ["😫", "😕", "😐", "🙂", "😄"];


const BASE_PAIN = ["neck", "shoulder", "elbow", "wrist", "upperBack", "lowerBack", "hip", "knee", "ankle"];
function painPicker(draft) {
  const first = [...new Set([...trackedRegions(), ...BASE_PAIN])];
  const order = [...first, ...REGIONS.map(r => r.id).filter(id => !first.includes(id))];
  const group = choice({ multiple: true, label: "Что болит сегодня", value: draft.pain, options: order.map(id => ({ value: id, label: REGION[id].name })), onChange: v => { draft.pain = v; } });
  const extra = [...group.children].slice(first.length);
  if (!extra.length) return group;
  extra.forEach(b => { b.hidden = true; });
  const more = h("button", {
    class: "chip more-chip", type: "button", text: `Ещё ${extra.length} ${E.plural(extra.length, "зона", "зоны", "зон")}`,
    onClick: () => { extra.forEach(b => { b.hidden = false; }); more.remove(); }
  });
  group.append(more);
  return group;
}



// ----- Неделя: ориентиры ВОЗ по возрасту, план недели и серия -----
const WEEKDAY_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const PLACE_WORD = { home: "дома", outdoor: "на улице", gym: "в зале", work: "на работе" };
const PLAN_CUES = ["после пробуждения", "после утреннего кофе", "в обеденный перерыв", "после работы", "перед ужином"];
const planText = p => [p.days.map(d => WEEKDAY_SHORT[d - 1]).join(", "), p.planTime, PLACE_WORD[p.planPlace], p.planCue].filter(Boolean).join(" · ");
function weekCard() {
  const w = E.whoWeek(state);
  const p = state.profile;
  const goal = Math.max(1, p.days.length);
  const wk = E.weekWorkouts(state);
  const left = Math.max(0, goal - wk);
  const st = E.streak(state);
  const ws = E.weekStreak(state);
  const ringCol = (v, max, label, sub, caption) => h("div", { class: "ring-col" }, ring(v, max, { size: 78, stroke: 8, label, sub }), h("span", { class: "muted small", text: caption }));
  return h("section", { class: "card glass" },
    h("div", { class: "card-head" },
      h("p", { class: "eyebrow", text: "Неделя" }),
      h("a", { class: "head-link", href: "#journal", text: "Прогресс" })),
    h("div", { class: "rings" },
      ringCol(wk, goal, `${wk}/${goal}`, "", "тренировки"),
      ringCol(w.done, w.mins, String(w.done), `/${w.mins}`, "минуты"),
      ringCol(w.strengthDays, w.strength, `${w.strengthDays}/${w.strength}`, "", "силовые дни")),
    h("p", { class: "week-line" }, h("b", { text: left ? `Ещё ${left} ${E.plural(left, "тренировка", "тренировки", "тренировок")} до плана недели` : "План недели выполнен! 🎉" }),
      ws || st ? h("span", { class: "muted", text: ` · ${[ws ? `${ws} ${E.plural(ws, "неделя", "недели", "недель")} по плану` : "", st ? `${st} ${E.plural(st, "день", "дня", "дней")} подряд` : ""].filter(Boolean).join(", ")}` }) : null),
    w.balance ? h("p", { class: "small" }, `Равновесие: ${w.balanceDays} из ${w.balance} дней. `,
      h("button", { class: "link-btn", type: "button", text: "Тренировка на равновесие", onClick: () => quickSheet("balance") })) : null,
    p.planTime
      ? h("p", { class: "small plan-line" }, h("span", { class: "muted", text: "Мой план: " }), planText(p), " ", h("button", { class: "link-btn", type: "button", text: "Изменить", onClick: planSheet }))
      : h("p", { class: "small plan-line" }, "Решите заранее, когда и где будете заниматься, — так проще не пропускать. ",
        h("button", { class: "link-btn", type: "button", text: "Составить план", onClick: planSheet })),
    h("div", { class: "btn-row" }, h("button", { class: "btn small ghost", type: "button", text: "+ Прогулка или другая активность", onClick: addActivitySheet })));
}

// План «когда, где и после чего»: заранее принятое решение помогает не пропускать тренировки
function planSheet() {
  const p = state.profile;
  const draft = { days: p.days.slice(), place: p.planPlace || "home", cue: p.planCue };
  const time = h("input", { class: "input", type: "time", value: p.planTime || "19:00" });
  const custom = h("input", { class: "input", maxlength: 60, placeholder: "Например: после прогулки с собакой", value: PLAN_CUES.includes(p.planCue) ? "" : p.planCue });
  const err = h("p", { class: "error", role: "alert" });
  const close = sheet({
    title: "Мой план тренировок",
    body: [
      h("p", { class: "muted small", text: "Когда, где и после чего вы будете заниматься. Исследования показывают: заранее продуманный план помогает чаще доводить дело до конца." }),
      h("div", { class: "q" }, h("b", { text: "Дни" }), choice({ multiple: true, label: "Дни тренировок", value: draft.days, options: WEEKDAYS.map((w, i) => ({ value: i + 1, label: w })), onChange: v => { draft.days = v; } })),
      h("label", { class: "field" }, h("span", { text: "Время" }), time),
      h("div", { class: "q" }, h("b", { text: "Где" }), choice({ label: "Место", value: draft.place, options: Object.entries(PLACE_WORD).map(([id, word]) => ({ value: id, label: word[0].toUpperCase() + word.slice(1) })), onChange: v => { draft.place = v; } })),
      h("div", { class: "q" }, h("b", { text: "После чего (привычка-якорь)" }),
        choice({ label: "Привычка-якорь", value: PLAN_CUES.includes(draft.cue) ? draft.cue : "", options: PLAN_CUES.map(c => ({ value: c, label: c })), onChange: v => { draft.cue = v; custom.value = ""; } })),
      h("label", { class: "field" }, h("span", { text: "Или своя привычка" }), custom),
      h("div", { class: "note-box ok small", text: "Запасной план: если день не задался, сделайте хотя бы утреннюю зарядку или разминку на 3 минуты — привычка не прервётся. Один пропуск не страшен, главное — вернуться." }),
      err
    ],
    actions: [h("button", {
      class: "btn primary", type: "button", text: "Сохранить план",
      onClick: () => {
        if (!draft.days.length) { err.textContent = "Выберите хотя бы один день"; return; }
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time.value)) { err.textContent = "Укажите время"; return; }
        p.days = draft.days.slice().sort();
        p.planTime = time.value;
        p.planPlace = draft.place;
        p.planCue = clean(custom.value, 60) || draft.cue || "";
        persist();
        close();
        refresh();
        toast("План сохранён. Добавьте его в календарь: «Профиль» → «План и напоминания»");
      }
    })]
  });
}

// Правило 24 часов: боль на следующий день не должна быть сильнее, чем до тренировки
function followupCard() {
  const s = E.pendingFollowup(state);
  if (!s) return null;
  const zones = [...new Set(s.pains.map(x => x.region))];
  const names = zones.map(id => REGION[id].name.toLowerCase()).join(", ");
  const when = s.d === E.shiftDay(E.dayKey(), -1) ? "вчерашней тренировки" : `тренировки ${fmtDate(s.d)}`;
  const answer = v => {
    s.after = v;
    if (v === "worse") zones.forEach(id => E.reportPain(state, id));
    planCache.key = "";
    persist();
    refresh();
    toast(v === "worse" ? "Бережём зону ещё неделю. Если боль не проходит или усиливается — покажитесь врачу" : v === "same" ? "Понятно. Тренер продолжит беречь эту зону" : "Отлично! Продолжаем по плану");
  };
  return h("section", { class: "card glass followup" },
    h("p", { class: "eyebrow", text: "Правило 24 часов" }),
    h("h2", { text: `Как ${names} после ${when}?` }),
    h("p", { class: "muted small" }, "Нормально, если к утру боль утихла. Если стало хуже, чем до тренировки, нагрузку на эту зону нужно снизить. ",
      h("a", { href: "#guide/pain-exercise", text: "Какая боль допустима" })),
    h("div", { class: "btn-row answer-row" },
      h("button", { class: "btn small ghost", type: "button", text: "Не болит", onClick: () => answer("better") }),
      h("button", { class: "btn small ghost", type: "button", text: "Как до тренировки", onClick: () => answer("same") }),
      h("button", { class: "btn small pain", type: "button", text: "Сильнее, чем было", onClick: () => answer("worse") })));
}

// Итоги прошлой недели — в понедельник и вторник, как еженедельная сводка у больших приложений
function weekSummaryCard() {
  const dow = new Date().getDay();
  if (dow !== 1 && dow !== 2) return null;
  const w = E.lastWeek(state);
  if (!w.sessions || state.settings.weekSummary === w.mon) return null;
  const hide = () => { state.settings.weekSummary = w.mon; persist(); refresh(); };
  return h("section", { class: "card glass" },
    h("p", { class: "eyebrow", text: `Итоги недели · ${fmtDate(w.mon)} — ${fmtDate(w.sun)}` }),
    h("h2", { text: w.workouts >= w.goal ? "План недели выполнен — так держать!" : w.workouts ? "Хорошая неделя! Эта будет ещё лучше" : "Новая неделя — новый шанс" }),
    h("div", { class: "stats" },
      stat(`${w.workouts}/${w.goal}`, "тренировок"),
      stat(w.mins, E.plural(w.mins, "минута", "минуты", "минут")),
      w.km ? stat(fmtNum(w.km), "км") : stat(w.prs.length, E.plural(w.prs.length, "рекорд", "рекорда", "рекордов"))),
    h("div", { class: "btn-row" },
      h("button", {
        class: "btn small ghost", type: "button",
        onClick: () => shareCard({
          title: "Моя неделя в движении", sub: `${fmtDate(w.mon)} — ${fmtDate(w.sun)}`,
          stats: [[`${w.workouts}/${w.goal}`, "тренировок по плану"], [w.mins, "минут активности"], w.km ? [fmtNum(w.km), "км пешком и бегом"] : [w.badges, E.plural(w.badges, "новая награда", "новые награды", "новых наград")], [E.weekStreak(state), "недель подряд по плану"]]
        }, `Моя неделя в Листопульсе: ${w.workouts} ${E.plural(w.workouts, "тренировка", "тренировки", "тренировок")} и ${w.mins} мин активности 🌿 ${appUrl()}`)
      }, icon("share", 16), "Поделиться"),
      h("button", { class: "btn small ghost", type: "button", text: "Скрыть", onClick: hide })));
}

// Анкета готовности к нагрузкам действует год: по правилам PAR-Q+ её обновляют ежегодно и при изменениях здоровья
function rescreenCard() {
  const at = state.profile.screenedAt;
  if (!at || at > E.shiftDay(E.dayKey(), -365)) return null;
  return h("section", { class: "card glass warn" },
    h("p", { class: "eyebrow", text: "Безопасность" }),
    h("h2", { text: "Обновите анкету о здоровье" }),
    h("p", { class: "muted small", text: `Вы заполняли её ${fmtDate(at, { day: "numeric", month: "long", year: "numeric" })}. Ответы стоит обновлять раз в год и при любых изменениях здоровья. Тренировки и дневник сохранятся.` }),
    h("div", { class: "btn-row" }, h("button", { class: "btn primary", type: "button", text: "Пройти анкету", onClick: () => { state.profile.onboarded = false; onb = null; onbStep = 0; persist(); render(); } })));
}

// Что нового: короткая карточка после обновления, без всплывающих окон
const WHATS_NEW = [
  "Персонализация: «Профиль» → «Персонализация» — меняйте приложение под себя",
  "7 готовых стилей, 8 цветов и любой свой цвет — текст всегда остаётся читаемым",
  "Фон на выбор или своё фото, 6 встроенных шрифтов, размер и жирность текста",
  "Порядок блоков главного экрана и вкладок, стартовый экран, свой девиз",
  "Аватар: фото или эмодзи; избранные тренировки — на главном экране",
  "Цвет фигур и 3D-манекена, скорость схем, код стиля, чтобы поделиться с другом"
];
function whatsNewCard() {
  if (state.settings.seenVersion === VERSION) return null;
  return h("section", { class: "card glass whats-new" },
    h("p", { class: "eyebrow", text: `Обновление ${VERSION}` }),
    h("h2", { text: "Что нового" }),
    h("ul", { class: "bullets small" }, WHATS_NEW.map(t => h("li", { text: t }))),
    h("div", { class: "btn-row" }, h("button", { class: "btn small ghost", type: "button", text: "Понятно", onClick: () => { state.settings.seenVersion = VERSION; persist(); refresh(); } })));
}


// Напоминание о резервной копии: данные живут только на устройстве
function saveBackup() {
  download(`listopuls-${E.dayKey()}.json`, store.exportJSON(state, { look, media }), "application/json");
  state.settings.lastBackup = E.dayKey();
  state.settings.backupSnooze = "";
  persist();
}
function backupCard() {
  const st = state.settings;
  const d = E.dayKey();
  if (state.sessions.length < 4) return null;
  if (st.lastBackup && st.lastBackup > E.shiftDay(d, -30)) return null;
  if (st.backupSnooze && st.backupSnooze > d) return null;
  return h("section", { class: "card glass" },
    h("p", { class: "eyebrow", text: "Сохранность данных" }),
    h("h2", { text: st.lastBackup ? "Пора обновить резервную копию" : "Сохраните резервную копию" }),
    h("p", { class: "muted small", text: `Ваши данные хранятся только на этом устройстве${st.lastBackup ? `, последняя копия — ${fmtDate(st.lastBackup)}` : ""}. Если браузер очистит память, история пропадёт, а файл копии вернёт всё за минуту.` }),
    h("div", { class: "btn-row" },
      h("button", { class: "btn primary", type: "button", onClick: () => { saveBackup(); refresh(); toast("Копия сохранена — храните файл в надёжном месте"); } }, icon("download", 18), "Сохранить копию"),
      h("button", { class: "btn ghost", type: "button", text: "Позже", onClick: () => { st.backupSnooze = E.shiftDay(d, 14); persist(); refresh(); } })));
}
// Просим браузер не удалять данные при нехватке места (без запроса, если браузер решает сам)
function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => (p ? true : navigator.storage.persist())).catch(() => {});
  } catch (e) { /* не поддерживается */ }
}


// ===== Тренировки =====
// Три раздела: «План» на сегодня, «Каталог» всего, что можно сделать, и «Мои» тренировки
const WORKOUT_TABS = [["", "План"], ["catalog", "Каталог"], ["mine", "Мои"]];
function workoutTabs(active) {
  return h("nav", { class: "seg sub-tabs", "aria-label": "Разделы тренировок" },
    WORKOUT_TABS.map(([id, label]) => h("a", { class: "chip", href: id ? `#workout/${id}` : "#workout", "aria-current": id === active ? "page" : null }, label)));
}
// Неразрывный пробел: «21,3 кг» не разрывается между строками
const fmtKg = kg => (kg === null || kg === undefined ? "—\u00a0кг" : `${String(kg).replace(".", ",")}\u00a0кг`);
const lastKg = id => (state.weights[id] ? state.weights[id].kg : null);
// Доза для списка: подходы, повторы и рабочий вес, если он записан
function doseLine(it, sets) {
  const ex = EX[it.id];
  const base = sets > 1 ? `${sets} × ${E.doseText(it)}` : E.doseText(it);
  return ex.weighted && lastKg(it.id) !== null ? `${base} · ${fmtKg(lastKg(it.id))}` : base;
}
function exRows(items, sets = 1, start = 0) {
  return items.map((it, i) => {
    const ex = EX[it.id];
    return h("div", { class: "ex-row" },
      h("span", { class: "ex-num", text: String(start + i + 1) }),
      h("div", { class: "row-text" }, h("b", { text: ex.name }), h("span", { class: "muted small", text: doseLine(it, sets) })),
      h("button", { class: "icon-btn", type: "button", "aria-label": `Подробнее: ${ex.name}`, onClick: () => exerciseSheet(ex.id) }, icon("info", 20)));
  });
}

// Категории каталога: каждая — отдельная страница
const CATALOG = [
  ["ready", "bolt", "Готовые тренировки", () => `${QUICK.length} комплексов на 4–15 минут`],
  ["programs", "flag", "Программы", () => "Восстановление и сила по шагам"],
  ["cardio", "today", "Бег и прогулки", () => "Бег с нуля, GPS, интервалы"],
  ["challenges", "trophy", "Челленджи", () => "30 дней: планка, осанка, равновесие и др."],
  ["stretch", "leaf", "Йога и растяжка", () => "Гибкость, спина, перед сном"],
  ["weights", "workout", "С весами", () => "Гантели, гиря, штанга"],
  ["tools", "timer", "Таймеры и рекорды", () => "Интервалы, дыхание, статика"],
  ["library", "book", "Все упражнения", () => `${EXERCISES.length} со схемами движений`]
];
const CATALOG_PAGES = {
  ready: ["Готовые тренировки", () => readyWorkouts()],
  programs: ["Программы", () => programsSection()],
  cardio: ["Бег и прогулки", () => cardioSection()],
  challenges: ["Челленджи на 30 дней", () => challengesSection()],
  stretch: ["Йога и растяжка", () => stretchSection()],
  weights: ["С весами", () => weightsSection()],
  tools: ["Таймеры и рекорды", () => toolsSection()]
};
function viewWorkout(sub) {
  if (own(CATALOG_PAGES, sub)) {
    const [title, fn] = CATALOG_PAGES[sub];
    return [h("a", { class: "back-link", href: "#workout/catalog" }, icon("back", 18), "Каталог"), h("h1", { class: "page-title", text: title }), ...fn()];
  }
  const tab = sub === "catalog" || sub === "mine" ? sub : "";
  const head = [h("h1", { class: "page-title", text: "Тренировки" }), workoutTabs(tab)];
  if (tab === "catalog") return [...head, ...catalogView()];
  if (tab === "mine") return [...head, ...myWorkouts()];
  return [...head, ...planView()];
}
const catalogFilter = { q: "" };
function catalogView() {
  const results = h("div", { class: "list search-results", "aria-live": "polite" });
  const fill = () => {
    const q = catalogFilter.q.trim().toLowerCase();
    results.hidden = q.length < 2;
    if (q.length < 2) { results.replaceChildren(); return; }
    const quick = QUICK.filter(x => `${x.name} ${x.desc}`.toLowerCase().includes(q)).slice(0, 5);
    const progs = PROGRAMS.filter(x => `${x.name} ${x.desc}`.toLowerCase().includes(q)).slice(0, 4);
    const chals = CHALLENGES.filter(x => `${x.name} ${x.desc}`.toLowerCase().includes(q)).slice(0, 3);
    const exs = EXERCISES.filter(x => x.name.toLowerCase().includes(q)).slice(0, 12);
    const rowOf = (ic, title, sub, onClick, href) => {
      const inner = [h("span", { class: "fi" }, icon(ic, 18)), h("span", { class: "row-text" }, h("b", { text: title }), h("span", { class: "muted small", text: sub })), icon("chevron", 16)];
      return href ? h("a", { class: "row", href }, inner) : h("button", { class: "row row-btn", type: "button", onClick }, inner);
    };
    const rows = [
      ...quick.map(x => rowOf("bolt", x.name, `Тренировка · ${x.desc}`, () => quickSheet(x.id))),
      ...progs.map(x => rowOf("flag", x.name, `Программа · ${x.days} ${E.plural(x.days, "занятие", "занятия", "занятий")}`, null, `#program/${x.id}`)),
      ...chals.map(x => rowOf("trophy", x.name, "Челлендж на 30 дней", null, `#challenge/${x.id}`)),
      ...exs.map(x => rowOf("info", x.name, `Упражнение · ${GROUPS[x.group]}`, () => exerciseSheet(x.id)))
    ];
    results.replaceChildren(...(rows.length ? rows : [h("p", { class: "muted", text: "Ничего не нашлось" })]));
  };
  const search = h("input", { class: "input", type: "search", placeholder: "Найти упражнение или тренировку", "aria-label": "Поиск по каталогу", maxlength: 60 });
  search.value = catalogFilter.q;
  search.addEventListener("input", () => { catalogFilter.q = search.value; fill(); });
  fill();
  return [
    h("div", { class: "catalog-search" }, search),
    results,
    h("div", { class: "tiles" }, CATALOG.map(([id, ic, title, desc]) => h("a", { class: "tile glass", href: id === "library" ? "#more/library" : `#workout/${id}` },
      h("span", { class: "fi" }, icon(ic, 20)), h("b", { text: title }), h("span", { class: "muted small", text: desc() }))))
  ];
}
function cardioSection() {
  const walk = CHALLENGES.find(c => c.id === "walk30");
  return [
    h("p", { class: "lead", text: "Выносливость, сердце и настроение: от прогулки до 30 минут бега без остановки." }),
    h("div", { class: "quick" },
      runCard(),
      h("a", { class: "quick-item glass", href: "#more/gps" },
        h("span", { class: "fi" }, icon("today", 20)),
        h("span", { class: "row-text" }, h("b", { text: "Прогулка или пробежка с GPS" }), h("span", { class: "muted small", text: "Дистанция, время и темп — координаты не сохраняются" })),
        icon("chevron", 18)),
      challengeCard(walk),
      ...["quietCardio", "hiit"].map(id => QUICK.find(q => q.id === id)).filter(Boolean).map(quickCard),
      h("a", { class: "quick-item glass", href: "#more/timer" },
        h("span", { class: "fi" }, icon("timer", 20)),
        h("span", { class: "row-text" }, h("b", { text: "Интервальный таймер" }), h("span", { class: "muted small", text: "Свои интервалы работы и отдыха" })),
        icon("chevron", 18)))
  ];
}
function challengesSection() {
  return [
    h("p", { class: "lead", text: "Каждый день немного больше. Один день челленджа — один календарный день, отдых тоже засчитывается." }),
    h("div", { class: "quick" }, CHALLENGES.map(challengeCard))
  ];
}
function stretchSection() {
  const ids = ["yoga", "stretchAll", "evening", "posture", "back", "desk", "snack"];
  return [
    h("p", { class: "lead", text: "Мягкие тренировки для гибкости, спины и хорошего сна." }),
    h("div", { class: "quick" }, ids.map(id => QUICK.find(q => q.id === id)).filter(Boolean).map(quickCard), challengeCard(CHALLENGES.find(c => c.id === "stretch30")))
  ];
}
function weightsSection() {
  return [
    h("p", { class: "lead", text: "Гантели, гиря или штанга. Отметьте свой инвентарь в профиле — тогда упражнения не придётся заменять." }),
    h("h2", { class: "section-title", text: "Тренировки" }),
    h("div", { class: "quick" }, QUICK.filter(q => q.cat === "weights").map(quickCard)),
    h("h2", { class: "section-title", text: "Силовые программы" }),
    h("div", { class: "quick" }, PROGRAMS.filter(p => p.kind === "strength").map(programCard)),
    h("p", { class: "center", style: { marginTop: "18px" } }, h("a", { href: "#journal/strength", text: "Мои рабочие веса и рекорды →" }))
  ];
}
function toolsSection() {
  const item = (href, ic, title, desc) => h("a", { class: "quick-item glass", href },
    h("span", { class: "fi" }, icon(ic, 20)), h("span", { class: "row-text" }, h("b", { text: title }), h("span", { class: "muted small", text: desc })), icon("chevron", 18));
  return [h("div", { class: "quick" },
    item("#more/timer", "timer", "Интервальный таймер", "Работа и отдых по кругу, готовые режимы"),
    item("#more/breath", "wind", "Дыхание", "Спокойствие за пару минут"),
    item("#more/records", "trophy", "Рекорды статики", "Планка, «стульчик», мостик — на время"),
    item("#builder", "puzzle", "Конструктор тренировки", "Своя тренировка из любых упражнений"))];
}

function planView() {
  const plan = currentPlan();
  const p = state.profile;
  const d = E.dayKey();
  const goal = GOALS.find(g => g.id === p.goal);
  const hasWeights = p.equipment.some(e => WEIGHT_EQUIP.includes(e));
  const out = [
    h("p", { class: "lead", text: "План собран под вашу цель, самочувствие и особенности тела. Меняйте настройки — план пересоберётся." }),
    h("section", { class: "card glass" },
      h("div", { class: "q" }, h("b", { text: "Длительность" }),
        choice({ className: "seg", label: "Длительность", value: p.minutes, options: [10, 20, 30, 45].map(m => ({ value: m, label: `${m} мин` })), onChange: v => { p.minutes = v; persist(); refresh(); } })),
      h("div", { class: "q" }, h("b", { text: "Цель" }),
        choice({ label: "Цель", value: p.goal, options: GOALS.map(g => ({ value: g.id, label: g.name })), onChange: v => { p.goal = v; persist(); refresh(); } })),
      goal && goal.weights && !hasWeights ? h("p", { class: "note-box small", text: "Для этой цели пригодятся гантели или гиря. Отметьте их в профиле — или тренер подберёт силовые упражнения с весом тела." }) : null,
      plan.blocked ? null : h("div", { class: "q" }, h("b", { text: "Интенсивность сегодня" }),
        choice({ className: "seg", label: "Интенсивность", value: plan.mode, options: Object.entries(E.MODES).map(([id, m]) => ({ value: id, label: m.short })), onChange: v => { state.modeOverride = { d, mode: v }; persist(); refresh(); } })))
  ];

  if (plan.adaptations.length || plan.notes.length) {
    out.push(h("section", { class: "card glass" },
      h("div", { class: "card-head" },
        h("div", {}, h("p", { class: "eyebrow", text: "Тренер учёл" }), h("h2", { text: "Ваши особенности" })),
        h("a", { class: "btn small ghost", href: "#body", text: "Изменить" })),
      h("ul", { class: "adapt" },
        plan.adaptations.map(a => h("li", { text: a })),
        plan.notes.map(n => h("li", { class: "note", text: n })))));
  }

  let num = 0;
  for (const b of plan.blocks) {
    const sets = b.sets || 1;
    out.push(h("section", { class: "card glass" },
      h("div", { class: "block-head" },
        h("h3", { text: b.name }),
        sets > 1 ? h("span", { class: "pill", text: `${sets} ${E.plural(sets, "подход", "подхода", "подходов")}` })
          : b.rounds > 1 ? h("span", { class: "pill", text: `${b.rounds} ${E.plural(b.rounds, "круг", "круга", "кругов")}` }) : null),
      exRows(b.items, sets, num)));
    num += b.items.length;
  }
  const setsBlock = plan.blocks.find(b => b.sets);
  if (!plan.blocked && plan.rest > 10) {
    out.push(h("p", { class: "muted small center", text: `≈ ${plan.est} мин · отдых ${setsBlock ? "между подходами" : "между упражнениями основной части"} — ${plan.rest} сек` }));
  }
  if (setsBlock && setsBlock.items.some(it => EX[it.id].weighted)) {
    out.push(h("p", { class: "muted small center", text: "Вес подбирайте так, чтобы последние 2–3 повтора давались тяжело, но без потери техники. В плеере его можно записать." }));
  }

  out.push(h("div", { class: "btn-row" },
    h("button", { class: "btn primary", type: "button", onClick: () => startPlayer(plan) }, icon("play", 18), plan.blocked ? "Начать дыхание" : "Начать тренировку"),
    plan.blocked ? null : h("button", {
      class: "btn ghost", type: "button",
      onClick: () => { state.planVariant = { d, n: variant() + 1 }; persist(); refresh(); toast("Собрали другой вариант"); }
    }, icon("refresh", 18), "Другой вариант")));
  out.push(h("p", { class: "center", style: { marginTop: "18px" } }, h("a", { href: "#workout/ready", text: "Готовые тренировки, в том числе с весами →" })));
  return out;
}

// ----- Готовые тренировки -----
function quickCard(q) {
  const missing = (q.equip || []).filter(e => !state.profile.equipment.includes(e));
  return h("button", { class: "quick-item glass", type: "button", onClick: () => quickSheet(q.id) },
    h("span", { class: "fi" }, icon(q.cat === "weights" ? "workout" : "bolt", 20)),
    h("span", { class: "row-text" },
      h("b", { text: q.name }),
      h("span", { class: "muted small", text: q.desc }),
      missing.length ? h("span", { class: "need", text: `Нужно: ${missing.map(e => equipName(e).toLowerCase()).join(", ")}` }) : null),
    icon("chevron", 18));
}
// Готовые тренировки по смысловым группам: короткие списки легче просматривать, чем один длинный
const READY_GROUPS = [
  ["Быстро, в течение дня", ["snack", "desk", "posture", "morning"]],
  ["Сила и кардио дома", ["noEquip", "coreSafe", "quietCardio", "hiit", "bandBody"]],
  ["Суставы, спина и равновесие", ["joints", "knees", "ankles", "shoulders", "back", "balance", "balance2", "seated"]],
  ["Растяжка и расслабление", ["yoga", "stretchAll", "evening"]]
];
// Строка списка: компактнее карточки, длинный каталог читается как «Настройки» в iPhone
function quickRow(q) {
  const missing = (q.equip || []).filter(e => !state.profile.equipment.includes(e));
  return h("button", { class: "row row-btn lg-row", type: "button", onClick: () => quickSheet(q.id) },
    h("span", { class: "fi" }, icon(q.cat === "weights" ? "workout" : "bolt", 18)),
    h("span", { class: "row-text" },
      h("b", { text: q.name }),
      h("span", { class: "muted small", text: q.desc }),
      missing.length ? h("span", { class: "need", text: `Нужно: ${missing.map(e => equipName(e).toLowerCase()).join(", ")}` }) : null),
    icon("chevron", 16));
}
function readyWorkouts() {
  const listed = new Set(READY_GROUPS.flatMap(g => g[1]));
  const rest = QUICK.filter(q => q.cat !== "weights" && !listed.has(q.id));
  const group = (title, list) => list.length ? [h("h2", { class: "group-title", text: title }), h("section", { class: "card glass list-group" }, h("div", { class: "list" }, list.map(quickRow)))] : [];
  return [
    h("p", { class: "lead", text: "Комплексы на любой случай. Неподходящие вам упражнения тренер заменит безопасными." }),
    ...READY_GROUPS.flatMap(([title, ids]) => group(title, ids.map(id => QUICK.find(q => q.id === id)).filter(Boolean))),
    ...group("Другие", rest),
    ...group("С весами", QUICK.filter(q => q.cat === "weights"))
  ];
}

function sessionSheet(s, { title, info, extra, actions }) {
  const items = s.blocks.flatMap(b => b.items);
  const close = sheet({
    title,
    body: [
      h("p", { class: "muted", text: s.blocked ? "Сейчас тренировки на паузе — доступна только дыхательная практика." : info }),
      extra || null,
      exRows(items),
      s.adaptations.length ? h("ul", { class: "adapt", style: { marginTop: "12px" } }, s.adaptations.map(a => h("li", { text: a }))) : null
    ],
    actions: actions(() => close())
  });
  return close;
}
function roundsInfo(s) {
  const b = s.blocks[0];
  const rounds = b ? b.rounds : 1;
  return `≈ ${s.est} мин${rounds > 1 ? ` · ${rounds} ${E.plural(rounds, "круг", "круга", "кругов")}` : ""}${s.rest ? ` · отдых ${s.rest} сек` : " · упражнения идут друг за другом"}`;
}
function quickSheet(id) {
  const q = QUICK.find(x => x.id === id);
  const s = E.buildQuick(state, id);
  const missing = ((q && q.equip) || []).filter(e => !state.profile.equipment.includes(e));
  sessionSheet(s, {
    title: s.title,
    info: roundsInfo(s),
    extra: missing.length ? h("div", { class: "note-box" },
      h("p", { class: "small" }, `Нужно: ${missing.map(e => equipName(e).toLowerCase()).join(", ")}. Без этого упражнения заменятся похожими — или `,
        h("a", { href: "#more/profile", text: "отметьте инвентарь в профиле" }), ".")) : null,
    actions: close => [favButton(id), h("button", { class: "btn primary", type: "button", onClick: () => { close(); startPlayer(s); } }, icon("play", 18), "Начать")]
  });
}
function favButton(id) {
  const label = () => (state.favs.includes(id) ? "В избранном" : "В избранное");
  const text = h("span", { text: label() });
  const btn = h("button", { class: "btn ghost", type: "button", "aria-pressed": state.favs.includes(id) ? "true" : "false" }, icon("star", 18), text);
  btn.addEventListener("click", () => {
    if (state.favs.includes(id)) state.favs = state.favs.filter(x => x !== id);
    else if (state.favs.length < 12) state.favs = [...state.favs, id];
    else { toast("В избранном уже 12 тренировок"); return; }
    persist();
    btn.setAttribute("aria-pressed", state.favs.includes(id) ? "true" : "false");
    text.textContent = label();
    toast(state.favs.includes(id) ? "Добавлено на главный экран" : "Убрано из избранного");
    if (!document.querySelector(".player")) setTimeout(refresh, 0);
  });
  return btn;
}

// ----- Свои тренировки -----
const customSession = w => E.buildCustom(state, { title: w.name, ids: w.items, rounds: w.rounds, rest: w.rest, kind: "custom", goal: "custom" });
function myWorkouts() {
  const list = state.custom;
  return [
    h("p", { class: "lead", text: "Соберите тренировку из любых упражнений библиотеки. Тренер всё равно проверит её на безопасность и заменит то, что вам сейчас нельзя." }),
    h("div", { class: "btn-row", style: { margin: "0 0 16px" } }, h("a", { class: "btn primary", href: "#builder" }, icon("plus", 18), "Собрать тренировку")),
    favCard(),
    list.length
      ? h("div", { class: "quick" }, list.map(w => h("button", { class: "quick-item glass", type: "button", onClick: () => customSheet(w.id) },
        h("span", { class: "fi" }, icon("puzzle", 20)),
        h("span", { class: "row-text" },
          h("b", { text: w.name }),
          h("span", { class: "muted small", text: `${w.items.length} ${E.plural(w.items.length, "упражнение", "упражнения", "упражнений")} · ${w.rounds} ${E.plural(w.rounds, "круг", "круга", "кругов")} · ≈ ${customSession(w).est} мин` })),
        icon("chevron", 18))))
      : h("section", { class: "card glass" }, h("p", { class: "muted", text: "Своих тренировок пока нет. Нажмите «Собрать тренировку», выберите упражнения, число кругов и отдых — тренировка сохранится здесь." }))
  ];
}
function customSheet(id) {
  const w = state.custom.find(x => x.id === id);
  if (!w) return;
  const s = customSession(w);
  sessionSheet(s, {
    title: w.name,
    info: roundsInfo(s),
    actions: close => [
      h("a", { class: "btn ghost", href: `#builder/${w.id}`, onClick: () => close(), text: "Изменить" }),
      h("button", { class: "btn primary", type: "button", onClick: () => { close(); startPlayer(s); } }, icon("play", 18), "Начать")
    ]
  });
}

// ----- Конструктор -----
let builderDraft = null;
const REST_OPTIONS = [0, 15, 30, 45, 60, 90];
function viewBuilder(sub) {
  const existing = sub ? state.custom.find(w => w.id === sub) : null;
  const key = existing ? existing.id : "new";
  if (!builderDraft || builderDraft.key !== key) {
    builderDraft = existing
      ? { key, name: existing.name, items: existing.items.slice(), rounds: existing.rounds, rest: existing.rest }
      : { key, name: "", items: [], rounds: 2, rest: 30 };
  }
  const D = builderDraft;
  const list = h("div", { class: "list" });
  const count = h("span", { class: "pill muted-pill" });
  const est = h("p", { class: "muted small", style: { marginTop: "10px" } });
  const err = h("p", { class: "error", role: "alert" });
  const draftSession = () => customSession({ name: clean(D.name, 40) || "Моя тренировка", items: D.items, rounds: D.rounds, rest: D.rest });
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= D.items.length) return;
    [D.items[i], D.items[j]] = [D.items[j], D.items[i]];
    fill();
  };
  const fill = () => {
    count.textContent = `${D.items.length} из 20`;
    list.replaceChildren(...(D.items.length ? D.items.map((id, i) => h("div", { class: "row builder-row" },
      h("span", { class: "ex-num", text: String(i + 1) }),
      h("span", { class: "row-text" }, h("b", { text: EX[id].name }), h("span", { class: "muted small", text: `${GROUPS[EX[id].group]} · ${E.doseText(E.makeItem(EX[id], 1))}` })),
      h("span", { class: "row-tools" },
        h("button", { class: "icon-btn mini", type: "button", "aria-label": `Выше: ${EX[id].name}`, disabled: i === 0, onClick: () => move(i, -1) }, icon("up", 16)),
        h("button", { class: "icon-btn mini", type: "button", "aria-label": `Ниже: ${EX[id].name}`, disabled: i === D.items.length - 1, onClick: () => move(i, 1) }, icon("down", 16)),
        h("button", { class: "icon-btn mini", type: "button", "aria-label": `Убрать: ${EX[id].name}`, onClick: () => { D.items.splice(i, 1); fill(); } }, icon("close", 16)))))
      : [h("p", { class: "muted", text: "Добавьте 5–8 упражнений: разминку, основные и растяжку в конце." })]));
    if (D.items.length) {
      const s = draftSession();
      est.textContent = `≈ ${s.est} мин${s.adaptations.length ? ` · ${s.adaptations.length} ${E.plural(s.adaptations.length, "упражнение тренер заменит", "упражнения тренер заменит", "упражнений тренер заменит")} ради безопасности` : ""}`;
    } else est.textContent = "";
  };
  const name = h("input", { class: "input", maxlength: 40, placeholder: "Например: Ноги и спина", "aria-label": "Название тренировки" });
  name.value = D.name;
  name.addEventListener("input", () => { D.name = name.value; });
  const roundsVal = h("b", { class: "stepper-val", text: String(D.rounds) });
  const setRounds = v => { D.rounds = Math.min(5, Math.max(1, v)); roundsVal.textContent = String(D.rounds); fill(); };
  const save = () => {
    if (!D.items.length) { err.textContent = "Добавьте хотя бы одно упражнение"; return false; }
    const item = { id: existing ? existing.id : newId(), name: clean(D.name, 40) || "Моя тренировка", items: D.items.slice(0, 20), rounds: D.rounds, rest: D.rest, d: E.dayKey() };
    if (!existing && state.custom.length >= 20) { err.textContent = "Можно сохранить до 20 тренировок — удалите старые"; return false; }
    state.custom = existing ? state.custom.map(w => (w.id === existing.id ? item : w)) : state.custom.concat(item);
    const nb = E.newBadges(state);
    persist();
    builderDraft = null;
    toast(nb.length ? badgeToast(nb) : "Тренировка сохранена");
    return true;
  };
  fill();
  return [
    h("a", { class: "back-link", href: "#workout/mine" }, icon("back", 18), "Мои тренировки"),
    h("h1", { class: "page-title", text: existing ? "Изменить тренировку" : "Своя тренировка" }),
    h("section", { class: "card glass" }, h("label", { class: "field" }, h("span", { text: "Название" }), name)),
    h("section", { class: "card glass" },
      h("div", { class: "card-head" }, h("h2", { text: "Упражнения" }), count),
      list,
      h("div", { class: "btn-row" }, h("button", {
        class: "btn ghost", type: "button",
        onClick: () => {
          if (D.items.length >= 20) { toast("В тренировке — не больше 20 упражнений"); return; }
          exercisePicker(D.items, id => { if (D.items.length < 20 && !D.items.includes(id)) { D.items.push(id); fill(); } });
        }
      }, icon("plus", 18), "Добавить упражнение"))),
    h("section", { class: "card glass" },
      h("div", { class: "list" },
        h("div", { class: "row" },
          h("span", { class: "row-text" }, h("b", { text: "Круги" }), h("span", { class: "muted small", text: "Сколько раз пройти весь список" })),
          h("button", { class: "icon-btn", type: "button", "aria-label": "Меньше кругов", onClick: () => setRounds(D.rounds - 1) }, "−"),
          roundsVal,
          h("button", { class: "icon-btn", type: "button", "aria-label": "Больше кругов", onClick: () => setRounds(D.rounds + 1) }, "+"))),
      h("div", { class: "q", style: { marginTop: "12px" } }, h("b", { text: "Отдых между упражнениями" }),
        choice({ className: "chips", label: "Отдых", value: D.rest, options: REST_OPTIONS.map(v => ({ value: v, label: v ? `${v} с` : "без отдыха" })), onChange: v => { D.rest = v; fill(); } })),
      est),
    err,
    h("div", { class: "btn-row" },
      h("button", { class: "btn ghost", type: "button", onClick: () => { if (save()) window.location.hash = "#workout/mine"; } }, icon("check", 18), "Сохранить"),
      h("button", {
        class: "btn primary", type: "button",
        onClick: () => {
          if (!D.items.length) { err.textContent = "Добавьте хотя бы одно упражнение"; return; }
          startPlayer(draftSession());
        }
      }, icon("play", 18), "Начать")),
    existing ? h("p", { class: "center", style: { marginTop: "16px" } }, h("button", {
      class: "link-btn small", type: "button", text: "Удалить тренировку",
      onClick: async () => {
        const ok = await confirmSheet({ title: "Удалить тренировку?", message: `«${existing.name}» исчезнет из списка. Записи в дневнике останутся.`, ok: "Удалить", danger: true });
        if (!ok) return;
        state.custom = state.custom.filter(w => w.id !== existing.id);
        builderDraft = null;
        persist();
        window.location.hash = "#workout/mine";
        toast("Тренировка удалена");
      }
    })) : null
  ];
}

// Выбор упражнений для конструктора
const pickFilter = { q: "", group: "all", mine: true };
function exercisePicker(chosen, onAdd) {
  const r = E.restrictions(state);
  const list = h("div", { class: "list" });
  const fill = () => {
    const q = pickFilter.q.trim().toLowerCase();
    const items = EXERCISES.filter(ex =>
      (pickFilter.group === "all" || ex.group === pickFilter.group) &&
      (!q || ex.name.toLowerCase().includes(q)) &&
      (!pickFilter.mine || E.fits(ex, r, state.profile)));
    list.replaceChildren(...(items.length ? items.slice(0, 80).map(ex => {
      const added = chosen.includes(ex.id);
      const btn = h("button", {
        class: `btn small ${added ? "ghost" : "primary"}`, type: "button", disabled: added, "aria-label": added ? `${ex.name}: уже добавлено` : `Добавить: ${ex.name}`,
        onClick: () => { onAdd(ex.id); btn.disabled = true; btn.className = "btn small ghost"; btn.textContent = "✓"; }
      }, added ? "✓" : "+");
      return h("div", { class: "row" },
        h("span", { class: "row-text" }, h("b", { text: ex.name }), h("span", { class: "muted small", text: `${GROUPS[ex.group]} · ${LEVELS[ex.level - 1].name}${ex.equip.length ? ` · ${ex.equip.map(e => equipName(e).toLowerCase()).join(", ")}` : ""}` })),
        btn);
    }) : [h("p", { class: "muted", text: "Ничего не нашлось" })]));
  };
  const search = h("input", { class: "input", type: "search", placeholder: "Поиск упражнения", "aria-label": "Поиск упражнения", maxlength: 60 });
  search.value = pickFilter.q;
  search.addEventListener("input", () => { pickFilter.q = search.value; fill(); });
  fill();
  sheet({
    title: "Добавить упражнение",
    body: [
      search,
      h("div", { style: { margin: "12px 0" } }, choice({
        label: "Группа", value: pickFilter.group,
        options: [{ value: "all", label: "Все" }, ...Object.entries(GROUPS).map(([id, nameValue]) => ({ value: id, label: nameValue }))],
        onChange: v => { pickFilter.group = v; fill(); }
      })),
      toggle({ label: "Только подходящие мне", desc: "С учётом зон, особенностей и инвентаря", checked: pickFilter.mine, onChange: v => { pickFilter.mine = v; fill(); } }),
      list
    ]
  });
}

const LOAD_WORD = ["", "лёгкая", "заметная", "высокая"];
function exerciseSheet(id) {
  const ex = EX[id];
  const r = E.restrictions(state);
  const why = E.whyNot(ex, r, state.profile);
  const alt = why.length ? E.findReplacement(ex, r, state.profile) : null;
  const loads = Object.entries(ex.load);
  const w = state.weights[id];
  sheet({
    title: ex.name,
    body: [
      demoBox(id),
      h("div", { class: "tags" },
        h("span", { class: "pill", text: GROUPS[ex.group] }),
        h("span", { class: "pill muted-pill", text: LEVELS[ex.level - 1].name }),
        ex.equip.map(e => h("span", { class: "pill muted-pill", text: equipName(e) }))),
      h("p", { style: { marginTop: "12px" }, text: `Обычная доза: ${E.doseText(E.makeItem(ex, 1))}` }),
      ex.weighted ? h("p", { class: "small", text: w
        ? `Рабочий вес: ${fmtKg(w.kg)}${w.d ? ` (${fmtDate(w.d)})` : ""}, лучший — ${fmtKg(w.best)}${w.e1rm ? `, расчётный максимум на 1 повтор ≈ ${fmtKg(w.e1rm)}` : ""}.`
        : "Вес подбирайте так, чтобы последние 2–3 повтора давались тяжело, но без потери техники. В плеере можно записать вес и повторы каждого подхода." }) : null,
      ex.weighted && w && w.hist.length > 1 ? h("div", { class: "spark-row" }, weightSpark(w.hist), h("span", { class: "muted small", text: `${w.hist.length} ${E.plural(w.hist.length, "запись", "записи", "записей")}` })) : null,
      h("h3", { class: "sub-title", text: "Как выполнять" }),
      h("ul", { class: "bullets" }, ex.cues.map(c => h("li", { text: c }))),
      h("h3", { class: "sub-title", text: "Нагрузка на суставы и спину" }),
      loads.length ? h("ul", { class: "bullets" }, loads.map(([reg, l]) => h("li", { text: `${REGION[reg].name} — ${LOAD_WORD[l]}` })))
        : h("p", { class: "muted small", text: "Почти не нагружает суставы." }),
      why.length
        ? h("div", { class: "note-box" }, h("b", { text: "Сейчас вам не подходит:" }),
          h("ul", { class: "bullets small" }, why.map(w => h("li", { text: w }))),
          alt ? h("p", { class: "small", text: `Подходящая замена: ${alt.name}` }) : null)
        : h("div", { class: "note-box ok" }, h("b", { text: "✓ Подходит вам сейчас" }))
    ]
  });
}

// ===== Тело =====
const SIDE_WORD = { R: "справа", L: "слева" };
const zoneName = (id, side) => (side ? `${REGION[id].name} (${SIDE_WORD[side]})` : REGION[id].name);
const symptomName = id => (SYMPTOMS.find(x => x.id === id) || { name: id }).name;
const emptyBody = () => ({ sev: 0, note: "", since: "", temp: null, sides: [], symptoms: [], onset: "", triggers: [] });
const painTier = v => (v >= 7 ? 3 : v >= 4 ? 2 : v >= 1 ? 1 : 0);
const painWord = v => (v === 0 ? "не болит" : v <= 3 ? "слабая" : v <= 6 ? "умеренная" : v <= 9 ? "сильная" : "нестерпимая");
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const STAGE_HINT = {
  rotate: "Ведите пальцем по фигуре, чтобы повернуть её. Коснитесь зоны, чтобы отметить её.",
  lasso: "Обведите пальцем место, которое беспокоит, — потом опишите, что там происходит."
};
const STAGE_VIEWS = [["front", "Спереди"], ["back", "Сзади"], ["side", "Сбоку"]];

function bodyStage({ layers = true } = {}) {
  const fig = getFigure();
  if (!layers) bodyLayer = "pain";
  if (fig === undefined) {
    const route = lastRoute;
    loadBody3d().then(() => { if (lastRoute === route || !state.profile.onboarded) render(); });
    return h("div", { class: "stage-loading", role: "status" }, h("span", { class: "spinner", "aria-hidden": "true" }), "Загружаем 3D-модель…");
  }
  if (!fig) {
    return [bodyMap(), h("p", { class: "muted small center", text: "Объёмная модель не поддерживается этим браузером, поэтому показана простая карта. Все зоны есть в списке ниже." })];
  }
  fig.setMode(figureMode);
  const hint = h("p", { class: "stage-hint", "aria-live": "polite", text: STAGE_HINT[figureMode] });
  const painLegend = h("div", { class: "legend" },
    [1, 2, 3].map(v => h("span", { class: `pill sev-${v}`, text: SEVERITY[v].name })),
    h("span", { class: "pill sel-pill", text: "выделение" }));
  const loadLegend = h("div", { class: "legend" },
    h("span", { class: "pill load-0", text: "восстановились" }),
    h("span", { class: "pill load-1", text: "восстанавливаются" }),
    h("span", { class: "pill load-2", text: "нагружены" }));
  const showLayer = () => {
    painLegend.hidden = bodyLayer !== "pain";
    loadLegend.hidden = bodyLayer !== "load";
  };
  showLayer();
  const layer = choice({
    className: "seg stage-layer", label: "Что показать на модели", value: bodyLayer,
    options: [{ value: "pain", label: "Зоны боли" }, { value: "load", label: "Нагрузка мышц" }],
    onChange: v => { bodyLayer = v; showLayer(); paintFigure(); }
  });
  const mode = choice({
    className: "seg stage-mode", label: "Режим работы с моделью", value: figureMode,
    options: [{ value: "rotate", label: "Вращать" }, { value: "lasso", label: "✎ Обвести" }],
    onChange: v => { figureMode = v; fig.setMode(v); hint.textContent = STAGE_HINT[v]; }
  });
  const tool = (ic, label, fn) => h("button", { class: "icon-btn", type: "button", "aria-label": label, title: label, onClick: fn }, icon(ic, 18));
  postRender.push(() => { fig.resize(); paintFigure(); fig.intro(); });
  return h("div", { class: "stage" },
    layers ? layer : null,
    mode,
    h("div", { class: "stage-box" },
      fig.el,
      h("div", { class: "stage-tools" },
        tool("plus", "Приблизить", () => fig.zoomBy(1.25)),
        tool("minus", "Отдалить", () => fig.zoomBy(0.8)),
        tool("refresh", "Исходный вид", () => fig.reset()))),
    h("div", { class: "chips stage-views", role: "group", "aria-label": "Ракурс" },
      STAGE_VIEWS.map(([id, label]) => h("button", { class: "chip", type: "button", onClick: () => fig.setView(id) }, label))),
    hint,
    painLegend,
    loadLegend,
    h("p", { class: "muted small center", text: "Модель стоит к вам лицом: её правая сторона — слева от вас." }));
}

// Восстановление мышц по последним тренировкам (как у силовых приложений, но с учётом боли)
function recoveryCard() {
  const f = E.muscleFatigue(state);
  const keys = Object.keys(E.KEY_NAME).filter(k => f[k] >= 0.05).sort((a, b) => f[b] - f[a]);
  if (!keys.length) return null;
  return h("section", { class: "card glass" },
    h("div", { class: "card-head" },
      h("div", {}, h("p", { class: "eyebrow", text: "После тренировок" }), h("h2", { text: "Восстановление мышц" })),
      figure ? h("button", { class: "btn small ghost", type: "button", text: "На модели", onClick: () => { bodyLayer = "load"; render(); const card = document.querySelector(".stage-card"); if (card) card.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" }); } }) : null),
    h("p", { class: "muted small", text: "Мышцам нужно 48–72 часа, чтобы восстановиться. Тренер сам ставит в план тех, кто уже отдохнул." }),
    h("div", { class: "recovery-list" }, keys.slice(0, 8).map(k => {
      const pct = Math.round((1 - f[k]) * 100);
      const word = pct >= 85 ? "почти готовы" : pct >= 50 ? "восстанавливаются" : "сильно нагружены";
      return h("div", { class: "recovery-item" },
        h("div", { class: "recovery-head" },
          h("b", { text: E.KEY_NAME[k][0].toUpperCase() + E.KEY_NAME[k].slice(1) }),
          h("span", { class: "muted small", text: `${word} · ${pct}%` })),
        h("span", { class: "progress slim recovery-bar", role: "img", "aria-label": `Восстановлено на ${pct}%` }, h("i", { style: { width: `${pct}%` } })));
    })));
}

// Тело: три раздела вместо одной длинной страницы — модель, здоровье и справочник
const BODY_TABS = [["", "Модель"], ["health", "Здоровье"], ["guide", "Справочник"]];
function bodyTabs(active) {
  return h("nav", { class: "seg sub-tabs", "aria-label": "Разделы «Тело»" },
    BODY_TABS.map(([id, label]) => h("a", { class: "chip", href: id === "guide" ? "#guide" : id ? `#body/${id}` : "#body", "aria-current": id === active ? "page" : null }, label)));
}
function viewBody(sub) {
  const r = E.restrictions(state);
  if (sub === "health") return [h("h1", { class: "page-title", text: "Тело" }), bodyTabs("health"), ...bodyHealth(r)];
  return [
    h("h1", { class: "page-title", text: "Тело" }),
    bodyTabs(""),
    h("p", { class: "lead", text: "Коснитесь зоны или обведите место, которое болит, — тренер уберёт опасные упражнения и подскажет, что делать." }),
    h("section", { class: "card glass stage-card" }, bodyStage()),
    recoveryCard(),
    marksCard(),
    regionsCard(r)
  ];
}
function bodyHealth(r) {
  const caution = state.profile.conditions.includes("caution");
  const cautionNote = CONDITIONS.find(c => c.id === "caution").notes[0];
  const notes = [...new Set(r.notes)];
  const pains = state.sessions.slice().reverse().flatMap(x => x.pains.map(p => ({ d: x.d, ex: p.ex, region: p.region }))).slice(0, 8);
  return [
    h("p", { class: "lead", text: "Дневник боли, особенности здоровья и всё, что стоит показать врачу. Данные остаются на этом устройстве." }),
    painCard(),
    pains.length ? h("section", { class: "card glass" },
      h("h2", { text: "Боль во время тренировок" }),
      h("div", { class: "list" }, pains.map(p => h("div", { class: "row" },
        h("span", { class: "row-text" }, h("b", { text: REGION[p.region].name }), h("span", { class: "muted small", text: `${fmtDate(p.d)} · ${own(EX, p.ex) ? EX[p.ex].name : "упражнение"}` }))))),
      h("p", { class: "muted small", text: "Если одна и та же зона болит снова и снова — покажитесь врачу или реабилитологу." })) : null,
    h("section", { class: "card glass" },
      h("div", { class: "card-head" }, h("div", {}, h("h2", { text: "Отчёт для врача" }), h("p", { class: "muted small", text: "Зоны, дневник боли и нагрузка на одной странице — распечатайте или сохраните в PDF." })),
        h("a", { class: "btn small ghost", href: "#report" }, icon("print", 16), "Открыть"))),
    h("section", { class: "card glass" },
      h("h2", { text: "Особенности здоровья" }),
      h("p", { class: "muted small", text: "Выберите всё, что к вам относится, — уберём неподходящие типы нагрузки." }),
      choice({
        multiple: true, label: "Особенности здоровья",
        value: state.profile.conditions.filter(c => c !== "caution"),
        options: CONDITIONS.filter(c => !c.hidden).map(c => ({ value: c.id, label: c.name })),
        onChange: v => { state.profile.conditions = caution ? ["caution", ...v] : v; persist(); refresh(); }
      }),
      caution ? h("div", { class: "note-box" },
        h("b", { text: "Бережный режим включён" }),
        h("p", { class: "small", text: cautionNote }),
        h("button", {
          class: "btn small ghost", type: "button", text: "Врач разрешил обычные нагрузки",
          onClick: async () => {
            const ok = await confirmSheet({ title: "Выключить бережный режим?", message: "Делайте это, только если врач разрешил обычные тренировки.", ok: "Выключить" });
            if (ok) { state.profile.conditions = state.profile.conditions.filter(c => c !== "caution"); persist(); refresh(); }
          }
        })) : null,
      notes.length ? h("ul", { class: "adapt", style: { marginTop: "14px" } }, notes.map(n => h("li", { class: "note", text: n }))) : null,
      h("div", { class: "q" }, h("b", { text: "Возраст" }),
        choice({ label: "Возраст", value: state.profile.ageGroup, options: AGE_GROUPS.map(a => ({ value: a.id, label: a.name })), onChange: v => { state.profile.ageGroup = v; persist(); refresh(); } }))),
    h("section", { class: "card glass alert" },
      h("h2", { text: "Когда сразу остановиться" }),
      h("ul", { class: "bullets" }, RED_FLAGS.map(t => h("li", { text: t }))),
      h("p", {}, h("b", { text: "Боль в груди, обморок, сильная одышка — звоните 112." }))),
    h("details", { class: "card glass details-card" },
      h("summary", { text: "Как тренер учитывает боль" }),
      h("ul", { class: "bullets" },
        h("li", { text: "«Дискомфорт» убирает упражнения с заметной нагрузкой на зону, «ограничение» и «острая боль» — все упражнения, которые её нагружают." }),
        h("li", { text: "Обведённая область работает так же: тренер учитывает каждую зону внутри обводки." }),
        h("li", { text: "Особенности здоровья исключают опасные типы нагрузки: прыжки, высокую интенсивность, положения вниз головой и другие." }),
        h("li", { text: "Кнопка «Больно» во время тренировки сразу заменяет упражнение и 7 дней бережёт эту зону, а на следующий день приложение спросит, как она." }),
        h("li", { text: "Это общие правила безопасности, а не диагноз. Если что-то болит долго или сильно — покажитесь врачу." })))
  ];
}

// ----- Обведённые области -----
function markLabel(m) {
  const names = m.regions.map(x => zoneName(x.id, x.side));
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} и ещё ${names.length - 2}` : names.join(", ");
}
function markSub(m) {
  return [
    m.d ? fmtDate(m.d) : "",
    m.pain ? `боль ${m.pain} из 10` : "",
    m.symptoms.length ? `${symptomName(m.symptoms[0]).toLowerCase()}${m.symptoms.length > 1 ? ` +${m.symptoms.length - 1}` : ""}` : "",
    m.note
  ].filter(Boolean).join(" · ");
}
function startLasso() {
  figureMode = "lasso";
  if (figure) figure.setMode("lasso");
  render();
  const card = document.querySelector(".stage-card");
  if (card) card.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
}
function marksCard() {
  if (!figure && !state.marks.length) return null;
  const list = state.marks.slice().reverse();
  return h("section", { class: "card glass" },
    h("div", { class: "card-head" },
      h("div", {},
        h("p", { class: "eyebrow", text: "Обведено на модели" }),
        h("h2", { text: list.length ? `${list.length} ${E.plural(list.length, "область", "области", "областей")}` : "Пока пусто" })),
      figure ? h("button", { class: "btn small ghost", type: "button", onClick: startLasso, text: "✎ Обвести" }) : null),
    list.length
      ? h("div", { class: "list" }, list.map(m => h("button", { class: "row row-btn", type: "button", onClick: () => markSheet(null, m) },
        h("span", { class: "row-text" }, h("b", { text: markLabel(m) }), h("span", { class: "muted small", text: markSub(m) })),
        h("span", { class: `pill sev-${m.sev}`, text: SEVERITY[m.sev].name }),
        icon("chevron", 18))))
      : h("p", { class: "muted small", text: "Нажмите «Обвести» и проведите пальцем вокруг места, которое болит, — например, внутренней части колена или области под лопаткой. Областей может быть несколько." }));
}

// ----- Дневник боли -----
function trackedRegions() {
  const ids = new Set(E.painRegions(state, 30));
  const today = E.dayKey();
  for (const [id, b] of Object.entries(state.body)) if (b.sev || (b.temp && b.temp.until >= today)) ids.add(id);
  for (const m of state.marks) for (const x of m.regions) ids.add(x.id);
  return REGIONS.map(x => x.id).filter(id => ids.has(id));
}
function painSpark(points) {
  const from = E.shiftDay(E.dayKey(), -29);
  const t0 = new Date(`${from}T12:00:00`).getTime();
  const pts = points.map(p => [4 + (Math.round((new Date(`${p.d}T12:00:00`).getTime() - t0) / 864e5) * 92) / 29, 26 - p.level * 2.2]);
  const last = pts[pts.length - 1];
  return s("svg", { class: "mini-spark", viewBox: "0 0 100 30", preserveAspectRatio: "none", "aria-hidden": "true" },
    s("polyline", { points: pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") }),
    s("circle", { cx: last[0].toFixed(1), cy: last[1].toFixed(1), r: 2.6 }));
}
function trendText(t) {
  if (!t) return { text: "записей пока нет", cls: "muted" };
  if (t.points.length < 2) return { text: `${fmtDate(t.since)}: ${t.last} из 10`, cls: "muted" };
  if (t.delta < 0) return { text: `↓ на ${-t.delta} с ${fmtDate(t.since)}`, cls: "good" };
  if (t.delta > 0) return { text: `↑ на ${t.delta} с ${fmtDate(t.since)}`, cls: "bad" };
  return { text: `без изменений с ${fmtDate(t.since)}`, cls: "muted" };
}
function painCard() {
  const ids = trackedRegions();
  if (!ids.length) return null;
  const today = E.dayKey();
  return h("section", { class: "card glass" },
    h("p", { class: "eyebrow", text: "Дневник боли" }),
    h("h2", { text: "Как меняется боль" }),
    h("p", { class: "muted small", text: "Отмечайте силу боли от 0 до 10 раз в день — по линии видно, идёт ли восстановление. Нажмите на зону, чтобы записать." }),
    h("div", { class: "list" }, ids.slice(0, 12).map(id => {
      const t = E.painTrend(state, id, 30);
      const tr = trendText(t);
      const todayLevel = t && t.points[t.points.length - 1].d === today ? t.last : null;
      return h("button", { class: "row row-btn", type: "button", onClick: () => painLogSheet(id) },
        h("span", { class: "row-text" }, h("b", { text: REGION[id].name }), h("span", { class: `small ${tr.cls}`, text: tr.text })),
        t && t.points.length > 1 ? painSpark(t.points) : null,
        h("span", { class: `pain-level lvl-${todayLevel === null ? "none" : painTier(todayLevel)}`, "aria-hidden": "true", text: todayLevel === null ? "+" : String(todayLevel) }),
        h("span", { class: "visually-hidden", text: todayLevel === null ? "Сегодня не записано" : `Сегодня ${todayLevel} из 10` }));
    })),
    ids.length > 12 ? h("p", { class: "muted small", text: `Показаны 12 зон из ${ids.length}.` }) : null);
}

function painRange(draft, onInput) {
  const out = h("output", { class: "pain-out" });
  const input = h("input", { class: "range", type: "range", min: 0, max: 10, step: 1, value: draft.pain, "aria-label": "Сила боли от 0 до 10" });
  const paint = () => {
    const v = Number(input.value);
    out.textContent = `${v} из 10 — ${painWord(v)}`;
    out.className = `pain-out lvl-${painTier(v)}`;
    input.setAttribute("aria-valuetext", `${v} из 10, ${painWord(v)}`);
  };
  input.addEventListener("input", () => {
    draft.pain = Number(input.value);
    draft.painTouched = true;
    paint();
    if (onInput) onInput();
  });
  paint();
  return h("div", { class: "pain-range" }, input, out,
    h("div", { class: "scale-labels" }, h("span", { text: "0 — не болит" }), h("span", { text: "10 — сильнейшая" })));
}

function painLogSheet(id) {
  const reg = REGION[id];
  const t = E.painTrend(state, id, 30);
  const draft = { pain: t ? t.last : 0, painTouched: false };
  const recent = t ? t.points.slice(-6).reverse() : [];
  const close = sheet({
    title: reg.name,
    body: [
      h("p", { class: "muted small", text: "Насколько болит сейчас? Запись за сегодня можно исправить в любой момент." }),
      painRange(draft),
      recent.length ? [
        h("h3", { class: "sub-title", text: "Последние записи" }),
        h("div", { class: "list" }, recent.map(p => h("div", { class: "row" },
          h("span", { class: "row-text" }, h("b", { text: fmtDate(p.d) })),
          h("span", { class: `pain-level lvl-${painTier(p.level)}`, text: String(p.level) }))))
      ] : null,
      h("p", { class: "muted small", style: { marginTop: "12px" }, text: "Боль, которая нарастает, будит ночью или идёт вместе с отёком, онемением или температурой, — повод показаться врачу." })
    ],
    actions: [h("button", {
      class: "btn primary", type: "button", text: "Записать",
      onClick: () => {
        E.logPain(state, id, draft.pain);
        const nb = E.newBadges(state);
        persist();
        close();
        refresh();
        toast(nb.length ? badgeToast(nb) : `Записали: ${draft.pain} из 10`);
        suggestSeverity(id, draft.pain);
      }
    })]
  });
}

// Сильную боль предлагаем сразу учесть в тренировках
async function suggestSeverity(id, pain) {
  const want = pain >= 7 ? 3 : pain >= 4 ? 2 : 0;
  if (!want || E.regionSeverity(state, id) >= want) return;
  const zone = REGION[id].name.toLowerCase();
  const ok = await confirmSheet({
    title: want === 3 ? "Похоже на сильную боль" : "Боль заметная",
    message: want === 3
      ? `${pain} из 10. Отметить зону «${zone}» как острую боль? Тренер исключит любую нагрузку на неё. Сильная боль — повод обратиться к врачу.`
      : `${pain} из 10. Отметить зону «${zone}» как ограничение? Тренер перестанет её нагружать.`,
    ok: "Да, учесть", cancel: "Не нужно"
  });
  if (!ok || !state) return;
  const b = state.body[id] || (state.body[id] = emptyBody());
  b.sev = want;
  persist();
  refresh();
  toast("Тренировки подстроены");
}

// ----- Описание проблемы: общие поля для зоны и обведённой области -----
function problemFields(draft) {
  const warn = h("div", { class: "note-box", role: "status", hidden: true });
  const update = () => {
    const msgs = [];
    if (draft.pain >= 7) msgs.push("Боль 7 из 10 и сильнее — повод показаться врачу. Пока выберите «Острая боль»: тренер уберёт любую нагрузку на зону.");
    const flags = draft.symptoms.map(id => SYMPTOMS.find(x => x.id === id)).filter(x => x && x.flag);
    if (flags.length) msgs.push(`${flags.map(x => x.name).join(", ")} — с такими признаками лучше показаться врачу, особенно если они появились недавно или нарастают.`);
    if (draft.onset === "days" && ["swelling", "bruise", "sprain"].some(x => draft.symptoms.includes(x))) {
      msgs.push("Свежая травма: первые 1–3 дня берегите зону и держите её приподнятой, холод через ткань — до 15–20 минут. Потом — осторожное движение без сильной боли.");
    }
    warn.hidden = !msgs.length;
    warn.replaceChildren(...msgs.map(m => h("p", { class: "small", text: m })));
  };
  const note = h("textarea", { class: "input", maxlength: 300, rows: 3, placeholder: "Например: болит внутри колена после бега, хуже на лестнице" });
  note.value = draft.note;
  note.addEventListener("input", () => { draft.note = note.value; });
  update();
  return [
    h("div", { class: "q" }, h("b", { text: "Сила боли" }), painRange(draft, update)),
    h("div", { class: "q" }, h("b", { text: "Что беспокоит" }),
      choice({ multiple: true, label: "Что беспокоит", value: draft.symptoms, options: SYMPTOMS.map(x => ({ value: x.id, label: x.name })), onChange: v => { draft.symptoms = v; update(); } })),
    h("div", { class: "q" }, h("b", { text: "Когда началось" }),
      choice({ label: "Когда началось", value: draft.onset, options: [{ value: "", label: "Не указано" }, ...ONSET.map(x => ({ value: x.id, label: x.name }))], onChange: v => { draft.onset = v; update(); } })),
    h("div", { class: "q" }, h("b", { text: "Когда усиливается" }),
      choice({ multiple: true, label: "Когда усиливается", value: draft.triggers, options: TRIGGERS.map(x => ({ value: x.id, label: x.name })), onChange: v => { draft.triggers = v; } })),
    h("label", { class: "field" }, h("span", { text: "Заметка — видна только вам" }), note),
    warn
  ];
}

// Статьи справочника для зон. beforeGo сохраняет черновик перед переходом
function guideFor(regionIds) {
  const seen = new Set();
  for (const id of regionIds) for (const g of REGION[id].guides || []) if (own(GUIDE_BY_ID, g)) seen.add(g);
  return [...seen].map(g => GUIDE_BY_ID[g]);
}
function guideRow(a, beforeGo) {
  return h("a", { class: "row", href: `#guide/${a.id}`, onClick: () => { if (beforeGo) beforeGo(); } },
    h("span", { class: "fi" }, icon("book", 18)),
    h("span", { class: "row-text" }, h("b", { text: a.title }), h("span", { class: "muted small", text: a.short })),
    state.guideRead.includes(a.id) ? h("span", { class: "pill muted-pill", text: "прочитано" }) : null,
    icon("chevron", 18));
}
function guideLinks(regionIds, beforeGo) {
  const list = guideFor(regionIds).slice(0, 4);
  if (!list.length) return null;
  return [h("h3", { class: "sub-title", text: "Что почитать" }), h("div", { class: "list" }, list.map(a => guideRow(a, beforeGo)))];
}

// ----- Список зон -----
function regionsCard(r) {
  return h("section", { class: "card glass" },
    h("h2", { text: "Все зоны" }),
    h("p", { class: "muted small", text: `${REGIONS.length} ${E.plural(REGIONS.length, "зона", "зоны", "зон")} — от головы до стопы. Откройте группу и выберите зону.` }),
    REGION_GROUPS.map(g => {
      const regs = REGIONS.filter(x => x.group === g.id);
      const top = Math.max(0, ...regs.map(x => r.regionSev[x.id] || 0));
      const marked = regs.filter(x => r.regionSev[x.id]).length;
      return h("details", { class: "group", open: marked > 0 },
        h("summary", {},
          h("span", { text: g.name }),
          marked ? h("span", { class: `pill sev-${top}`, text: `${marked} из ${regs.length}` }) : h("span", { class: "muted small", text: `${regs.length} ${E.plural(regs.length, "зона", "зоны", "зон")}` })),
        h("div", { class: "list" }, regs.map(reg => regionRow(reg, r))));
    }));
}

function regionRow(reg, r) {
  const sev = r.regionSev[reg.id];
  const b = state.body[reg.id];
  const today = E.dayKey();
  const ci = state.checkins.find(c => c.d === today);
  const bits = [];
  if (b && b.sides.length === 1) bits.push(SIDE_WORD[b.sides[0]]);
  if (b && b.symptoms.length) bits.push(`${symptomName(b.symptoms[0]).toLowerCase()}${b.symptoms.length > 1 ? ` +${b.symptoms.length - 1}` : ""}`);
  if (b && b.note) bits.push(b.note);
  if (b && b.temp && b.temp.until >= today) bits.push(`после сигнала боли бережём до ${fmtDate(b.temp.until)}`);
  if (ci && ci.pain.includes(reg.id)) bits.push("болит сегодня");
  if (E.markSeverity(state, reg.id) && !(b && b.sev)) bits.push("обведено на модели");
  return h("button", { class: "row row-btn", type: "button", onClick: () => regionSheet(reg.id) },
    h("span", { class: "row-text" }, h("b", { text: reg.name }), bits.length ? h("span", { class: "muted small", text: bits.join(" · ") }) : null),
    h("span", { class: `pill ${sev ? `sev-${sev}` : "muted-pill"}`, text: sev ? SEVERITY[sev].name : "в порядке" }),
    icon("chevron", 18));
}

// Простая карта — запасной вариант, если браузер не умеет WebGL
function bodyMap() {
  const r = E.restrictions(state);
  const svg = s("svg", { viewBox: "0 0 200 420", role: "group", "aria-label": "Карта тела, вид сзади" },
    s("circle", { class: "bm-fig", cx: 100, cy: 32, r: 22 }),
    s("rect", { class: "bm-fig", x: 91, y: 50, width: 18, height: 20, rx: 7 }),
    s("path", { class: "bm-fig", d: "M58 74Q100 62 142 74L152 122Q147 172 138 212L134 238Q100 252 66 238L62 212Q53 172 48 122Z" }),
    s("path", { class: "bm-limb", "stroke-width": 18, d: "M54 84C42 104 38 132 37 168S30 212 30 228" }),
    s("path", { class: "bm-limb", "stroke-width": 18, d: "M146 84C158 104 162 132 163 168S170 212 170 228" }),
    s("path", { class: "bm-limb", "stroke-width": 26, d: "M82 236C80 280 80 300 80 318S80 372 81 394" }),
    s("path", { class: "bm-limb", "stroke-width": 26, d: "M118 236C120 280 120 300 120 318S120 372 119 394" }),
    s("ellipse", { class: "bm-fig", cx: 79, cy: 406, rx: 13, ry: 7 }),
    s("ellipse", { class: "bm-fig", cx: 121, cy: 406, rx: 13, ry: 7 }),
    s("path", { class: "bm-spine", d: "M100 72V236" }),
    HOTSPOTS.map(hs => {
      const sev = r.regionSev[hs.region];
      const g = s("g", { class: `hotspot${sev ? ` sev-${sev}` : ""}`, role: "button", tabindex: 0, "aria-label": `${REGION[hs.region].name}: ${SEVERITY[sev].name.toLowerCase()}` },
        s("circle", { class: "halo", cx: hs.x, cy: hs.y, r: 11 }),
        s("circle", { class: "dot", cx: hs.x, cy: hs.y, r: 11 }));
      g.addEventListener("click", () => regionSheet(hs.region));
      g.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          regionSheet(hs.region);
        }
      });
      return g;
    }));
  return h("div", { class: "bodymap" }, svg, h("p", { class: "bm-caption", text: "Вид сзади. Нажмите на точку, чтобы отметить зону" }));
}

// Сколько упражнений уйдёт из тренировок при выбранной тяжести
function effectBox(box, regionIds, sev) {
  const found = new Map();
  for (const id of new Set(regionIds)) for (const ex of E.excludedByRegion(id, sev)) found.set(ex.id, ex);
  const removed = [...found.values()];
  box.className = `note-box${removed.length ? "" : " ok"}`;
  box.replaceChildren(removed.length
    ? h("span", {}, h("b", { text: `Исключим ${removed.length} ${E.plural(removed.length, "упражнение", "упражнения", "упражнений")}: ` }),
      `${removed.slice(0, 5).map(e => e.name).join(", ")}${removed.length > 5 ? " и другие" : ""}.`)
    : h("span", { text: "Все упражнения остаются доступны." }));
}

// ----- Карточка зоны -----
function regionSheet(id, tappedSide = "") {
  const reg = REGION[id];
  if (!reg || player) return;
  const today = E.dayKey();
  const stored = state.body[id];
  const entry = stored || emptyBody();
  const tempActive = !!(entry.temp && entry.temp.until >= today);
  const t = E.painTrend(state, id, 30);
  const draft = {
    sev: entry.sev, note: entry.note, since: entry.since || "", clearTemp: false,
    sides: stored && entry.sides.length ? entry.sides.slice() : reg.sided && tappedSide ? [tappedSide] : [],
    symptoms: entry.symptoms.slice(), onset: entry.onset, triggers: entry.triggers.slice(),
    pain: t ? t.last : 0, painTouched: false
  };
  const desc = h("p", { class: "muted small", style: { marginTop: "10px" } });
  const effect = h("div", { class: "note-box" });
  const updateInfo = () => {
    desc.textContent = SEVERITY[draft.sev].desc;
    effectBox(effect, [id], draft.sev);
  };
  const since = h("input", { class: "input", type: "date", max: today, value: draft.since });
  since.addEventListener("change", () => { draft.since = since.value; });
  const marksHere = state.marks.filter(m => m.regions.some(x => x.id === id));
  const described = !!(entry.symptoms.length || entry.onset || entry.triggers.length || entry.note || t);

  const commit = () => {
    const temp = tempActive && !draft.clearTemp ? entry.temp : null;
    const noteText = clean(draft.note, 300);
    const sinceValue = /^\d{4}-\d{2}-\d{2}$/.test(draft.since) && draft.since <= today ? draft.since : "";
    const keep = draft.sev || noteText || temp || draft.symptoms.length || draft.onset || draft.triggers.length;
    if (!keep) delete state.body[id];
    else {
      state.body[id] = {
        sev: draft.sev, note: noteText, since: sinceValue, temp, sides: reg.sided ? draft.sides.slice() : [],
        symptoms: draft.symptoms.slice(), onset: draft.onset, triggers: draft.triggers.slice()
      };
    }
    if (draft.painTouched) E.logPain(state, id, draft.pain);
    const nb = E.newBadges(state);
    persist();
    return nb;
  };

  const close = sheet({
    title: reg.name,
    body: [
      reg.sided ? h("div", { class: "q" }, h("b", { text: "Сторона" }),
        choice({ multiple: true, label: "Сторона", value: draft.sides, options: SIDES.map(x => ({ value: x.id, label: x.name })), onChange: v => { draft.sides = v; } }),
        h("p", { class: "muted small", style: { marginTop: "6px" }, text: "Не выбрано ничего — значит, обе стороны." })) : null,
      h("div", { class: "q" }, h("b", { text: "Состояние зоны" }),
        choice({ label: "Состояние зоны", value: draft.sev, options: SEVERITY.map(x => ({ value: x.v, label: x.name })), onChange: v => { draft.sev = v; updateInfo(); } })),
      desc, effect,
      tempActive ? h("div", { class: "note-box" },
        h("p", { class: "small", text: `После сигнала боли на тренировке зона под защитой до ${fmtDate(entry.temp.until)}.` }),
        h("button", {
          class: "btn small ghost", type: "button", text: "Уже не болит — снять защиту",
          onClick: e => { draft.clearTemp = true; e.currentTarget.disabled = true; e.currentTarget.textContent = "Снимем после сохранения"; }
        })) : null,
      marksHere.length ? h("p", { class: "small", style: { marginTop: "10px" }, text: `Эта зона есть в ${marksHere.length} ${E.plural(marksHere.length, "обведённой области", "обведённых областях", "обведённых областях")} — их тренер тоже учитывает.` }) : null,
      h("details", { class: "more", open: described },
        h("summary", { text: "Описать проблему подробнее" }),
        problemFields(draft)),
      h("label", { class: "field" }, h("span", { text: "С какого времени (необязательно)" }), since),
      guideLinks([id], commit),
      h("h3", { class: "sub-title", text: "Советы" }),
      h("ul", { class: "bullets small" }, reg.tips.map(x => h("li", { text: x })))
    ],
    actions: [h("button", {
      class: "btn primary", type: "button", text: "Сохранить",
      onClick: () => {
        const nb = commit();
        close();
        refresh();
        toast(nb.length ? badgeToast(nb) : draft.sev ? `Сохранено. Тренировки подстроены под зону «${reg.name.toLowerCase()}»` : "Сохранено");
      }
    })]
  });
  updateInfo();
}

// ----- Обводка на 3D-модели -----
function onLasso(result) {
  if (player) return;
  if (!result || !result.regions.length) {
    if (figure) figure.clearSelection();
    toast("Обведите область прямо на фигуре");
    return;
  }
  markSheet(result, null);
}

const zoneOptions = () => REGIONS.flatMap(reg => (reg.sided ? [{ id: reg.id, side: "R" }, { id: reg.id, side: "L" }] : [{ id: reg.id, side: "" }]));

function markSheet(result, existing) {
  const today = E.dayKey();
  const src = existing || {
    regions: result.regions.slice(0, 8).map(x => ({ id: x.region, side: REGION[x.region].sided ? x.side : "" })),
    c: result.center, n: result.normal, r: result.radius,
    sev: 2, pain: 0, symptoms: [], onset: "", triggers: [], note: ""
  };
  const draft = {
    regions: src.regions.map(x => ({ id: x.id, side: x.side })), sev: Math.max(1, src.sev),
    pain: src.pain, painTouched: false, symptoms: src.symptoms.slice(), onset: src.onset, triggers: src.triggers.slice(), note: src.note
  };
  const err = h("p", { class: "error", role: "alert" });
  const zones = h("div", { class: "chips zone-chips", role: "group", "aria-label": "Зоны в обведённой области" });
  const addSel = h("select", { class: "input", "aria-label": "Добавить зону" });
  const desc = h("p", { class: "muted small", style: { marginTop: "10px" } });
  const effect = h("div", { class: "note-box" });
  const updateEffect = () => {
    desc.textContent = SEVERITY[draft.sev].desc;
    effectBox(effect, draft.regions.map(z => z.id), draft.sev);
  };
  const fillZones = () => {
    zones.replaceChildren(...draft.regions.map((z, i) => h("button", {
      class: "chip", type: "button", "aria-pressed": "true", "aria-label": `Убрать зону: ${zoneName(z.id, z.side)}`,
      onClick: () => {
        if (draft.regions.length === 1) { err.textContent = "Должна остаться хотя бы одна зона"; return; }
        err.textContent = "";
        draft.regions.splice(i, 1);
        fillZones();
        updateEffect();
      }
    }, zoneName(z.id, z.side), h("span", { class: "chip-x", "aria-hidden": "true", text: "×" }))));
    addSel.replaceChildren(h("option", { value: "", text: "+ Добавить зону" }),
      ...zoneOptions().filter(o => !draft.regions.some(z => z.id === o.id && z.side === o.side))
        .map(o => h("option", { value: `${o.id}|${o.side}`, text: zoneName(o.id, o.side) })));
    addSel.value = "";
  };
  addSel.addEventListener("change", () => {
    const [id, side] = addSel.value.split("|");
    if (!own(REGION, id)) return;
    if (draft.regions.length >= 8) { err.textContent = "В одной области — не больше 8 зон"; addSel.value = ""; return; }
    err.textContent = "";
    draft.regions.push({ id, side: REGION[id].sided && SIDE_WORD[side] ? side : "" });
    fillZones();
    updateEffect();
  });
  fillZones();

  const commit = () => {
    if (!existing && state.marks.length >= 40) { err.textContent = "Можно сохранить до 40 областей — удалите старые"; return null; }
    const mark = {
      id: existing ? existing.id : newId(), d: existing ? existing.d || today : today,
      regions: draft.regions.slice(0, 8), c: src.c, n: src.n, r: src.r,
      sev: draft.sev, pain: draft.pain, symptoms: draft.symptoms.slice(), onset: draft.onset,
      triggers: draft.triggers.slice(), note: clean(draft.note, 300)
    };
    state.marks = existing ? state.marks.map(m => (m.id === existing.id ? mark : m)) : state.marks.concat(mark);
    if (draft.painTouched || (!existing && draft.pain > 0)) {
      for (const id of new Set(mark.regions.map(z => z.id))) E.logPain(state, id, draft.pain);
    }
    const nb = E.newBadges(state);
    persist();
    return nb;
  };

  const actions = [];
  if (existing) {
    actions.push(h("button", {
      class: "btn ghost", type: "button", text: "Удалить",
      onClick: () => {
        state.marks = state.marks.filter(m => m.id !== existing.id);
        persist();
        close();
        refresh();
        toast("Область удалена");
      }
    }));
  }
  actions.push(h("button", {
    class: "btn primary", type: "button", text: "Сохранить",
    onClick: () => {
      const nb = commit();
      if (!nb) return;
      close();
      refresh();
      toast(nb.length ? badgeToast(nb) : "Сохранено — тренер учтёт эту область");
    }
  }));

  const close = sheet({
    title: existing ? "Обведённая область" : "Что беспокоит здесь?",
    onClose: () => { if (figure) figure.clearSelection(); },
    body: [
      h("p", { class: "muted small", text: existing ? `Отмечено ${existing.d ? fmtDate(existing.d) : "раньше"}. Можно поменять описание или удалить область.` : "Мы нашли эти зоны внутри обводки. Лишнее уберите касанием, недостающее добавьте из списка." }),
      zones, addSel,
      h("div", { class: "q", style: { marginTop: "16px" } }, h("b", { text: "Насколько мешает" }),
        choice({ label: "Насколько мешает", value: draft.sev, options: SEVERITY.filter(x => x.v).map(x => ({ value: x.v, label: x.name })), onChange: v => { draft.sev = v; updateEffect(); } })),
      desc, effect,
      problemFields(draft),
      guideLinks([...new Set(draft.regions.map(z => z.id))], () => { if (commit()) toast("Область сохранена"); }),
      h("p", { class: "muted small", style: { marginTop: "12px" }, text: "Описание остаётся на этом устройстве и нужно только для подбора упражнений. Это не диагноз." }),
      err
    ],
    actions
  });
  updateEffect();
}

// ===== Дневник =====
const ACTIVITIES = ["Прогулка", "Бег", "Велосипед", "Плавание", "Танцы", "Йога", "Спортзал", "Другое"];
function addActivitySheet() {
  const draft = { title: "Прогулка" };
  const today = E.dayKey();
  const mins = h("input", { class: "input", type: "number", inputmode: "numeric", min: 5, max: 300, step: 5, value: 30 });
  const date = h("input", { class: "input", type: "date", max: today, min: E.shiftDay(today, -30), value: today });
  const err = h("p", { class: "error", role: "alert" });
  const close = sheet({
    title: "Добавить активность",
    body: [
      h("button", { class: "quick-item glass gps-start", type: "button", onClick: () => { close(); startTracker(draft.title === "Бег" ? "run" : "walk"); } },
        h("span", { class: "fi" }, icon("today", 20)),
        h("span", { class: "row-text" }, h("b", { text: "Записать с GPS" }), h("span", { class: "muted small", text: "Дистанция, время и темп прогулки или пробежки" })),
        icon("chevron", 18)),
      h("p", { class: "muted small", text: "Или добавьте вручную:" }),
      h("div", { class: "q" }, h("b", { text: "Что делали?" }),
        choice({ label: "Вид активности", value: draft.title, options: ACTIVITIES.map(a => ({ value: a, label: a })), onChange: v => { draft.title = v; } })),
      h("label", { class: "field" }, h("span", { text: "Сколько минут" }), mins),
      h("label", { class: "field" }, h("span", { text: "Когда" }), date),
      err
    ],
    actions: [h("button", {
      class: "btn primary", type: "button", text: "Добавить",
      onClick: () => {
        const m = Number(mins.value);
        const d = date.value;
        if (!Number.isInteger(m) || m < 5 || m > 300) { err.textContent = "Укажите от 5 до 300 минут"; return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today || d < E.shiftDay(today, -30)) { err.textContent = "Выберите дату за последние 30 дней"; return; }
        state.sessions.push({ id: newId(), d, hour: 12, mins: m, title: draft.title, goal: "activity", mode: "normal", rpe: 0, count: 0, pains: [] });
        state.sessions.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
        if (state.sessions.length > 1000) state.sessions.splice(0, state.sessions.length - 1000);
        const nb = E.newBadges(state);
        persist();
        close();
        refresh();
        toast(nb.length ? badgeToast(nb) : "Добавлено в дневник");
      }
    })]
  });
}

function sparkline(list) {
  const start = E.shiftDay(E.dayKey(), -13);
  const t0 = new Date(`${start}T12:00:00`).getTime();
  const pts = list.map(c => {
    const idx = Math.round((new Date(`${c.d}T12:00:00`).getTime() - t0) / 864e5);
    return [10 + idx * (280 / 13), 72 - c.score * 0.64];
  });
  return s("svg", { class: "spark", viewBox: "0 0 300 80", preserveAspectRatio: "none", role: "img", "aria-label": `Готовность по дням: ${list.map(c => c.score).join(", ")}` },
    s("polyline", { points: pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") }),
    pts.map(([x, y]) => s("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: 3.5 })));
}

// Итоги недели для «Поделиться»: только активность, без сведений о здоровье
function weekStats() {
  const from = E.shiftDay(E.dayKey(), -6);
  const sess = state.sessions.filter(x => x.d >= from);
  const cis = state.checkins.filter(c => c.d >= from);
  return {
    workouts: sess.filter(x => x.goal !== "activity").length,
    mins: sess.reduce((a, x) => a + x.mins, 0),
    avg: cis.length ? Math.round(cis.reduce((a, c) => a + c.score, 0) / cis.length) : null,
    badges: Object.values(state.badges).filter(d => d >= from).length
  };
}
function weekShareText() {
  const w = weekStats();
  const st = E.streak(state);
  if (!w.mins) return "Начинаю тренироваться с Листопульсом — бесплатным тренером, который подстраивает упражнения под травмы и самочувствие 🌿";
  return `Моя неделя в Листопульсе: ${w.workouts} ${E.plural(w.workouts, "тренировка", "тренировки", "тренировок")} и ${w.mins} ${E.plural(w.mins, "минута", "минуты", "минут")} активности` +
    `${st ? `, серия ${st} ${E.plural(st, "день", "дня", "дней")} подряд` : ""}${w.badges ? `, новых наград: ${w.badges}` : ""} 🌿`;
}
async function shareText(textValue) {
  try {
    if (navigator.share) {
      await navigator.share({ text: textValue });
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(textValue);
    toast("Текст скопирован — вставьте его в сообщение");
  } catch (e) {
    toast("Не удалось поделиться в этом браузере");
  }
}

// ----- Календарь месяца -----
let calMonth = "";
function calendarCard() {
  const today = E.dayKey();
  if (!calMonth || calMonth > today.slice(0, 7)) calMonth = today.slice(0, 7);
  const [y, m] = calMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1, 12);
  const daysIn = new Date(y, m, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const byDay = {};
  for (const x of state.sessions) if (x.d.startsWith(calMonth)) (byDay[x.d] = byDay[x.d] || []).push(x);
  const painDays = new Set([
    ...state.painLog.filter(p => p.level >= 4 && p.d.startsWith(calMonth)).map(p => p.d),
    ...state.sessions.filter(x => x.pains.length && x.d.startsWith(calMonth)).map(x => x.d)]);
  const ciDays = new Set(state.checkins.filter(c => c.d.startsWith(calMonth)).map(c => c.d));
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(h("span", { class: "cal-cell empty", "aria-hidden": "true" }));
  let workouts = 0, active = 0;
  for (let dd = 1; dd <= daysIn; dd++) {
    const key = `${calMonth}-${String(dd).padStart(2, "0")}`;
    const list = byDay[key] || [];
    const workout = list.some(x => x.goal !== "activity");
    if (workout) workouts += 1;
    if (list.length) active += 1;
    const cls = ["cal-cell", workout ? "w" : list.length ? "a" : "", key === today ? "today" : "", key > today ? "future" : "", painDays.has(key) ? "p" : ""].filter(Boolean).join(" ");
    const label = `${fmtDate(key)}: ${workout ? "тренировка" : list.length ? "активность" : "без занятий"}${painDays.has(key) ? ", была боль" : ""}`;
    cells.push(list.length || ciDays.has(key) || painDays.has(key)
      ? h("button", { class: cls, type: "button", "aria-label": label, onClick: () => daySheet(key) }, String(dd))
      : h("span", { class: cls }, String(dd)));
  }
  const title = first.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(/\s*г\.$/, "");
  const shift = n => {
    const d = new Date(y, m - 1 + n, 1, 12);
    calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    refresh();
  };
  return h("section", { class: "card glass" },
    h("div", { class: "card-head" },
      h("h2", { text: title[0].toUpperCase() + title.slice(1) }),
      h("div", { class: "row-tools" },
        h("button", { class: "icon-btn mini", type: "button", "aria-label": "Предыдущий месяц", onClick: () => shift(-1) }, icon("back", 18)),
        h("button", { class: "icon-btn mini", type: "button", "aria-label": "Следующий месяц", disabled: calMonth >= today.slice(0, 7), onClick: () => shift(1) }, icon("chevron", 18)))),
    h("div", { class: "cal-grid" }, WEEKDAYS.map(w => h("span", { class: "cal-wd", "aria-hidden": "true", text: w })), cells),
    h("div", { class: "cal-legend" },
      h("span", {}, h("i", { class: "w" }), "тренировка"),
      h("span", {}, h("i", { class: "a" }), "активность"),
      h("span", {}, h("i", { class: "p" }), "боль")),
    h("p", { class: "muted small", text: `За месяц: ${workouts} ${E.plural(workouts, "день", "дня", "дней")} с тренировками, всего активных дней — ${active}.` }));
}
const sessionLine = x => [fmtDate(x.d), `${x.mins} мин`, x.km ? `${fmtNum(x.km)} км` : "", x.rpe ? `тяжесть ${x.rpe}/10` : ""].filter(Boolean).join(" · ");
const paceText = (mins, km) => {
  if (!km || km < 0.05) return "";
  const sec = Math.round((mins * 60) / km);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} мин/км`;
};
// Запись дневника: подробности, правка минут и тяжести, удаление с кнопкой «Вернуть»
function historySheet(id) {
  const idx = state.sessions.findIndex(x => x.id === id);
  if (idx < 0) return;
  const s = state.sessions[idx];
  let rpe = s.rpe;
  const mins = h("input", { class: "input", type: "number", inputmode: "numeric", min: 1, max: 300, step: 1, value: s.mins });
  const err = h("p", { class: "error", role: "alert" });
  const exList = (s.ex || []).filter(([eid]) => own(EX, eid)).map(([eid, n]) => `${EX[eid].name}${n > 1 ? ` — ${n} ${E.plural(n, "подход", "подхода", "подходов")}` : ""}`);
  const close = sheet({
    title: s.title || "Тренировка",
    body: [
      h("p", { class: "muted", text: `${fmtDate(s.d, { weekday: "long", day: "numeric", month: "long" })}, около ${s.hour}:00` }),
      s.km ? h("p", { class: "small", text: `Дистанция ${fmtNum(s.km)} км${paceText(s.mins, s.km) ? ` · темп ${paceText(s.mins, s.km)}` : ""}` }) : null,
      exList.length ? [h("h3", { class: "sub-title", text: "Упражнения" }), h("ul", { class: "bullets small" }, exList.map(t => h("li", { text: t })))] : null,
      s.pains.length ? h("p", { class: "small", text: `Сигналы боли: ${s.pains.map(p => `${REGION[p.region].name.toLowerCase()} (${own(EX, p.ex) ? EX[p.ex].name.toLowerCase() : "упражнение"})`).join(", ")}` }) : null,
      h("label", { class: "field" }, h("span", { text: "Минут" }), mins),
      s.goal !== "activity" ? h("div", { class: "q" }, h("b", { text: "Тяжесть от 1 до 10" }),
        choice({ className: "rpe", label: "Тяжесть тренировки", value: rpe, options: Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) })), onChange: v => { rpe = v; } })) : null,
      err,
      h("p", { class: "muted small", text: "Удаление записи не меняет отметки программ, челленджей и журнал весов." })
    ],
    actions: [
      h("button", {
        class: "btn ghost danger-text", type: "button", text: "Удалить",
        onClick: () => {
          close();
          const i = state.sessions.findIndex(x => x.id === id);
          if (i < 0) return;
          const [removed] = state.sessions.splice(i, 1);
          planCache.key = "";
          persist();
          refresh();
          toast("Запись удалена", {
            action: {
              label: "Вернуть",
              onClick: () => {
                state.sessions.splice(Math.min(i, state.sessions.length), 0, removed);
                planCache.key = "";
                persist();
                refresh();
                toast("Запись восстановлена");
              }
            }
          });
        }
      }),
      h("button", {
        class: "btn primary", type: "button", text: "Сохранить",
        onClick: () => {
          const m = Number(mins.value);
          if (!Number.isInteger(m) || m < 1 || m > 300) { err.textContent = "Укажите от 1 до 300 минут"; return; }
          s.mins = m;
          if (s.goal !== "activity") s.rpe = rpe;
          planCache.key = "";
          persist();
          close();
          refresh();
          toast("Изменения сохранены");
        }
      })
    ]
  });
}

function daySheet(key) {
  const list = state.sessions.filter(x => x.d === key);
  const ci = state.checkins.find(c => c.d === key);
  const pains = state.painLog.filter(p => p.d === key);
  const close = sheet({
    title: fmtDate(key, { weekday: "long", day: "numeric", month: "long" }),
    body: [
      ci ? h("p", { class: "small", text: `Готовность по самочувствию: ${ci.score} из 100` }) : null,
      list.length ? h("div", { class: "list" }, list.map(x => h("button", { class: "row row-btn", type: "button", onClick: () => { close(); historySheet(x.id); } },
        h("span", { class: "row-text" },
          h("b", { text: x.title || "Тренировка" }),
          h("span", { class: "muted small", text: [`${x.mins} мин`, x.km ? `${fmtNum(x.km)} км` : "", x.rpe ? `тяжесть ${x.rpe}/10` : "", x.count ? `${x.count} ${E.plural(x.count, "подход", "подхода", "подходов")}` : ""].filter(Boolean).join(" · ") })),
        x.pains.length ? h("span", { class: "pill sev-2", text: "боль" }) : null,
        icon("chevron", 16))))
        : h("p", { class: "muted", text: "В этот день занятий не было." }),
      pains.length ? h("p", { class: "small", text: `Дневник боли: ${pains.map(p => `${REGION[p.region].name.toLowerCase()} — ${p.level} из 10`).join(", ")}` }) : null
    ]
  });
}

// ----- Вес тела -----
const fmtNum = v => String(v).replace(".", ",");
function bwChart(list) {
  const vals = list.map(x => x[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pts = vals.map((v, i) => [10 + (i * 280) / Math.max(1, vals.length - 1), 68 - ((v - lo) / span) * 56]);
  return s("svg", { class: "spark", viewBox: "0 0 300 80", preserveAspectRatio: "none", role: "img", "aria-label": `Вес тела: ${list.map(x => `${fmtDate(x[0])} — ${fmtNum(x[1])} кг`).join(", ")}` },
    s("polyline", { points: pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") }),
    pts.map(([px, py]) => s("circle", { cx: px.toFixed(1), cy: py.toFixed(1), r: 3.5 })));
}
function bodyWeightCard() {
  const list = state.bodyWeight;
  const last = list[list.length - 1];
  const first = list.length > 1 ? list[0] : null;
  const delta = first ? Math.round((last[1] - first[1]) * 10) / 10 : 0;
  return h("section", { class: "card glass" },
    h("div", { class: "card-head" },
      h("h2", { text: "Вес тела" }),
      h("button", { class: "btn small ghost", type: "button", onClick: bodyWeightSheet }, icon("plus", 16), "Записать")),
    last ? h("p", { class: "small" }, h("b", { text: `${fmtNum(last[1])} кг` }), ` · ${fmtDate(last[0])}`,
      first && delta ? ` · ${delta > 0 ? "+" : "−"}${fmtNum(Math.abs(delta))} кг с ${fmtDate(first[0])}` : "") : null,
    waistNote(),
    list.length > 1 ? bwChart(list.slice(-30)) : null,
    h("p", { class: "muted small", text: "Взвешивайтесь утром, до завтрака, раз в неделю — так видна настоящая динамика, а не колебания воды." }));
}
// Обхват талии: последнее измерение и ориентир риска (для взрослых, если указан пол)
const lastWaist = () => { for (let i = state.bodyWeight.length - 1; i >= 0; i--) if (state.bodyWeight[i][2]) return state.bodyWeight[i]; return null; };
const WAIST_WORD = ["в пределах ориентира", "выше ориентира — риск для сердца и обмена веществ повышен", "заметно выше ориентира — риск высокий, стоит обсудить с врачом"];
function waistText(cm) {
  const p = state.profile;
  if (p.ageGroup === "teen") return "до 18 лет обхват талии оценивают по возрастным таблицам";
  const risk = E.waistRisk(p.sex, cm);
  if (risk === null) return "укажите пол в профиле, чтобы сравнить с ориентиром ВОЗ";
  return `${WAIST_WORD[risk]} (ВОЗ: ${p.sex === "m" ? "94 и 102" : "80 и 88"} см)`;
}
function waistNote() {
  const w = lastWaist();
  if (!w) return null;
  return h("p", { class: "small", text: `Талия: ${fmtNum(w[2])} см · ${waistText(w[2])}` });
}
function bodyWeightSheet() {
  const today = E.dayKey();
  const last = state.bodyWeight[state.bodyWeight.length - 1];
  const kg = h("input", { class: "input", type: "number", inputmode: "decimal", min: 20, max: 400, step: 0.1, value: last ? last[1] : "" });
  const lw = lastWaist();
  const waist = h("input", { class: "input", type: "number", inputmode: "decimal", min: 40, max: 200, step: 0.5, placeholder: "необязательно", value: lw ? lw[2] : "" });
  const date = h("input", { class: "input", type: "date", max: today, min: E.shiftDay(today, -60), value: today });
  const err = h("p", { class: "error", role: "alert" });
  const close = sheet({
    title: "Записать вес",
    body: [
      h("label", { class: "field" }, h("span", { text: "Вес, кг" }), kg),
      h("label", { class: "field" }, h("span", { text: "Обхват талии, см" }), waist),
      h("p", { class: "muted small", text: "Талию измеряйте на выдохе, посередине между нижним ребром и тазовой костью." }),
      h("label", { class: "field" }, h("span", { text: "Дата" }), date),
      err
    ],
    actions: [h("button", {
      class: "btn primary", type: "button", text: "Сохранить",
      onClick: () => {
        const v = Number(String(kg.value).replace(",", "."));
        const d = date.value;
        if (!Number.isFinite(v) || v < 20 || v > 400) { err.textContent = "Укажите вес от 20 до 400 кг"; return; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today || d < E.shiftDay(today, -60)) { err.textContent = "Выберите дату за последние 60 дней"; return; }
        const wv = waist.value === "" ? 0 : Number(String(waist.value).replace(",", "."));
        if (waist.value !== "" && (!Number.isFinite(wv) || wv < 40 || wv > 200)) { err.textContent = "Обхват талии — от 40 до 200 см"; return; }
        const entry = wv ? [d, Math.round(v * 10) / 10, Math.round(wv * 2) / 2] : [d, Math.round(v * 10) / 10];
        state.bodyWeight = state.bodyWeight.filter(x => x[0] !== d).concat([entry]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-500);
        persist();
        close();
        refresh();
        toast("Вес записан");
      }
    })]
  });
}

// ----- Картинка «Поделиться»: только активность, без сведений о здоровье -----
const CARD_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
function drawShareCard({ title, sub, stats }) {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return Promise.resolve(null);
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b3d26");
  bg.addColorStop(1, "#15803d");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.06)";
  for (const [x, y, r] of [[900, 180, 260], [140, 1180, 320], [980, 1100, 140]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  // Листик-логотип
  g.save();
  g.translate(118, 132);
  g.rotate(-0.6);
  g.fillStyle = "#86efac";
  g.beginPath();
  g.moveTo(0, -34);
  g.bezierCurveTo(30, -18, 30, 18, 0, 34);
  g.bezierCurveTo(-30, 18, -30, -18, 0, -34);
  g.fill();
  g.restore();
  g.fillStyle = "#ffffff";
  g.textBaseline = "alphabetic";
  g.font = `800 56px ${CARD_FONT}`;
  g.fillText("Листопульс", 170, 152);
  g.globalAlpha = 0.78;
  g.font = `500 40px ${CARD_FONT}`;
  g.fillText(sub, 80, 300);
  g.globalAlpha = 1;
  // Заголовок с переносом по словам
  g.font = `800 92px ${CARD_FONT}`;
  const words = String(title).split(/\s+/);
  const lines = [];
  let line = "";
  for (const wd of words) {
    const t = line ? `${line} ${wd}` : wd;
    if (g.measureText(t).width > W - 160 && line) { lines.push(line); line = wd; } else line = t;
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((ln, i) => g.fillText(ln, 80, 420 + i * 104));
  // Показатели: две колонки
  const top = 420 + Math.min(3, lines.length) * 104 + 60;
  stats.slice(0, 4).forEach(([value, label], i) => {
    const x = 80 + (i % 2) * 470, y = top + Math.floor(i / 2) * 250;
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, 440, 210, 40); else g.rect(x, y, 440, 210);
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = `800 96px ${CARD_FONT}`;
    g.fillText(String(value), x + 40, y + 118);
    g.globalAlpha = 0.8;
    g.font = `500 36px ${CARD_FONT}`;
    g.fillText(label, x + 40, y + 172);
    g.globalAlpha = 1;
  });
  g.globalAlpha = 0.7;
  g.font = `500 34px ${CARD_FONT}`;
  g.fillText("Бесплатный тренер, который слушает тело", 80, H - 120);
  g.globalAlpha = 0.9;
  g.font = `700 34px ${CARD_FONT}`;
  g.fillText(appUrl().replace(/^https?:\/\//, "").replace(/\/$/, ""), 80, H - 70);
  g.globalAlpha = 1;
  return new Promise(res => { try { c.toBlob(b => res(b), "image/png"); } catch (e) { res(null); } });
}
async function shareCard(card, textValue) {
  let blob = null;
  try { blob = await drawShareCard(card); } catch (e) { blob = null; }
  if (!blob) { shareText(textValue); return; }
  try {
    const file = new File([blob], "listopuls.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: textValue });
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  download("listopuls.png", blob, "image/png");
  toast("Картинка сохранена — отправьте её друзьям");
}
function shareWeek() {
  const w = weekStats();
  const st = E.streak(state);
  const from = E.shiftDay(E.dayKey(), -6);
  const active = new Set(state.sessions.filter(x => x.d >= from).map(x => x.d)).size;
  shareCard({
    title: w.mins ? "Моя неделя в движении" : "Начинаю тренироваться",
    sub: `${fmtDate(from)} — ${fmtDate(E.dayKey())}`,
    stats: [[w.workouts, E.plural(w.workouts, "тренировка", "тренировки", "тренировок")], [w.mins, E.plural(w.mins, "минута активности", "минуты активности", "минут активности")],
      [`${active}/7`, "активных дней"], w.badges ? [w.badges, E.plural(w.badges, "новая награда", "новые награды", "новых наград")] : [st, E.plural(st, "день подряд", "дня подряд", "дней подряд")]]
  }, weekShareText());
}

// ===== Прогресс =====
// Обзор, сила, тело и награды — каждый раздел отвечает на свой вопрос
const PROGRESS_TABS = [["", "Обзор"], ["strength", "Сила"], ["body", "Тело"], ["awards", "Награды"]];
function progressTabs(active) {
  return h("nav", { class: "seg sub-tabs", "aria-label": "Разделы прогресса" },
    PROGRESS_TABS.map(([id, label]) => h("a", { class: "chip", href: id ? `#journal/${id}` : "#journal", "aria-current": id === active ? "page" : null }, label)));
}
function viewJournal(sub) {
  const tab = PROGRESS_TABS.some(([id]) => id === sub) ? sub : "";
  const head = [
    h("div", { class: "card-head" },
      h("h1", { class: "page-title", text: "Прогресс" }),
      h("button", { class: "btn small ghost", type: "button", onClick: addActivitySheet }, icon("plus", 16), "Активность")),
    progressTabs(tab)
  ];
  if (tab === "strength") return [...head, ...weightsBlocks(), recordsCard()];
  if (tab === "body") return [...head, bodyWeightCard(), calcCard()];
  if (tab === "awards") return [...head, badgesCard()];
  return [...head, ...progressOverview()];
}
function progressOverview() {
  const days = E.minutesByDay(state, 7);
  const w = weekStats();
  const who = E.whoWeek(state);
  const max = Math.max(30, ...days.map(x => x.mins));
  const total = state.sessions.reduce((a, x) => a + x.mins, 0);
  const recent = state.checkins.filter(c => c.d >= E.shiftDay(E.dayKey(), -13));
  const hist = state.sessions.slice(-40).reverse();
  return [
    h("section", { class: "card glass" }, h("div", { class: "stats" },
      stat(state.sessions.length, E.plural(state.sessions.length, "занятие", "занятия", "занятий")),
      stat(total, E.plural(total, "минута всего", "минуты всего", "минут всего")),
      stat(E.weekStreak(state), E.plural(E.weekStreak(state), "неделя по плану", "недели по плану", "недель по плану")))),
    h("section", { class: "card glass" },
      h("div", { class: "card-head" },
        h("h2", { text: "Последние 7 дней" }),
        h("button", { class: "btn small ghost", type: "button", onClick: shareWeek }, icon("share", 16), "Поделиться")),
      h("p", { class: "muted small", text: `${who.done} из ${who.mins} мин по норме ВОЗ · силовых дней: ${who.strengthDays} из ${who.strength}${who.balance ? ` · равновесие: ${who.balanceDays} из ${who.balance}` : ""}${w.avg !== null ? ` · средняя готовность ${w.avg}` : ""}` }),
      h("div", { class: "bars", role: "img", "aria-label": days.map(x => `${fmtDate(x.d, { weekday: "short" })}: ${x.mins} мин`).join(", ") },
        days.map(x => h("div", { class: `bar${x.mins ? "" : " zero"}` },
          x.mins ? h("small", { text: String(x.mins) }) : null,
          h("i", { style: { height: `${Math.max(4, Math.round((x.mins / max) * 96))}px` } }),
          h("span", { text: fmtDate(x.d, { weekday: "short" }) })))),
      h("p", { class: "muted small", text: who.teen
        ? "Подросткам ВОЗ советует в среднем 60 минут движения в день, а силовые и интенсивные занятия — 3 дня в неделю."
        : "ВОЗ советует 150–300 минут умеренной активности в неделю (интенсивная минута идёт за две) и силовые не реже 2 дней." })),
    calendarCard(),
    recent.length >= 2 ? h("section", { class: "card glass" },
      h("h2", { text: "Готовность за 2 недели" }),
      h("p", { class: "muted small", text: "По отметкам самочувствия: чем выше, тем лучше сон, энергия и восстановление." }),
      sparkline(recent)) : null,
    h("section", { class: "card glass" },
      h("h2", { text: "История" }),
      hist.length ? h("div", { class: "list" }, hist.map(x => h("button", { class: "row row-btn", type: "button", onClick: () => historySheet(x.id) },
        h("span", { class: "row-text" },
          h("b", { text: x.title || "Тренировка" }),
          h("span", { class: "muted small", text: sessionLine(x) })),
        x.pains.length ? h("span", { class: "pill sev-2", text: "боль" }) : null,
        icon("chevron", 16))))
        : h("p", { class: "muted", text: "Пока пусто. Первая тренировка — на вкладке «Сегодня»." }),
      hist.length ? h("p", { class: "muted small", text: "Нажмите на запись, чтобы исправить или удалить её." }) : null)
  ];
}
function badgesCard() {
  const got = BADGES.filter(b => state.badges[b.id]).length;
  return h("section", { class: "card glass" },
    h("div", { class: "card-head" }, h("h2", { text: "Награды" }), h("span", { class: "pill", text: `${got} из ${BADGES.length}` })),
    h("div", { class: "badges" }, BADGES.map(b => h("div", { class: `badge${state.badges[b.id] ? "" : " locked"}` },
      h("span", { class: "b-icon", "aria-hidden": "true", text: b.icon }),
      h("b", { text: b.name }),
      h("span", { text: state.badges[b.id] ? fmtDate(state.badges[b.id]) : b.desc })))));
}
function recordsCard() {
  const recs = Object.entries(state.records || {}).filter(([id]) => own(EX, id));
  return h("section", { class: "card glass" },
    h("div", { class: "card-head" }, h("h2", { text: "Рекорды статики" }), h("a", { class: "btn small ghost", href: "#more/records" }, icon("timer", 16), "Замерить")),
    recs.length
      ? h("div", { class: "list" }, recs.map(([id, rec]) => h("div", { class: "row" },
        h("span", { class: "row-text" }, h("b", { text: EX[id].name }), h("span", { class: "muted small", text: `${fmtDate(rec.d)} · попыток: ${rec.tries}` })),
        h("b", { class: "rec-time", text: mmss(rec.best) }))))
      : h("p", { class: "muted small", text: "Сколько продержитесь в планке или «стульчике»? Засеките время — рекорды появятся здесь." }));
}
function calcCard() {
  const p = state.profile;
  const lw = state.bodyWeight[state.bodyWeight.length - 1];
  const bmi = p.height && lw ? lw[1] / (p.height / 100) ** 2 : 0;
  return h("section", { class: "card glass" },
    h("div", { class: "card-head" },
      h("div", {}, h("h2", { text: "Калькуляторы" }), h("p", { class: "muted small", text: bmi ? `ИМТ ${bmi.toFixed(1).replace(".", ",")} · калории, белок, пульсовые зоны, 1ПМ` : "ИМТ, талия, калории, белок и вода, пульсовые зоны, 1ПМ" })),
      h("a", { class: "btn small ghost", href: "#more/calc" }, icon("calc", 16), "Открыть")));
}

// ===== Профиль =====
// Сгруппированные списки, как в настройках iOS: тренировки, здоровье, приложение
const SUB = { look: subLook, library: subLibrary, records: subRecords, weights: subWeights, calc: subCalc, gps: subGps, timer: subTimer, breath: subBreath, calendar: subCalendar, profile: subProfile, settings: subSettings, data: subData, install: subInstall, about: subAbout };
// Куда ведёт «Назад» и какая вкладка подсвечена у страниц, которые живут по старым адресам
const MORE_BACK = {
  library: ["#workout/catalog", "Каталог", "workout"], records: ["#workout/tools", "Таймеры и рекорды", "workout"],
  timer: ["#workout/tools", "Таймеры и рекорды", "workout"], breath: ["#workout/tools", "Таймеры и рекорды", "workout"],
  gps: ["#workout/cardio", "Бег и прогулки", "workout"], weights: ["#journal/strength", "Прогресс", "journal"], calc: ["#journal/body", "Прогресс", "journal"]
};
const tabOf = (name, sub) => (name === "more" && own(MORE_BACK, sub) ? MORE_BACK[sub][2] : TAB_OF[name] || name);
function viewMore(sub) {
  if (sub && own(SUB, sub)) {
    const [href, label] = MORE_BACK[sub] || ["#more", "Профиль"];
    return [h("a", { class: "back-link", href }, icon("back", 18), label), ...SUB[sub]()];
  }
  const p = state.profile;
  const goal = GOALS.find(g => g.id === p.goal);
  const level = LEVELS[p.level - 1];
  const row = (href, ic, title, desc) => h("a", { class: "row lg-row", href },
    h("span", { class: "fi" }, icon(ic, 18)), h("span", { class: "row-text" }, h("b", { text: title }), desc ? h("span", { class: "muted small", text: desc }) : null), icon("chevron", 16));
  const group = (title, rows) => [h("h2", { class: "group-title", text: title }), h("section", { class: "card glass list-group" }, h("div", { class: "list" }, rows))];
  return [
    h("h1", { class: "page-title", text: "Профиль" }),
    // Вся карточка — ссылка на профиль, как строка учётной записи в «Настройках» iPhone
    h("a", { class: "card glass profile-card", href: "#more/profile" },
      avatarEl(),
      h("span", { class: "row-text" },
        h("b", { text: p.name || "Ваш профиль" }),
        h("span", { class: "muted small", text: `${goal ? goal.short : ""} · ${level ? level.name.toLowerCase() : ""} · ${p.days.length} ${E.plural(p.days.length, "день", "дня", "дней")} в неделю` }),
        h("span", { class: "small accent-text", text: "Цели, уровень, инвентарь" })),
      icon("chevron", 18)),
    ...group("Тренировки", [
      row("#more/calendar", "calendar", "План и напоминания", p.planTime ? planText(p) : "Когда и где тренироваться, напоминания в календаре")
    ]),
    ...group("Здоровье", [
      row("#body/health", "heart", "Боль и особенности здоровья", "Дневник боли, бережный режим, возраст"),
      row("#report", "print", "Отчёт для врача", "Боль и нагрузка на одной странице"),
      row("#more/calc", "calc", "Калькуляторы", "ИМТ, талия, калории, пульс, 1ПМ")
    ]),
    ...group("Приложение", [
      row("#more/look", "palette", "Персонализация", "Цвет, фон, шрифт, главный экран, аватар"),
      row("#more/settings", "sliders", "Настройки", "Звук, голос, вибрация"),
      row("#more/data", "shield", "Данные и защита", "Пароль, резервная копия, таблицы"),
      row("#more/install", "phone", "Установить на телефон", "Иконка на экране, работа без интернета"),
      h("button", { class: "row row-btn lg-row", type: "button", onClick: inviteFriend },
        h("span", { class: "fi" }, icon("share", 18)), h("span", { class: "row-text" }, h("b", { text: "Пригласить друга" }), h("span", { class: "muted small", text: "Бесплатно и без регистрации" })), icon("chevron", 16)),
      row("#more/about", "doc", "О приложении", "Документы и безопасность")
    ]),
    h("p", { class: "muted small center", style: { marginTop: "18px" } }, `Листопульс ${VERSION} · 12+ · `, h("a", { href: "../index.html", text: "сайт о здоровье" }))
  ];
}
async function inviteFriend() {
  const url = appUrl();
  const textValue = "Листопульс — бесплатный тренер, который подстраивает тренировки под травмы и самочувствие. Работает без регистрации, данные остаются на телефоне.";
  try {
    if (navigator.share) { await navigator.share({ title: "Листопульс", text: textValue, url }); return; }
  } catch (e) {
    if (e && e.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(`${textValue} ${url}`);
    toast("Ссылка скопирована — вставьте её в сообщение");
  } catch (e) {
    toast(url);
  }
}
function subGps() {
  const from = E.shiftDay(E.dayKey(), -29);
  const list = state.sessions.filter(x => x.km && x.d >= from);
  const km = Math.round(list.reduce((a, x) => a + x.km, 0) * 10) / 10;
  return [
    h("h1", { class: "page-title", text: "Прогулка с GPS" }),
    h("p", { class: "lead", text: "Запишите прогулку или пробежку: дистанция, время и темп. Минуты сразу попадут в недельную норму ВОЗ." }),
    h("section", { class: "card glass" },
      h("div", { class: "btn-row" },
        h("button", { class: "btn primary", type: "button", onClick: () => startTracker("walk") }, icon("play", 18), "Прогулка"),
        h("button", { class: "btn ghost", type: "button", onClick: () => startTracker("run") }, icon("play", 18), "Пробежка")),
      h("ul", { class: "bullets small" },
        h("li", { text: "Браузер спросит разрешение на геолокацию — оно нужно только во время записи." }),
        h("li", { text: "Держите экран включённым: в фоне браузер не записывает маршрут." }),
        h("li", { text: "Координаты не сохраняются и никуда не отправляются: в дневник попадают только дистанция и время." }))),
    h("section", { class: "card glass" },
      h("h2", { text: "За 30 дней" }),
      list.length
        ? [h("div", { class: "stats" }, stat(fmtNum(km), "км"), stat(list.length, E.plural(list.length, "запись", "записи", "записей")), stat(list.reduce((a, x) => a + x.mins, 0), E.plural(list.reduce((a, x) => a + x.mins, 0), "минута", "минуты", "минут"))),
          h("div", { class: "list" }, list.slice(-8).reverse().map(x => h("button", { class: "row row-btn", type: "button", onClick: () => historySheet(x.id) },
            h("span", { class: "row-text" }, h("b", { text: x.title }), h("span", { class: "muted small", text: `${sessionLine(x)}${paceText(x.mins, x.km) ? ` · ${paceText(x.mins, x.km)}` : ""}` })),
            icon("chevron", 16))))]
        : h("p", { class: "muted", text: "Пока нет записей с GPS." }))
  ];
}

const libFilter = { q: "", group: "all", mine: false, equip: "all" };
const EQUIP_FILTER = [["all", "Любой"], ["none", "Без инвентаря"], ["dumbbell", "Гантели"], ["kettlebell", "Гиря"], ["barbell", "Штанга"], ["band", "Эспандер"], ["bar", "Турник"]];
function subLibrary() {
  const r = E.restrictions(state);
  const list = h("div", { class: "list" });
  const fill = () => {
    const q = libFilter.q.trim().toLowerCase();
    const items = EXERCISES.filter(ex =>
      (libFilter.group === "all" || ex.group === libFilter.group) &&
      (libFilter.equip === "all" || (libFilter.equip === "none" ? !ex.equip.some(e => e !== "chair") : ex.equip.includes(libFilter.equip))) &&
      (!q || ex.name.toLowerCase().includes(q)) &&
      (!libFilter.mine || E.fits(ex, r, state.profile)));
    list.replaceChildren(...(items.length ? items.map(ex => {
      const ok = E.fits(ex, r, state.profile);
      return h("button", { class: "row row-btn", type: "button", onClick: () => exerciseSheet(ex.id) },
        h("span", { class: "row-text" }, h("b", { text: ex.name }), h("span", { class: "muted small", text: `${GROUPS[ex.group]} · ${LEVELS[ex.level - 1].name}` })),
        h("span", { class: `pill${ok ? "" : " muted-pill"}`, text: ok ? "подходит" : "не сейчас" }));
    }) : [h("p", { class: "muted", text: "Ничего не нашлось" })]));
  };
  const search = h("input", { class: "input", type: "search", placeholder: "Поиск упражнения", "aria-label": "Поиск упражнения", maxlength: 60 });
  search.value = libFilter.q;
  search.addEventListener("input", () => { libFilter.q = search.value; fill(); });
  fill();
  return [
    h("h1", { class: "page-title", text: "Упражнения" }),
    h("section", { class: "card glass" },
      search,
      h("div", { style: { margin: "12px 0" } }, choice({
        label: "Группа", value: libFilter.group,
        options: [{ value: "all", label: "Все" }, ...Object.entries(GROUPS).map(([id, name]) => ({ value: id, label: name }))],
        onChange: v => { libFilter.group = v; fill(); }
      })),
      h("div", { style: { margin: "0 0 12px" } }, choice({
        label: "Инвентарь", value: libFilter.equip,
        options: EQUIP_FILTER.map(([value, label]) => ({ value, label })),
        onChange: v => { libFilter.equip = v; fill(); }
      })),
      toggle({ label: "Только подходящие мне", desc: "С учётом зон, особенностей и инвентаря", checked: libFilter.mine, onChange: v => { libFilter.mine = v; fill(); } })),
    h("section", { class: "card glass" }, list)
  ];
}

const timerCfg = { work: 30, rest: 15, rounds: 8 };
const TIMER_PRESETS = [
  { name: "Изометрия", work: 30, rest: 30, rounds: 5 },
  { name: "Связки", work: 45, rest: 45, rounds: 6 },
  { name: "Спокойный круг", work: 40, rest: 20, rounds: 8 },
  { name: "Табата", work: 20, rest: 10, rounds: 8, hi: true }
];
function subTimer() {
  const banned = E.restrictions(state).banned;
  const stepper = (label, key, min, max, step, unit) => {
    const val = h("b", { class: "stepper-val", text: `${timerCfg[key]}${unit}` });
    const set = v => { timerCfg[key] = Math.min(max, Math.max(min, v)); val.textContent = `${timerCfg[key]}${unit}`; };
    return h("div", { class: "row" },
      h("span", { class: "row-text" }, h("b", { text: label })),
      h("button", { class: "icon-btn", type: "button", "aria-label": `Меньше: ${label}`, onClick: () => set(timerCfg[key] - step) }, "−"),
      val,
      h("button", { class: "icon-btn", type: "button", "aria-label": `Больше: ${label}`, onClick: () => set(timerCfg[key] + step) }, "+"));
  };
  return [
    h("h1", { class: "page-title", text: "Интервальный таймер" }),
    h("p", { class: "lead", text: "Чередуйте работу и отдых в любых упражнениях. Сигнал прозвучит на каждой смене." }),
    h("section", { class: "card glass" },
      h("p", { class: "eyebrow", text: "Готовые режимы" }),
      h("div", { class: "chips" }, TIMER_PRESETS.filter(pr => !(pr.hi && banned.has("hi"))).map(pr => h("button", {
        class: "chip", type: "button", "aria-pressed": timerCfg.work === pr.work && timerCfg.rest === pr.rest && timerCfg.rounds === pr.rounds ? "true" : "false",
        onClick: () => { timerCfg.work = pr.work; timerCfg.rest = pr.rest; timerCfg.rounds = pr.rounds; refresh(); }
      }, `${pr.name} ${pr.rounds}×${pr.work}/${pr.rest}`))),
      h("p", { class: "muted small", style: { marginTop: "10px" }, text: "Изометрия и связки — длинные спокойные удержания: упражнения из раздела «Статика и связки» или любые позы, которые держите без боли." })),
    h("section", { class: "card glass" }, h("div", { class: "list" },
      stepper("Работа", "work", 10, 300, 5, " с"),
      stepper("Отдых", "rest", 0, 300, 5, " с"),
      stepper("Раунды", "rounds", 1, 30, 1, ""))),
    h("button", { class: "btn primary block", type: "button", onClick: startInterval }, icon("play", 18), "Старт"),
    h("p", { class: "muted small center", style: { marginTop: "12px" }, text: "Высокая интенсивность подходит не всем: при болезнях сердца и давлении выбирайте спокойный темп." })
  ];
}

const PATTERNS = [
  { id: "calm", name: "Спокойное 4–6", holds: false, phases: [["Вдох", 4, 1], ["Выдох", 6, 0.6]] },
  { id: "box", name: "Квадрат 4–4–4–4", holds: true, phases: [["Вдох", 4, 1], ["Пауза", 4, 1], ["Выдох", 4, 0.6], ["Пауза", 4, 0.6]] },
  { id: "478", name: "4–7–8", holds: true, phases: [["Вдох", 4, 1], ["Задержка", 7, 1], ["Выдох", 8, 0.6]] }
];
function subBreath() {
  const noHolds = state.profile.conditions.some(c => ["hypertension", "heart", "pregnancy"].includes(c));
  const options = PATTERNS.filter(p => !(noHolds && p.holds));
  let pattern = options[0];
  const ball = h("div", { class: "breath-ball" });
  const phase = h("b", { text: "Готовы?" });
  const count = h("span");
  const btn = h("button", { class: "btn primary block", type: "button", text: "Начать" });
  const cycles = 6;
  let timer = null, pi = 0, left = 0, cycle = 0;
  const stop = msg => {
    clearInterval(timer);
    timer = null;
    btn.textContent = "Начать";
    phase.textContent = msg;
    count.textContent = "";
    ball.style.transitionDuration = "1s";
    ball.style.transform = "scale(.6)";
    keepAwake(false);
  };
  const setPhase = () => {
    const [name, sec, scale] = pattern.phases[pi];
    left = sec;
    phase.textContent = name;
    count.textContent = String(left);
    ball.style.transitionDuration = `${sec}s`;
    ball.style.transform = `scale(${scale})`;
    say(name);
  };
  btn.addEventListener("click", () => {
    if (timer) return stop("Готовы?");
    pi = 0;
    cycle = 0;
    setPhase();
    btn.textContent = "Остановить";
    keepAwake(true);
    timer = setInterval(() => {
      if (!document.body.contains(ball)) { clearInterval(timer); keepAwake(false); return; }
      left -= 1;
      if (left > 0) { count.textContent = String(left); return; }
      pi = (pi + 1) % pattern.phases.length;
      if (pi === 0 && ++cycle >= cycles) return stop("Готово. Как самочувствие?");
      setPhase();
    }, 1000);
  });
  return [
    h("h1", { class: "page-title", text: "Дыхание" }),
    h("p", { class: "lead", text: "Медленное дыхание с длинным выдохом помогает успокоиться и восстановиться после тренировки." }),
    noHolds ? h("div", { class: "note-box", style: { marginBottom: "14px" } }, "Показаны практики без задержки дыхания — так безопаснее при ваших особенностях здоровья.") : null,
    h("section", { class: "card glass" },
      choice({ label: "Техника", value: pattern.id, options: options.map(p => ({ value: p.id, label: p.name })), onChange: v => { pattern = options.find(p => p.id === v); stop("Готовы?"); } }),
      h("div", { class: "breath-stage" }, ball, h("div", { class: "breath-text", "aria-live": "polite" }, phase, count)),
      btn,
      h("p", { class: "muted small center", style: { marginTop: "12px" }, text: `${cycles} циклов. Если закружится голова — вернитесь к обычному дыханию.` }))
  ];
}

function subCalendar() {
  const draft = { days: state.profile.days.slice() };
  const time = h("input", { class: "input", type: "time", value: state.profile.planTime || "19:00" });
  const err = h("p", { class: "error", role: "alert" });
  return [
    h("h1", { class: "page-title", text: "План и напоминания" }),
    h("section", { class: "card glass" },
      h("h2", { text: "Мой план" }),
      h("p", { class: "muted small", text: state.profile.planTime ? planText(state.profile) : "Когда, где и после чего вы тренируетесь. Заранее принятое решение помогает не пропускать." }),
      h("button", { class: "btn ghost", type: "button", text: state.profile.planTime ? "Изменить план" : "Составить план", onClick: planSheet })),
    h("p", { class: "lead", text: "Сохраните расписание в календарь телефона — он сам напомнит за 10 минут. Приложению не нужны уведомления и доступ к календарю." }),
    h("section", { class: "card glass" },
      h("div", { class: "q" }, h("b", { text: "Дни тренировок" }),
        choice({ multiple: true, label: "Дни тренировок", value: draft.days, options: WEEKDAYS.map((w, i) => ({ value: i + 1, label: w })), onChange: v => { draft.days = v; state.profile.days = v.length ? v.slice().sort() : state.profile.days; persist(); } })),
      h("label", { class: "field" }, h("span", { text: "Время" }), time),
      err,
      h("button", {
        class: "btn primary block", type: "button",
        onClick: () => {
          if (!draft.days.length) { err.textContent = "Выберите хотя бы один день"; return; }
          if (!/^\d{2}:\d{2}$/.test(time.value)) { err.textContent = "Укажите время"; return; }
          err.textContent = "";
          download("listopuls-trenirovki.ics", E.makeICS(draft.days.slice().sort(), time.value, state.profile.minutes), "text/calendar");
          toast("Файл сохранён — откройте его, чтобы добавить в календарь");
        }
      }, icon("download", 18), "Скачать файл для календаря")),
    h("section", { class: "card glass" },
      h("h2", { text: "Как добавить" }),
      h("ul", { class: "bullets" },
        h("li", { text: "iPhone: откройте скачанный файл и нажмите «Добавить все»." }),
        h("li", { text: "Android: откройте файл из уведомления о загрузке — он откроется в приложении «Календарь»." }),
        h("li", { text: "Чтобы изменить расписание, удалите старое событие в календаре и скачайте новый файл." })))
  ];
}

function subProfile() {
  const p = state.profile;
  const name = h("input", { class: "input", maxlength: 40, autocomplete: "nickname", placeholder: "Как к вам обращаться" });
  name.value = p.name;
  name.addEventListener("change", () => { p.name = clean(name.value, 40); persist(); });
  return [
    h("h1", { class: "page-title", text: "Профиль и цели" }),
    h("section", { class: "card glass" },
      h("label", { class: "field" }, h("span", { text: "Имя (необязательно)" }), name),
      h("div", { class: "q" }, h("b", { text: "Цель" }), choice({ label: "Цель", value: p.goal, options: GOALS.map(g => ({ value: g.id, label: g.name })), onChange: v => { p.goal = v; persist(); } })),
      h("div", { class: "q" }, h("b", { text: "Уровень" }), choice({ className: "seg", label: "Уровень", value: p.level, options: LEVELS.map(l => ({ value: l.v, label: l.name })), onChange: v => { p.level = v; persist(); } })),
      h("div", { class: "q" }, h("b", { text: "Инвентарь" }), choice({ multiple: true, label: "Инвентарь", value: p.equipment, options: EQUIPMENT.map(e => ({ value: e.id, label: e.name })), onChange: v => { p.equipment = v; persist(); } })),
      h("div", { class: "q" }, h("b", { text: "Длительность тренировки" }), choice({ className: "seg", label: "Длительность", value: p.minutes, options: [10, 20, 30, 45].map(m => ({ value: m, label: `${m} мин` })), onChange: v => { p.minutes = v; persist(); } })),
      h("div", { class: "q" }, h("b", { text: "Дни тренировок" }), choice({ multiple: true, label: "Дни", value: p.days, options: WEEKDAYS.map((w, i) => ({ value: i + 1, label: w })), onChange: v => { if (v.length) { p.days = v.slice().sort(); persist(); } } }))),
    h("section", { class: "card glass" },
      h("h2", { text: "Для калькуляторов" }),
      h("p", { class: "muted small", text: "Необязательно. Нужно только для расчёта ИМТ, калорий и пульсовых зон — остаётся на устройстве." }),
      h("div", { class: "q" }, h("b", { text: "Пол" }), choice({ className: "seg", label: "Пол", value: p.sex, options: [{ value: "", label: "Не указан" }, { value: "f", label: "Женский" }, { value: "m", label: "Мужской" }], onChange: v => { p.sex = v; persist(); } })),
      heightField()),
    h("section", { class: "card glass" },
      h("h2", { text: "Мой план" }),
      h("p", { class: "muted small", text: p.planTime ? planText(p) : "Когда, где и после чего вы тренируетесь — так проще не пропускать." }),
      h("button", { class: "btn ghost", type: "button", text: p.planTime ? "Изменить план" : "Составить план", onClick: planSheet })),
    h("section", { class: "card glass" },
      h("h2", { text: "Анкета безопасности" }),
      h("p", { class: "muted small", text: `${p.screenedAt ? `Заполнена ${fmtDate(p.screenedAt, { day: "numeric", month: "long", year: "numeric" })}. ` : ""}Обновляйте её раз в год и когда меняется здоровье — ответы обновят бережный режим. Тренировки и дневник сохранятся.` }),
      h("button", {
        class: "btn ghost", type: "button", text: "Пройти знакомство заново",
        onClick: () => { p.onboarded = false; onb = null; onbStep = 0; persist(); render(); }
      }))
  ];
}

// ===== Персонализация =====
// Всё оформление меняется сразу и хранится на устройстве. Четыре раздела, чтобы не листать длинную страницу
let lookTab = "style";
const LOOK_TABS = [["style", "Стиль"], ["text", "Текст"], ["screens", "Экраны"], ["demo", "Схемы"]];
const PRESET_KEYS = ["accent", "bg", "font", "head", "radius", "density", "glass", "bold", "reading", "scale"];
const PRESET_BASE = { bold: false, reading: false, scale: 100 };
function matchPreset(lk) {
  const p = L.PRESETS.find(x => PRESET_KEYS.every(k => ({ ...PRESET_BASE, ...x.set })[k] === lk[k]));
  return p ? p.id : "custom";
}
// rerender: false — для ползунков и выбора цвета, чтобы не мешать жесту
function changeLook(patch, { rerender = true } = {}) {
  look = L.sanitizeLook({ ...look, ...patch });
  look.preset = matchPreset(look);
  L.saveLook(look);
  applyLookNow();
  if (rerender) refresh();
}
function undoToast(message, before) {
  toast(message, { action: { label: "Вернуть", onClick: () => { look = before; L.saveLook(look); applyLookNow(); refresh(); } } });
}
const lookCard = (title, ...body) => h("section", { class: "card glass" }, h("h2", { text: title }), ...body);
const lookHint = textValue => h("p", { class: "muted small look-note", text: textValue });
// Выбор картинки с устройства: уменьшается и пересжимается здесь же, без отправки куда-либо
function pickImage(kind, onDone) {
  const input = h("input", { type: "file", accept: "image/*", class: "visually-hidden", "aria-label": kind === "avatar" ? "Фото профиля" : "Фото фона" });
  input.addEventListener("change", async () => {
    const f = input.files[0];
    input.remove();
    if (!f) return;
    try {
      const data = await L.processImage(f, kind === "avatar" ? { max: 320, square: true, quality: 0.85 } : { max: 1440, quality: 0.78 });
      if (data.length > store.MEDIA_MAX) throw new Error("Картинка слишком большая — выберите поменьше");
      const next = { ...media, [kind]: data };
      const ok = await store.saveMedia(next);
      if (!ok) throw new Error("Не хватило места в памяти браузера — выберите картинку поменьше");
      media = next;
      setMediaUrls();
      onDone();
    } catch (e) {
      toast(e.message || "Не удалось открыть картинку");
    }
  });
  document.body.append(input);
  input.click();
}
async function removeImage(kind, onDone) {
  const next = { ...media };
  delete next[kind];
  await store.saveMedia(next);
  media = next;
  setMediaUrls();
  onDone();
}

function subLook() {
  const tabs = choice({ className: "seg", label: "Раздел персонализации", value: lookTab, options: LOOK_TABS.map(([value, label]) => ({ value, label })), onChange: v => { lookTab = v; refresh(); } });
  const body = lookTab === "text" ? lookText() : lookTab === "screens" ? lookScreens() : lookTab === "demo" ? lookDemo() : lookStyle();
  return [
    h("h1", { class: "page-title", text: "Персонализация" }),
    h("p", { class: "lead", text: "Настройте приложение под себя: изменения видны сразу и сохраняются только на этом устройстве." }),
    tabs,
    ...body
  ];
}

// ----- Стиль: готовые наборы, цвет, тема, фон, форма -----
function lookStyle() {
  const dark = isDark();
  const presets = L.PRESETS.map(p => {
    const accent = L.accentSet((L.PALETTES.find(x => x.id === p.set.accent) || L.PALETTES[0]).seed);
    const font = (L.FONTS.find(f => f.id === p.set.font) || L.FONTS[0]).stack;
    const btn = h("button", { class: "preset", type: "button", "aria-pressed": look.preset === p.id ? "true" : "false" },
      h("span", { class: "preset-dots", "aria-hidden": "true" }, h("i"), h("i")),
      h("span", { class: "sample", "aria-hidden": "true", text: "Аа" }),
      h("b", { text: p.name }), h("span", { class: "small", text: p.desc }));
    btn.style.background = L.bgPreview(p.set.bg, dark);
    const dots = btn.querySelectorAll(".preset-dots i");
    dots[0].style.background = p.set.accent === "forest" ? (dark ? "#4ade80" : "#15803d") : (dark ? accent.accentDk : accent.accent);
    dots[1].style.background = dark ? "#e8f1eb" : "#0e1a13";
    btn.querySelector(".sample").style.fontFamily = font;
    btn.addEventListener("click", () => {
      const before = look;
      look = L.sanitizeLook({ ...look, ...PRESET_BASE, ...p.set });
      look.preset = p.id;
      L.saveLook(look);
      applyLookNow();
      refresh();
      undoToast(`Стиль «${p.name}»`, before);
    });
    return btn;
  });

  // Цвет акцента: готовые и свой; оттенки подбираются с проверкой контраста
  const swatches = L.PALETTES.map(p => {
    const c = L.accentSet(p.seed);
    const b = h("button", { class: "swatch", type: "button", "aria-label": p.name, title: p.name, "aria-pressed": look.accent === p.id ? "true" : "false", onClick: () => changeLook({ accent: p.id }) });
    b.style.background = p.id === "forest" ? (dark ? "#4ade80" : "#15803d") : (dark ? c.accentDk : c.accent);
    return b;
  });
  const colorInput = h("input", { type: "color", value: look.custom || L.seedOf(look), "aria-label": "Свой цвет" });
  colorInput.addEventListener("input", () => changeLook({ accent: "custom", custom: colorInput.value }, { rerender: false }));
  colorInput.addEventListener("change", () => changeLook({ accent: "custom", custom: colorInput.value }));
  const custom = h("label", { class: "swatch swatch-custom", title: "Свой цвет", "data-on": look.accent === "custom" ? "1" : "0" }, colorInput);

  // Фон
  const bgTiles = L.BACKGROUNDS.filter(b => b.id !== "photo").map(b => {
    const t = h("button", { class: "bg-tile", type: "button", "aria-pressed": look.bg === b.id ? "true" : "false", onClick: () => changeLook({ bg: b.id }) }, h("b", { class: "tile-label", text: b.name }));
    t.style.background = L.bgPreview(b.id, dark);
    return t;
  });
  const photoTile = h("button", {
    class: "bg-tile", type: "button", "aria-pressed": look.bg === "photo" ? "true" : "false",
    onClick: () => (media.bg ? changeLook({ bg: "photo" }) : pickImage("bg", () => changeLook({ bg: "photo" })))
  }, h("b", { class: "tile-label", text: media.bg ? "Своё фото" : "+ Своё фото" }));
  if (mediaUrls.bg) {
    photoTile.style.backgroundImage = `url("${mediaUrls.bg}")`;
    photoTile.style.backgroundSize = "cover";
    photoTile.style.backgroundPosition = "center";
  }
  const range = (label, value, min, max, step, unit, onLive) => {
    const out = h("output", { text: `${value}${unit}` });
    const input = h("input", { class: "range neutral", type: "range", min, max, step, value, "aria-label": label });
    input.addEventListener("input", () => { out.textContent = `${input.value}${unit}`; onLive(Number(input.value), false); });
    input.addEventListener("change", () => onLive(Number(input.value), true));
    return h("div", { class: "q" }, h("b", { text: label }), h("div", { class: "range-row" }, input, out));
  };
  const photoControls = look.bg === "photo" && media.bg ? [
    range("Размытие", look.blur, 0, 24, 1, " px", (v, done) => changeLook({ blur: v }, { rerender: done })),
    range("Затемнение под текстом", look.dim, 20, 85, 5, " %", (v, done) => changeLook({ dim: v }, { rerender: done })),
    lookHint("Чем сильнее затемнение, тем лучше читается текст поверх фото.")
  ] : [];

  return [
    lookCard("Готовые стили", h("p", { class: "muted small", text: "Цвет, фон, шрифт и форма — одним касанием. Потом любую деталь можно поменять." }), h("div", { class: "preset-grid" }, presets)),
    lookCard("Цвет акцента",
      h("p", { class: "muted small", text: "Кнопки, ссылки, кольца и подсветка мышц. Оттенки подбираются так, чтобы текст хорошо читался в светлой и тёмной теме." }),
      h("div", { class: "swatches", role: "group", "aria-label": "Цвет акцента" }, swatches, custom),
      lookHint(look.accent === "custom" ? "Свой цвет: яркость подстроена для читаемости." : `Сейчас: ${(L.PALETTES.find(p => p.id === look.accent) || L.PALETTES[0]).name}.`)),
    lookCard("Тема",
      choice({ className: "seg", label: "Тема", value: store.getTheme(), options: [{ value: "auto", label: "Авто" }, { value: "light", label: "Светлая" }, { value: "dark", label: "Тёмная" }], onChange: v => { store.setTheme(v); applyTheme(v); applyLookNow(); refresh(); } }),
      lookHint("«Авто» — как в настройках телефона."),
      h("div", { class: "list" }, toggle({ label: "Стеклянные панели", desc: "Полупрозрачные карточки. Выключите, чтобы фон был сплошным: легче читать и бережёт батарею", checked: look.glass, onChange: v => { changeLook({ glass: v }); state.settings.lessGlass = !v; persist(); } }))),
    lookCard("Фон",
      h("div", { class: "bg-tiles" }, bgTiles, photoTile),
      ...photoControls,
      media.bg ? h("div", { class: "btn-row" },
        h("button", { class: "btn small ghost", type: "button", onClick: () => pickImage("bg", () => changeLook({ bg: "photo" })) }, icon("image", 16), "Другое фото"),
        h("button", { class: "btn small ghost", type: "button", onClick: () => removeImage("bg", () => changeLook({ bg: look.bg === "photo" ? "soft" : look.bg })) }, icon("trash", 16), "Убрать фото")) : null,
      lookHint("Фото уменьшается и хранится только на этом устройстве, без геометки. С паролем оно шифруется вместе с данными.")),
    lookCard("Форма",
      h("div", { class: "q" }, h("b", { text: "Углы" }), choice({ className: "seg", label: "Углы", value: look.radius, options: L.RADII, onChange: v => changeLook({ radius: v }) })),
      h("div", { class: "q" }, h("b", { text: "Плотность" }), choice({ className: "seg", label: "Плотность", value: look.density, options: L.DENSITY, onChange: v => changeLook({ density: v }) }))),
    lookShareCard(),
    lookCard("Сбросить",
      h("p", { class: "muted small", text: "Вернуть оформление по умолчанию. Данные, фото и избранное останутся." }),
      h("button", {
        class: "btn ghost", type: "button", text: "Вернуть как было",
        onClick: async () => {
          const ok = await confirmSheet({ title: "Сбросить оформление?", message: "Цвет, фон, шрифты и расположение станут как при первом запуске.", ok: "Сбросить" });
          if (!ok) return;
          const before = look;
          // Аватар — часть профиля, а не оформления: его сброс не трогает
          look = { ...L.defaultLook(), avatar: before.avatar, emoji: before.emoji };
          L.saveLook(look);
          applyLookNow();
          refresh();
          undoToast("Оформление сброшено", before);
        }
      }))
  ];
}

// Код стиля: передать оформление другу или перенести на другой телефон
function lookShareCard() {
  const code = L.lookCode(look);
  const input = h("input", { class: "input", type: "text", placeholder: "Вставьте код стиля LP1-…", "aria-label": "Код стиля", maxlength: 4000, autocomplete: "off", spellcheck: "false" });
  return lookCard("Поделиться стилем",
    h("p", { class: "muted small", text: "Код содержит только оформление — без фото, имени и сведений о здоровье." }),
    h("details", { class: "more" }, h("summary", { text: "Показать код" }), h("p", { class: "code-box", text: code })),
    h("div", { class: "btn-row" },
      h("button", {
        class: "btn small ghost", type: "button",
        onClick: async () => {
          try { await navigator.clipboard.writeText(code); toast("Код стиля скопирован"); } catch (e) { toast("Выделите код и скопируйте вручную"); }
        }
      }, icon("share", 16), "Скопировать код")),
    h("label", { class: "field" }, h("span", { text: "Применить чужой стиль" }), input),
    h("div", { class: "btn-row" }, h("button", {
      class: "btn small primary", type: "button", text: "Применить",
      onClick: () => {
        const parsed = L.parseLookCode(input.value);
        if (!parsed) { toast("Код не подошёл — проверьте, что он скопирован целиком"); return; }
        const before = look;
        // Своя аватарка остаётся своей
        look = { ...parsed, avatar: before.avatar, emoji: before.emoji, preset: matchPreset(parsed) };
        L.saveLook(look);
        applyLookNow();
        refresh();
        undoToast("Стиль применён", before);
      }
    })));
}

// ----- Текст: шрифт, заголовки, размер, жирность -----
function lookText() {
  const fontRows = L.FONTS.map(f => {
    const sample = h("span", { class: "sample", "aria-hidden": "true", text: "Аа" });
    sample.style.fontFamily = f.stack;
    return h("button", { class: "row row-btn font-row", type: "button", "aria-pressed": look.font === f.id ? "true" : "false", onClick: () => changeLook({ font: f.id }) },
      sample, h("span", { class: "row-text" }, h("b", { text: f.name }), h("span", { class: "muted small", text: FONT_DESC[f.id] })));
  });
  const heads = choice({
    label: "Шрифт заголовков", value: look.head,
    options: L.HEAD_FONTS.map(f => ({ value: f.id, label: f.name })),
    onChange: v => changeLook({ head: v })
  });
  heads.querySelectorAll(".chip").forEach((b, i) => { const f = L.HEAD_FONTS[i]; if (f.stack) b.style.fontFamily = f.stack; });
  const out = h("output", { text: `${look.scale} %` });
  const size = h("input", { class: "range neutral", type: "range", min: 85, max: 130, step: 5, value: look.scale, "aria-label": "Размер текста" });
  size.addEventListener("input", () => { out.textContent = `${size.value} %`; changeLook({ scale: Number(size.value) }, { rerender: false }); });
  size.addEventListener("change", () => changeLook({ scale: Number(size.value) }));
  return [
    lookCard("Шрифт", h("div", { class: "list" }, fontRows), lookHint("Шрифты встроены в приложение и работают без интернета.")),
    lookCard("Заголовки", heads),
    lookCard("Размер текста",
      h("div", { class: "range-row" }, size, out),
      h("p", { class: "size-sample", text: "Так будет выглядеть текст: «Сделайте 10 приседаний, спина ровная»." }),
      lookHint("Кнопки и отступы не меняются — растёт только текст.")),
    h("section", { class: "card glass" }, h("div", { class: "list" },
      toggle({ label: "Жирный текст", desc: "Плотнее начертание — легче читать на солнце", checked: look.bold, onChange: v => changeLook({ bold: v }) }),
      toggle({ label: "Удобное чтение", desc: "Больше расстояние между буквами, словами и строками", checked: look.reading, onChange: v => changeLook({ reading: v }) })))
  ];
}
const FONT_DESC = {
  system: "Шрифт телефона: привычный и экономный",
  rounded: "Nunito — мягкий и дружелюбный",
  modern: "Rubik — чёткий, слегка скруглённый",
  serif: "PT Serif — классика для чтения",
  mono: "JetBrains Mono — ровные цифры и буквы"
};

// ----- Экраны: главный экран, девиз, нижняя панель, аватар -----
function moveIn(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const next = list.map(x => (Array.isArray(x) ? [...x] : x));
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
function orderRow(label, i, len, onMove, extra = null, off = false) {
  return h("div", { class: `order-row${off ? " is-off" : ""}` },
    h("span", { class: "row-text" }, h("b", { text: label })),
    h("button", { class: "icon-btn mini", type: "button", "aria-label": `Выше: ${label}`, disabled: i === 0, onClick: () => onMove(-1) }, icon("up", 16)),
    h("button", { class: "icon-btn mini", type: "button", "aria-label": `Ниже: ${label}`, disabled: i === len - 1, onClick: () => onMove(1) }, icon("down", 16)),
    extra);
}
function lookScreens() {
  const names = Object.fromEntries(L.HOME_BLOCKS);
  const homeRows = look.home.map(([id, on], i) => {
    const sw = h("input", { type: "checkbox", class: "switch", checked: on, "aria-label": `Показывать: ${names[id]}` });
    sw.addEventListener("change", () => changeLook({ home: look.home.map(([bid, v]) => [bid, bid === id ? sw.checked : v]) }));
    return orderRow(names[id], i, look.home.length, dir => changeLook({ home: moveIn(look.home, i, dir) }), sw, !on);
  });
  const motto = h("input", { class: "input", type: "text", maxlength: 80, value: state.settings.motto, placeholder: "Например: шаг за шагом", "aria-label": "Мой девиз" });
  motto.addEventListener("change", () => { state.settings.motto = motto.value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80); persist(); toast(state.settings.motto ? "Девиз сохранён" : "Девиз убран"); });
  const tabRows = look.tabs.map((id, i) => orderRow(L.TAB_NAMES[id], i, look.tabs.length, dir => changeLook({ tabs: moveIn(look.tabs, i, dir) })));
  const avatarKinds = choice({
    className: "seg", label: "Аватар", value: look.avatar,
    options: [{ value: "letter", label: "Буква" }, { value: "emoji", label: "Эмодзи" }, { value: "photo", label: "Фото" }],
    onChange: v => (v === "photo" && !media.avatar ? pickImage("avatar", () => changeLook({ avatar: "photo" })) : changeLook({ avatar: v }))
  });
  const favs = state.favs.map(id => QUICK.find(q => q.id === id)).filter(Boolean);
  return [
    lookCard("Главный экран",
      h("p", { class: "muted small", text: "Порядок блоков и что показывать. Предупреждения о боли и важные подсказки всегда остаются сверху." }),
      h("div", {}, homeRows)),
    lookCard("Мой девиз",
      h("label", { class: "field" }, h("span", { text: "Фраза на главном экране" }), motto),
      lookHint("Пусто — блок не показывается.")),
    lookCard("Избранное",
      favs.length
        ? h("div", { class: "list" }, favs.map(q => h("div", { class: "row" },
          h("span", { class: "row-text" }, h("b", { text: q.name })),
          h("button", { class: "icon-btn mini", type: "button", "aria-label": `Убрать из избранного: ${q.name}`, onClick: () => { state.favs = state.favs.filter(x => x !== q.id); persist(); refresh(); } }, icon("close", 16)))))
        : h("p", { class: "muted small", text: "Откройте любую готовую тренировку и нажмите «В избранное» — она появится на главном экране." }),
      h("div", { class: "btn-row" }, h("a", { class: "btn small ghost", href: "#workout/ready" }, icon("star", 16), "К готовым тренировкам"))),
    lookCard("Нижняя панель",
      h("p", { class: "muted small", text: "Порядок вкладок." }),
      h("div", {}, tabRows),
      h("div", { class: "list" }, toggle({ label: "Подписи под значками", desc: "Без подписей значки крупнее", checked: look.labels, onChange: v => changeLook({ labels: v }) })),
      h("div", { class: "q", style: { marginTop: "12px" } }, h("b", { text: "Экран при запуске" }),
        choice({ label: "Экран при запуске", value: look.start, options: L.TAB_IDS.map(id => ({ value: id, label: L.TAB_NAMES[id] })), onChange: v => changeLook({ start: v }) }))),
    lookCard("Аватар",
      h("div", { class: "today-head" }, avatarEl({ big: true }), h("p", { class: "muted small", text: "Виден в профиле и на главном экране." })),
      avatarKinds,
      look.avatar === "emoji" ? h("div", { class: "emoji-grid", role: "group", "aria-label": "Эмодзи" },
        L.EMOJI.map(em => h("button", { class: "emoji-btn", type: "button", text: em, "aria-pressed": look.emoji === em ? "true" : "false", onClick: () => changeLook({ emoji: em }) }))) : null,
      look.avatar === "photo" && media.avatar ? h("div", { class: "btn-row" },
        h("button", { class: "btn small ghost", type: "button", onClick: () => pickImage("avatar", () => changeLook({ avatar: "photo" })) }, icon("image", 16), "Другое фото"),
        h("button", { class: "btn small ghost", type: "button", onClick: () => removeImage("avatar", () => changeLook({ avatar: "letter" })) }, icon("trash", 16), "Убрать фото")) : null)
  ];
}

// ----- Схемы движений, 3D-манекен и эффекты -----
function lookDemo() {
  const figChips = choice({ label: "Цвет фигуры", value: look.figure, options: L.FIGURES.map(f => ({ value: f.id, label: f.name })), onChange: v => changeLook({ figure: v }) });
  const speed = choice({ className: "seg", label: "Скорость показа", value: look.speed, options: L.SPEEDS.map(v => ({ value: v, label: `${String(v).replace(".", ",")}×` })), onChange: v => changeLook({ speed: v }) });
  const bodies = L.BODIES.map(b => {
    const c = isDark() ? b.d : b.l;
    const btn = h("button", { class: "swatch", type: "button", "aria-label": `Манекен: ${b.name.toLowerCase()}`, title: b.name, "aria-pressed": look.body === b.id ? "true" : "false", onClick: () => changeLook({ body: b.id }) });
    btn.style.background = `rgb(${c.map(v => Math.round(v * 255)).join(", ")})`;
    return btn;
  });
  return [
    lookCard("Фигура в схемах движений",
      h("div", { class: "look-demo" }, demoBox("squat")),
      h("div", { class: "q" }, h("b", { text: "Цвет фигуры" }), figChips),
      h("div", { class: "q" }, h("b", { text: "Скорость показа" }), speed),
      h("div", { class: "list" }, toggle({ label: "Подсветка работающих мышц", desc: "Мышцы, которые нагружает упражнение, выделены цветом акцента", checked: look.muscles, onChange: v => changeLook({ muscles: v }) }))),
    lookCard("3D-манекен",
      h("div", { class: "swatches", role: "group", "aria-label": "Цвет манекена" }, bodies),
      lookHint(`Сейчас: ${(L.BODIES.find(b => b.id === look.body) || L.BODIES[0]).name.toLowerCase()}. Манекен — во вкладке «Тело».`)),
    h("section", { class: "card glass" }, h("div", { class: "list" },
      toggle({ label: "Меньше анимации", desc: "Схемы показывают одну позу, без плавных переходов", checked: look.still, onChange: v => changeLook({ still: v }) }),
      toggle({ label: "Праздничные эффекты", desc: "Конфетти после тренировки и наград", checked: look.fx, onChange: v => changeLook({ fx: v }) })))
  ];
}

function subSettings() {
  const st = state.settings;
  return [
    h("h1", { class: "page-title", text: "Настройки" }),
    h("section", { class: "card glass list-group" }, h("div", { class: "list" },
      h("a", { class: "row lg-row", href: "#more/look" }, h("span", { class: "fi" }, icon("palette", 18)),
        h("span", { class: "row-text" }, h("b", { text: "Персонализация" }), h("span", { class: "muted small", text: "Цвет, фон, шрифт, расположение, аватар" })), icon("chevron", 16)))),
    h("section", { class: "card glass" },
      h("div", { class: "q" }, h("b", { text: "Тема" }),
        choice({ className: "seg", label: "Тема", value: store.getTheme(), options: [{ value: "auto", label: "Как в системе" }, { value: "light", label: "Светлая" }, { value: "dark", label: "Тёмная" }], onChange: v => { store.setTheme(v); applyTheme(v); } }))),
    h("section", { class: "card glass" }, h("div", { class: "list" },
      toggle({ label: "Звуковые сигналы", desc: "Смена упражнений и отсчёт 3-2-1", checked: st.sound, onChange: v => { st.sound = v; persist(); } }),
      toggle({ label: "Голосовые подсказки", desc: "Название упражнения и отдых — вслух", checked: st.voice, onChange: v => { st.voice = v; persist(); if (v) speak("Голосовые подсказки включены"); } }),
      toggle({ label: "Вибрация", desc: "На телефонах с Android", checked: st.vibrate, onChange: v => { st.vibrate = v; persist(); } }),
      toggle({ label: "Меньше прозрачности", desc: "Сплошной фон вместо стекла: легче читать и бережёт батарею", checked: !look.glass, onChange: v => { changeLook({ glass: !v }, { rerender: false }); st.lessGlass = v; persist(); } })))
  ];
}

function passwordSheet(change) {
  const field = (label, input) => h("label", { class: "field" }, h("span", { text: label }), input);
  const p1 = h("input", { class: "input", type: "password", autocomplete: "new-password", maxlength: 128 });
  const p2 = h("input", { class: "input", type: "password", autocomplete: "new-password", maxlength: 128 });
  const err = h("p", { class: "error", role: "alert" });
  const btn = h("button", { class: "btn primary", type: "button", text: change ? "Сменить пароль" : "Зашифровать" });
  const close = sheet({
    title: change ? "Новый пароль" : "Задать пароль",
    body: [
      h("p", { class: "muted small", text: "Минимум 8 символов. Надёжнее всего — фраза из нескольких слов." }),
      field("Пароль", p1),
      field("Ещё раз", p2),
      h("div", { class: "note-box" }, h("b", { text: "Пароль нельзя восстановить. " }), "Если забудете его, данные придётся удалить. Сначала сохраните резервную копию."),
      err
    ],
    actions: [btn]
  });
  btn.addEventListener("click", async () => {
    if (p1.value.length < 8) { err.textContent = "Пароль должен быть не короче 8 символов"; return; }
    if (p1.value !== p2.value) { err.textContent = "Пароли не совпадают"; return; }
    btn.disabled = true;
    btn.textContent = "Шифруем…";
    clearTimeout(saveTimer);
    dirty = false;
    const ok = await store.setPassword(state, p1.value);
    p1.value = "";
    p2.value = "";
    close();
    refresh();
    toast(ok ? "Готово: данные зашифрованы" : "Не удалось сохранить");
  });
}

// ----- Выгрузка в CSV -----
// Разделитель «;» и BOM — так таблицу правильно открывает русский Excel.
// Ячейки, которые начинаются с = + - @, экранируются: иначе Excel может принять их за формулу.
const csvCell = v => {
  let t = String(v === null || v === undefined ? "" : v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const toCSV = rows => `﻿${rows.map(r => r.map(csvCell).join(";")).join("\r\n")}\r\n`;
const GOAL_WORD = { activity: "Активность", custom: "Своя тренировка", program: "Программа", morning: "Зарядка", challenge: "Челлендж", timer: "Таймер", run: "Бег с нуля" };
const goalWord = g => GOAL_WORD[g] || (GOALS.find(x => x.id === g) || {}).short || (QUICK.some(q => q.id === g) ? "Готовая тренировка" : g);
function exportCSV(kind) {
  let rows, name;
  if (kind === "sessions") {
    name = "trenirovki";
    rows = [["Дата", "Час", "Название", "Тип", "Минуты", "Дистанция, км", "Тяжесть 1–10", "Подходов", "Боль во время занятия"],
      ...state.sessions.map(x => [x.d, x.hour, x.title, goalWord(x.goal), x.mins, x.km ? fmtNum(x.km) : "", x.rpe || "", x.count || "", x.pains.map(p => REGION[p.region].name).join(", ")])];
  } else if (kind === "weights") {
    name = "podhody";
    rows = [["Упражнение", "Дата", "Вес, кг", "Повторы", "Расчётный 1ПМ, кг"]];
    for (const [id, w] of Object.entries(state.weights)) {
      if (!own(EX, id)) continue;
      for (const x of w.hist) rows.push([EX[id].name, x[0], fmtNum(x[1]), x[2] || "", x[2] ? fmtNum(E.e1rm(x[1], x[2])) : ""]);
    }
  } else if (kind === "pain") {
    name = "dnevnik-boli";
    rows = [["Дата", "Зона", "Боль 0–10"], ...state.painLog.map(x => [x.d, REGION[x.region] ? REGION[x.region].name : x.region, x.level])];
  } else {
    name = "ves-tela";
    rows = [["Дата", "Вес тела, кг", "Обхват талии, см"], ...state.bodyWeight.map(x => [x[0], fmtNum(x[1]), x[2] ? fmtNum(x[2]) : ""])];
  }
  if (rows.length < 2) { toast("Пока нечего выгружать"); return; }
  download(`listopuls-${name}-${E.dayKey()}.csv`, toCSV(rows), "text/csv;charset=utf-8");
}

function subData() {
  const enc = store.isEncrypted();
  const persistNote = h("p", { class: "muted small" });
  try {
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then(p => {
        persistNote.textContent = p ? "Браузер не удалит данные при нехватке места: хранилище защищено." : "Браузер может удалить данные сайта при нехватке места или если долго не открывать приложение (особенно Safari). Установите приложение на главный экран и делайте копии.";
      }).catch(() => {});
    }
  } catch (e) { /* не поддерживается */ }
  const file = h("input", { type: "file", accept: "application/json,.json", class: "visually-hidden", "aria-label": "Файл резервной копии" });
  file.addEventListener("change", async () => {
    const f = file.files[0];
    file.value = "";
    if (!f) return;
    if (f.size > store.MAX_IMPORT_BYTES) { toast("Файл слишком большой"); return; }
    try {
      const textValue = await f.text();
      const imported = store.importJSON(textValue);
      const extras = store.readExtras(textValue);
      const ok = await confirmSheet({ title: "Загрузить копию?", message: "Данные на этом устройстве будут заменены данными из файла.", ok: "Заменить" });
      if (!ok) return;
      state = imported;
      planCache.key = "";
      persist();
      if (extras.look) { look = L.sanitizeLook(extras.look); L.saveLook(look); }
      if (Object.keys(extras.media).length) { media = extras.media; await store.saveMedia(media); setMediaUrls(); }
      applyGlass();
      refresh();
      toast("Данные восстановлены");
    } catch (e) {
      toast(e instanceof SyntaxError ? "Файл повреждён" : e.message || "Не удалось прочитать файл");
    }
  });
  return [
    h("h1", { class: "page-title", text: "Данные и защита" }),
    h("section", { class: "card glass" },
      h("h2", { text: "Где хранятся данные" }),
      h("ul", { class: "bullets" },
        h("li", { text: "Только на этом устройстве, в памяти браузера." }),
        h("li", { text: "Мы их не получаем: в приложении нет серверов, аналитики, рекламы и cookie." }),
        h("li", { text: "Если очистить данные браузера или удалить приложение, всё сотрётся — делайте резервные копии." }))),
    h("section", { class: "card glass" },
      h("div", { class: "card-head" }, h("h2", { text: "Пароль" }), h("span", { class: `pill${enc ? "" : " muted-pill"}`, text: enc ? "зашифровано" : "не задан" })),
      h("p", { class: "muted small", text: "С паролем все данные шифруются алгоритмом AES-256. Без пароля их не прочитать, даже скопировав память браузера. Приложение само блокируется, если свернуть его больше чем на 5 минут." }),
      enc ? h("div", { class: "btn-row" },
        h("button", { class: "btn ghost", type: "button", text: "Заблокировать сейчас", onClick: lockNow }),
        h("button", { class: "btn ghost", type: "button", text: "Сменить пароль", onClick: () => passwordSheet(true) }),
        h("button", {
          class: "btn ghost", type: "button", text: "Снять пароль",
          onClick: async () => {
            const ok = await confirmSheet({ title: "Снять пароль?", message: "Данные останутся на устройстве, но перестанут быть зашифрованными.", ok: "Снять" });
            if (ok) { clearTimeout(saveTimer); dirty = false; await store.removePassword(state); refresh(); toast("Пароль снят"); }
          }
        }))
        : h("div", { class: "btn-row" }, h("button", { class: "btn primary", type: "button", onClick: () => passwordSheet(false) }, icon("lock", 18), "Задать пароль"))),
    h("section", { class: "card glass" },
      h("h2", { text: "Резервная копия" }),
      h("p", { class: "muted small", text: "Файл со всеми вашими данными. В нём есть сведения о здоровье — храните его в надёжном месте и не пересылайте посторонним." }),
      h("div", { class: "btn-row" },
        h("button", { class: "btn ghost", type: "button", onClick: () => { saveBackup(); refresh(); toast("Копия сохранена"); } }, icon("download", 18), "Сохранить копию"),
        h("button", { class: "btn ghost", type: "button", text: "Загрузить копию", onClick: () => file.click() })),
      h("p", { class: "muted small", text: state.settings.lastBackup ? `Последняя копия: ${fmtFull(state.settings.lastBackup)}.` : "Копию ещё не сохраняли. Напомним через месяц занятий." }),
      persistNote,
      file),
    h("section", { class: "card glass" },
      h("h2", { text: "Таблицы для Excel" }),
      h("p", { class: "muted small", text: "Выгрузка в CSV: откроется в Excel, Google Таблицах или «Мой Офис». Удобно, чтобы вести свой учёт или показать тренеру." }),
      h("div", { class: "btn-row" },
        [["sessions", "Тренировки"], ["weights", "Подходы с весом"], ["pain", "Дневник боли"], ["body", "Вес тела"]].map(([kind, label]) =>
          h("button", { class: "btn small ghost", type: "button", onClick: () => exportCSV(kind) }, icon("download", 16), label)))),
    h("section", { class: "card glass alert" },
      h("h2", { text: "Удалить всё" }),
      h("p", { class: "small", text: "Профиль, отметки, тренировки и награды будут удалены с этого устройства без возможности восстановления." }),
      h("button", {
        class: "btn danger", type: "button", text: "Удалить все данные",
        onClick: async () => {
          const ok = await confirmSheet({ title: "Удалить все данные?", message: "Это действие нельзя отменить.", ok: "Удалить", danger: true });
          if (!ok) return;
          clearTimeout(saveTimer);
          dirty = false;
          store.wipe();
          state = store.defaultState();
          look = L.defaultLook();
          clearMedia();
          planCache.key = "";
          onb = null;
          onbStep = 0;
          applyGlass();
          window.location.hash = "";
          render();
          toast("Все данные удалены");
        }
      }))
  ];
}

function subInstall() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  return [
    h("h1", { class: "page-title", text: "Установить на телефон" }),
    standalone ? h("section", { class: "card glass" }, h("p", { text: "Приложение уже установлено — вы открыли его с главного экрана. 🎉" })) : null,
    installPrompt && !standalone ? h("section", { class: "card glass" },
      h("p", { text: "Браузер готов установить Листопульс как приложение." }),
      h("button", {
        class: "btn primary block", type: "button", text: "Установить",
        onClick: async () => {
          const promptEvent = installPrompt;
          installPrompt = null;
          promptEvent.prompt();
          try { await promptEvent.userChoice; } catch (e) { /* пользователь закрыл окно */ }
          refresh();
        }
      })) : null,
    h("section", { class: "card glass" },
      h("h2", { text: "iPhone и iPad" }),
      h("ol", { class: "bullets" },
        h("li", { text: "Откройте приложение в Safari." }),
        h("li", { text: "Нажмите «Поделиться» — квадрат со стрелкой вверх." }),
        h("li", { text: "Выберите «На экран „Домой“» и нажмите «Добавить»." }))),
    h("section", { class: "card glass" },
      h("h2", { text: "Android" }),
      h("ol", { class: "bullets" },
        h("li", { text: "Откройте приложение в Chrome или Яндекс Браузере." }),
        h("li", { text: "Откройте меню ⋮." }),
        h("li", { text: "Выберите «Установить приложение» или «Добавить на главный экран»." }))),
    h("section", { class: "card glass" }, h("p", { text: "После установки Листопульс работает и без интернета: тренировки, таймеры и дневник доступны офлайн." }))
  ];
}

function subAbout() {
  return [
    h("h1", { class: "page-title", text: "О приложении" }),
    h("section", { class: "card glass" },
      h("h2", { text: "Тренер, который слушает тело" }),
      h("p", { text: "Бесплатное веб-приложение для домашних тренировок. Подбирает упражнения с учётом травм, болезненных зон, особенностей здоровья и самочувствия." }),
      h("p", { class: "muted small", text: `Версия ${VERSION} · возрастная маркировка 12+` })),
    h("section", { class: "card glass warn" },
      h("h2", { text: "Важно о здоровье" }),
      h("ul", { class: "bullets" },
        h("li", { text: "Листопульс не является медицинским изделием, не ставит диагнозов и не назначает лечение." }),
        h("li", { text: "Рекомендации общие и строятся по данным, которые вы указали сами." }),
        h("li", { text: "При заболеваниях, после травм и операций, во время беременности посоветуйтесь с врачом до начала тренировок." }),
        h("li", { text: "Острая или усиливающаяся боль — повод остановиться и обратиться к врачу." }))),
    h("section", { class: "card glass" },
      h("h2", { text: "Документы" }),
      h("div", { class: "list" },
        h("a", { class: "row", href: "terms.html" }, h("span", { class: "row-text" }, h("b", { text: "Условия использования" })), icon("chevron", 18)),
        h("a", { class: "row", href: "recommendations.html" }, h("span", { class: "row-text" }, h("b", { text: "Правила применения рекомендательных технологий" }), h("span", { class: "muted small", text: "Как подбираются тренировки" })), icon("chevron", 18)),
        h("a", { class: "row", href: "privacy.html" }, h("span", { class: "row-text" }, h("b", { text: "Конфиденциальность" })), icon("chevron", 18)))),
    h("section", { class: "card glass" },
      h("h2", { text: "Авторские права" }),
      h("p", { class: "small", text: "Код, тексты, описания упражнений и иллюстрации созданы для Листопульса. Внешние шрифты, библиотеки и счётчики не используются." }))
  ];
}

// ===== Калькуляторы =====
const AGE_DEFAULT = { teen: 15, adult: 30, mature: 50, senior: 68 };
const calcDraft = { age: 0, kg: 0, waist: 0, act: 1.375, lift: 0, reps: 5 };
const fmtInt = v => Math.round(v).toLocaleString("ru-RU");
function heightField(onChange) {
  const p = state.profile;
  const inp = h("input", { class: "input", type: "number", inputmode: "numeric", min: 100, max: 250, step: 1, placeholder: "например, 170", value: p.height || "" });
  inp.addEventListener("input", () => {
    const v = Math.round(Number(inp.value));
    p.height = Number.isInteger(v) && v >= 100 && v <= 250 ? v : 0;
    persist();
    if (onChange) onChange();
  });
  return h("label", { class: "field" }, h("span", { text: "Рост, см" }), inp);
}
function bmiWord(bmi) {
  if (bmi < 18.5) return "Ниже нормы — обсудите питание с врачом";
  if (bmi < 25) return "В пределах нормы";
  if (bmi < 30) return "Выше нормы (избыточная масса тела)";
  return "Ожирение — стоит обсудить с врачом";
}
function subCalc() {
  const p = state.profile;
  const teen = p.ageGroup === "teen";
  const pregnant = p.conditions.includes("pregnancy");
  const heart = p.conditions.includes("heart") || p.conditions.includes("hypertension");
  const lastW = state.bodyWeight.length ? state.bodyWeight[state.bodyWeight.length - 1][1] : 0;
  if (!calcDraft.age) calcDraft.age = AGE_DEFAULT[p.ageGroup] || 30;
  if (!calcDraft.kg) calcDraft.kg = lastW;
  const out = {};
  const val = key => (out[key] = h("b", { class: "calc-val", "aria-live": "polite", text: "—" }));
  const note = key => (out[key] = h("p", { class: "muted small" }));
  const field = (label, el) => h("label", { class: "field" }, h("span", { text: label }), el);
  const numInput = (value, min, max, step, onInput) => {
    const el = h("input", { class: "input", type: "number", inputmode: step < 1 ? "decimal" : "numeric", min, max, step, value: value || "" });
    el.addEventListener("input", () => {
      const v = Number(String(el.value).replace(",", "."));
      onInput(Number.isFinite(v) && v >= min && v <= max ? v : 0);
      update();
    });
    return el;
  };
  const result = (key, label) => h("div", { class: "calc-result" }, val(key), h("span", { class: "muted small", text: label }));

  function update() {
    const cm = p.height, kg = calcDraft.kg, age = calcDraft.age;
    // ИМТ
    if (cm && kg) {
      const bmi = kg / (cm / 100) ** 2;
      out.bmi.textContent = bmi.toFixed(1).replace(".", ",");
      out.bmiNote.textContent = teen ? "До 18 лет ИМТ оценивают по возрастным таблицам — покажите результат врачу." : `${bmiWord(bmi)}. ИМТ не учитывает мышцы: у тех, кто занимается силовыми, он бывает завышен.`;
    } else {
      out.bmi.textContent = "—";
      out.bmiNote.textContent = "Укажите рост и вес.";
    }
    // Обхват талии
    if (calcDraft.waist) {
      out.waist.textContent = fmtNum(calcDraft.waist);
      out.waistNote.textContent = waistText(calcDraft.waist)[0].toUpperCase() + waistText(calcDraft.waist).slice(1) + ".";
    } else {
      out.waist.textContent = "—";
      out.waistNote.textContent = "Укажите обхват талии.";
    }
    // Калории по формуле Миффлина — Сан Жеора
    if (cm && kg && age && p.sex && !teen && !pregnant) {
      const bmr = 10 * kg + 6.25 * cm - 5 * age + (p.sex === "m" ? 5 : -161);
      const tdee = bmr * calcDraft.act;
      out.kcal.textContent = `${fmtInt(tdee)} ккал`;
      out.kcalNote.textContent = `Столько нужно в день, чтобы вес не менялся. Базовый обмен — ${fmtInt(bmr)} ккал. Для плавного снижения веса: ${fmtInt(Math.max(bmr, tdee - 500))}–${fmtInt(Math.max(bmr, tdee - 300))} ккал, не ниже базового обмена.`;
    } else {
      out.kcal.textContent = "—";
      out.kcalNote.textContent = teen ? "Подросткам не стоит считать калории и садиться на диеты без врача: организм растёт."
        : pregnant ? "Во время беременности потребность в энергии меняется — её подскажет врач."
          : "Укажите пол, возраст, рост и вес.";
    }
    // Белок и вода
    if (kg) {
      out.protein.textContent = `${fmtInt(kg * 1.2)}–${fmtInt(kg * 1.6)} г`;
      out.water.textContent = `${(kg * 0.03).toFixed(1).replace(".", ",")}–${(kg * 0.035).toFixed(1).replace(".", ",")} л`;
    } else {
      out.protein.textContent = "—";
      out.water.textContent = "—";
    }
    // Пульсовые зоны: максимум по формуле Танаки
    if (age) {
      const max = 208 - 0.7 * age;
      out.hrMax.textContent = `${fmtInt(max)} уд/мин`;
      HR_ZONES.forEach((z, i) => { out[`z${i}`].textContent = `${fmtInt(max * z[0])}–${fmtInt(max * z[1])}`; });
    }
    // Одноповторный максимум: среднее по формулам Эпли и Бжицки
    if (calcDraft.lift && calcDraft.reps) {
      const r = calcDraft.reps;
      const one = r === 1 ? calcDraft.lift : (calcDraft.lift * (1 + r / 30) + (calcDraft.lift * 36) / (37 - r)) / 2;
      out.orm.textContent = fmtKg(E.roundWeight(one));
      out.ormNote.textContent = `Рабочий вес на 8–12 повторов — примерно ${fmtNum(E.roundWeight(one * 0.7))}–${fmtKg(E.roundWeight(one * 0.8))}. Проверять максимум на практике не нужно: это опасно без страховки и тренера.`;
    } else {
      out.orm.textContent = "—";
      out.ormNote.textContent = "Укажите вес снаряда и сколько раз подняли его без потери техники (до 12).";
    }
  }

  const ageInput = numInput(calcDraft.age, 12, 100, 1, v => { calcDraft.age = v; });
  const kgInput = numInput(calcDraft.kg, 20, 400, 0.1, v => { calcDraft.kg = v; });
  if (!calcDraft.waist && lastWaist()) calcDraft.waist = lastWaist()[2];
  const waistInput = numInput(calcDraft.waist, 40, 200, 0.5, v => { calcDraft.waist = v; });
  const view = [
    h("h1", { class: "page-title", text: "Калькуляторы" }),
    h("p", { class: "lead", text: "Ориентиры по общепринятым формулам. Это не медицинская рекомендация: при болезнях нормы подбирает врач." }),
    h("section", { class: "card glass" },
      h("h2", { text: "Ваши данные" }),
      h("div", { class: "q" }, h("b", { text: "Пол" }), choice({ className: "seg", label: "Пол", value: p.sex, options: [{ value: "f", label: "Женский" }, { value: "m", label: "Мужской" }], onChange: v => { p.sex = v; persist(); update(); } })),
      h("div", { class: "calc-fields" },
        field("Возраст, лет", ageInput),
        heightField(update),
        field("Вес, кг", kgInput),
        field("Талия, см", waistInput)),
      h("div", { class: "btn-row" },
        h("button", {
          class: "btn small ghost", type: "button",
          onClick: () => {
            if (!calcDraft.kg) { toast("Сначала укажите вес"); return; }
            const d = E.dayKey();
            state.bodyWeight = state.bodyWeight.filter(x => x[0] !== d).concat([[d, Math.round(calcDraft.kg * 10) / 10]]).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-500);
            persist();
            toast("Вес записан в дневник");
          }
        }, icon("scale", 16), "Записать вес в дневник"))),
    h("section", { class: "card glass" },
      h("h2", { text: "Обхват талии" }),
      result("waist", "см"), note("waistNote"),
      h("p", { class: "muted small", text: "Жир на животе опаснее для сердца и обмена веществ, чем вес сам по себе. Измеряйте на выдохе, посередине между нижним ребром и тазовой костью." })),
    h("section", { class: "card glass" },
      h("h2", { text: "Индекс массы тела" }),
      result("bmi", "кг/м²"), note("bmiNote")),
    h("section", { class: "card glass" },
      h("h2", { text: "Калории в день" }),
      h("div", { class: "q" }, h("b", { text: "Активность" }),
        choice({ label: "Активность", value: calcDraft.act, options: [[1.2, "Почти без движения"], [1.375, "1–3 тренировки в неделю"], [1.55, "3–5 тренировок"], [1.725, "6–7 тренировок"]].map(([v, l]) => ({ value: v, label: l })), onChange: v => { calcDraft.act = v; update(); } })),
      result("kcal", "по формуле Миффлина — Сан Жеора"), note("kcalNote")),
    h("section", { class: "card glass" },
      h("h2", { text: "Белок и вода" }),
      h("div", { class: "calc-pair" }, result("protein", "белка в день, если вы тренируетесь"), result("water", "жидкости в день, включая чай и суп")),
      h("p", { class: "muted small", text: "Белок: 1,2–1,6 г на кг веса для тех, кто тренируется (минимум для всех — 0,8 г/кг). Вода: 30–35 мл на кг, в жару и на тренировках — больше. При болезнях почек и сердца нормы определяет врач." })),
    h("section", { class: "card glass" },
      h("h2", { text: "Пульсовые зоны" }),
      heart ? h("div", { class: "note-box small", text: "При болезнях сердца и повышенном давлении пульс на тренировке подбирает врач: таблетки от давления меняют частоту пульса." }) : null,
      result("hrMax", "максимальный пульс (208 − 0,7 × возраст)"),
      h("div", { class: "list hr-zones" }, HR_ZONES.map((z, i) => h("div", { class: "row" },
        h("span", { class: `hr-dot hr-${i + 1}`, "aria-hidden": "true" }),
        h("span", { class: "row-text" }, h("b", { text: z[2] }), h("span", { class: "muted small", text: `${Math.round(z[0] * 100)}–${Math.round(z[1] * 100)}% · ${z[3]}` })),
        val(`z${i}`)))),
      h("p", { class: "muted small", text: "Для здоровья сердца большую часть времени тренируйтесь во 2-й и 3-й зоне: дыхание учащённое, но можно говорить." })),
    h("section", { class: "card glass" },
      h("h2", { text: "Максимум на 1 повтор (1ПМ)" }),
      teen ? h("div", { class: "note-box small", text: "До 18 лет тяжёлые веса не рекомендуются — занимайтесь с тренером." }) : null,
      h("div", { class: "calc-fields" },
        field("Вес снаряда, кг", numInput(calcDraft.lift, 1, 500, 0.5, v => { calcDraft.lift = v; })),
        field("Повторов", numInput(calcDraft.reps, 1, 12, 1, v => { calcDraft.reps = Math.round(v); }))),
      result("orm", "расчётный максимум"), note("ormNote"))
  ];
  update();
  return view;
}
const HR_ZONES = [
  [0.5, 0.6, "Зона 1 — восстановление", "разминка, заминка, прогулка"],
  [0.6, 0.7, "Зона 2 — лёгкая аэробная", "выносливость, жиросжигание"],
  [0.7, 0.8, "Зона 3 — аэробная", "тренирует сердце, говорить можно фразами"],
  [0.8, 0.9, "Зона 4 — пороговая", "тяжело говорить, короткие отрезки"],
  [0.9, 1, "Зона 5 — максимум", "рывки до минуты, только здоровым"]
];

// ===== Отчёт для врача =====
let reportDays = 30;
const fmtFull = d => fmtDate(d, { day: "numeric", month: "long", year: "numeric" }).replace(/\s*г\.$/, "");
const nameIn = (list, id) => (list.find(x => x.id === id) || { name: id }).name;
const avg = list => Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10;
function reportData(from, today) {
  const p = state.profile;
  const lastW = state.bodyWeight[state.bodyWeight.length - 1];
  const conds = p.conditions.map(id => nameIn(CONDITIONS, id).toLowerCase());
  const general = [
    p.name ? `Имя: ${p.name}` : null,
    `Возраст: ${nameIn(AGE_GROUPS, p.ageGroup)}`,
    p.sex ? `Пол: ${p.sex === "f" ? "женский" : "мужской"}` : null,
    p.height ? `Рост: ${p.height} см` : null,
    lastW ? `Вес: ${fmtNum(lastW[1])} кг (${fmtFull(lastW[0])})` : null,
    lastWaist() ? `Обхват талии: ${fmtNum(lastWaist()[2])} см (${fmtFull(lastWaist()[0])})` : null,
    `Особенности здоровья, отмеченные в приложении: ${conds.length ? conds.join(", ") : "нет"}`
  ].filter(Boolean);
  const flags = new Set();
  const zones = [];
  for (const reg of REGIONS) {
    const b = state.body[reg.id];
    if (!b) continue;
    const sev = E.regionSeverity(state, reg.id, today, false);
    if (!sev && !b.note && !b.symptoms.length) continue;
    const parts = [`${reg.name}${b.sides.length ? ` (${b.sides.map(x => SIDE_WORD[x]).join(" и ")})` : ""} — ${SEVERITY[sev].name.toLowerCase()}`];
    if (!b.sev && b.temp && b.temp.until >= today) parts.push(`болело во время тренировки, зона под защитой до ${fmtFull(b.temp.until)}`);
    if (b.since) parts.push(`с ${fmtFull(b.since)}`);
    if (b.onset) parts.push(`давность: ${nameIn(ONSET, b.onset).toLowerCase()}`);
    if (b.symptoms.length) parts.push(`симптомы: ${b.symptoms.map(x => nameIn(SYMPTOMS, x).toLowerCase()).join(", ")}`);
    if (b.triggers.length) parts.push(`усиливается: ${b.triggers.map(x => nameIn(TRIGGERS, x).toLowerCase()).join(", ")}`);
    if (b.note) parts.push(`заметка: «${b.note}»`);
    b.symptoms.forEach(x => { if ((SYMPTOMS.find(y => y.id === x) || {}).flag) flags.add(`${nameIn(SYMPTOMS, x).toLowerCase()} (${reg.name.toLowerCase()})`); });
    zones.push(parts.join("; "));
  }
  const marks = state.marks.map(m => {
    m.symptoms.forEach(x => { if ((SYMPTOMS.find(y => y.id === x) || {}).flag) flags.add(`${nameIn(SYMPTOMS, x).toLowerCase()} (${markLabel(m).toLowerCase()})`); });
    return [
      `${m.d ? `${fmtFull(m.d)}: ` : ""}${m.regions.map(x => zoneName(x.id, x.side)).join(", ")}`,
      m.pain ? `боль ${m.pain} из 10` : "",
      m.symptoms.length ? `симптомы: ${m.symptoms.map(x => nameIn(SYMPTOMS, x).toLowerCase()).join(", ")}` : "",
      m.onset ? `давность: ${nameIn(ONSET, m.onset).toLowerCase()}` : "",
      m.triggers.length ? `усиливается: ${m.triggers.map(x => nameIn(TRIGGERS, x).toLowerCase()).join(", ")}` : "",
      m.note ? `заметка: «${m.note}»` : ""
    ].filter(Boolean).join("; ");
  });
  const pain = [];
  for (const id of new Set(state.painLog.filter(x => x.d >= from && x.d <= today).map(x => x.region))) {
    const pts = state.painLog.filter(x => x.region === id && x.d >= from && x.d <= today);
    const first = pts[0], last = pts[pts.length - 1];
    pain.push(`${REGION[id].name}: ${pts.length} ${E.plural(pts.length, "запись", "записи", "записей")}; ` +
      `${fmtDate(first.d)} — ${first.level}/10, ${fmtDate(last.d)} — ${last.level}/10; максимум ${Math.max(...pts.map(x => x.level))}/10, в среднем ${fmtNum(avg(pts.map(x => x.level)))}/10` +
      (pts.length > 2 ? `; по дням: ${pts.slice(-20).map(x => x.level).join(" → ")}` : ""));
  }
  const sess = state.sessions.filter(x => x.d >= from && x.d <= today);
  const signals = sess.flatMap(x => x.pains.map(pp => `${fmtFull(x.d)}: ${REGION[pp.region].name.toLowerCase()} — во время упражнения «${EX[pp.ex] ? EX[pp.ex].name : "—"}»`));
  const workouts = sess.filter(x => x.goal !== "activity");
  const mins = sess.reduce((a, x) => a + x.mins, 0);
  const rpes = workouts.filter(x => x.rpe).map(x => x.rpe);
  const cis = state.checkins.filter(c => c.d >= from && c.d <= today);
  // Среднее за неделю считаем с первого занятия, если приложением пользуются меньше, чем длится период
  const first = state.sessions.reduce((a, x) => (x.d < a ? x.d : a), today);
  const start = first > from ? first : from;
  const span = Math.max(7, Math.round((new Date(`${today}T12:00:00`) - new Date(`${start}T12:00:00`)) / 864e5) + 1);
  const load = [
    `Тренировок: ${workouts.length}; прогулок и другой активности: ${sess.length - workouts.length}`,
    `Минут активности: ${mins}, в среднем ${Math.round((mins / span) * 7)} мин в неделю${start > from ? ` (с ${fmtFull(start)})` : ""} — норма ВОЗ для взрослых 150–300`,
    rpes.length ? `Тяжесть тренировок по ощущениям: в среднем ${fmtNum(avg(rpes))} из 10` : null,
    sess.some(x => x.km) ? `Пройдено и пробежано с GPS: ${fmtNum(Math.round(sess.reduce((a, x) => a + (x.km || 0), 0) * 10) / 10)} км` : null,
    state.run ? `Программа «Бег с нуля»: пройдено ${state.run.done.length} из ${RUN_DAYS} занятий` : null,
    sess.some(x => x.after === "worse") ? `На следующий день после тренировки боль усиливалась ${sess.filter(x => x.after === "worse").length} раз(а)` : null,
    cis.length ? `Самочувствие: ${cis.length} ${E.plural(cis.length, "отметка", "отметки", "отметок")}, средняя готовность ${Math.round(avg(cis.map(c => c.score)))} из 100` : null,
    ...PROGRAMS.filter(pr => own(state.programs, pr.id)).map(pr => `Программа «${pr.name}»: пройдено ${state.programs[pr.id].done.length} из ${pr.days} занятий`)
  ].filter(Boolean);
  return {
    meta: `Период: ${fmtFull(from)} — ${fmtFull(today)} (${reportDays} дней). Составлен ${fmtFull(today)}.`,
    sections: [
      { title: "Общие сведения", lines: general },
      flags.size ? { title: "Обратить внимание", lines: [`Отмечены симптомы, при которых нужен осмотр: ${[...flags].join(", ")}`] } : null,
      { title: "Отмеченные зоны", lines: zones, empty: "Зоны не отмечены." },
      marks.length ? { title: "Обведённые на модели области", lines: marks } : null,
      { title: "Дневник боли (0 — нет боли, 10 — нестерпимая)", lines: pain, empty: "За период записей нет." },
      { title: "Боль во время тренировок", lines: signals.slice(-30), empty: "За период сигналов боли не было." },
      { title: "Физическая активность", lines: load }
    ].filter(Boolean)
  };
}
const REPORT_NOTE = "Составлено в приложении «Листопульс» по отметкам пользователя. Это не медицинский документ и не диагноз.";
function reportText(data) {
  return [`ОТЧЁТ ДЛЯ ВРАЧА`, data.meta, "",
    ...data.sections.flatMap(sec => [sec.title.toUpperCase(), ...(sec.lines.length ? sec.lines.map(l => `— ${l}`) : [sec.empty]), ""]),
    REPORT_NOTE].join("\r\n");
}
function viewReport() {
  const today = E.dayKey();
  const from = E.shiftDay(today, -(reportDays - 1));
  const data = reportData(from, today);
  return [
    h("a", { class: "back-link no-print", href: "#more" }, icon("back", 18), "Ещё"),
    h("h1", { class: "page-title", text: "Отчёт для врача" }),
    h("p", { class: "lead no-print", text: "Сводка по вашим отметкам: зоны, боль, нагрузка. Распечатайте, сохраните в PDF или покажите с экрана на приёме." }),
    h("div", { class: "no-print report-tools" },
      choice({ className: "seg", label: "Период отчёта", value: reportDays, options: [14, 30, 90].map(n => ({ value: n, label: `${n} дней` })), onChange: v => { reportDays = v; refresh(); } }),
      h("div", { class: "btn-row" },
        h("button", { class: "btn primary", type: "button", onClick: () => window.print() }, icon("print", 18), "Печать или PDF"),
        h("button", { class: "btn ghost", type: "button", onClick: () => download(`listopuls-otchet-${today}.txt`, reportText(data), "text/plain;charset=utf-8") }, icon("download", 18), "Скачать текстом")),
      h("p", { class: "muted small", text: "В отчёте есть сведения о здоровье — передавайте его только врачу." })),
    h("article", { class: "card glass report" },
      h("p", { class: "report-meta", text: data.meta }),
      data.sections.map(sec => [
        h("h2", { text: sec.title }),
        sec.lines.length ? h("ul", { class: "bullets" }, sec.lines.map(l => h("li", { text: l }))) : h("p", { class: "muted", text: sec.empty })
      ]),
      h("p", { class: "muted small report-note", text: REPORT_NOTE }))
  ];
}

// ===== Рабочие веса =====
function weightSpark(hist) {
  const vals = hist.map(x => x[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const pts = vals.map((v, i) => [4 + (i * 92) / Math.max(1, vals.length - 1), 26 - ((v - lo) / span) * 22]);
  const last = pts[pts.length - 1];
  return s("svg", { class: "mini-spark up", viewBox: "0 0 100 30", preserveAspectRatio: "none", "aria-hidden": "true" },
    s("polyline", { points: pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") }),
    s("circle", { cx: last[0].toFixed(1), cy: last[1].toFixed(1), r: 2.6 }));
}
function subWeights() {
  return [
    h("h1", { class: "page-title", text: "Рабочие веса" }),
    h("p", { class: "lead", text: "Листопульс запоминает вес, с которым вы делали упражнения, и подсказывает его в следующий раз." }),
    ...weightsBlocks()
  ];
}
function weightsBlocks() {
  const entries = Object.entries(state.weights).filter(([id]) => own(EX, id)).sort((a, b) => (a[1].d < b[1].d ? 1 : a[1].d > b[1].d ? -1 : 0));
  return [
    entries.length
      ? h("section", { class: "card glass" }, h("div", { class: "list" }, entries.map(([id, w]) => {
        const first = w.hist.length ? w.hist[0][1] : w.kg;
        const grow = first ? Math.round(((w.best - first) / first) * 100) : 0;
        const last = w.last && w.last.length ? ` · ${w.last.map(([kg, r]) => `${fmtNum(kg)}×${r}`).join(", ")}` : "";
        return h("button", { class: "row row-btn", type: "button", onClick: () => exerciseSheet(id) },
          h("span", { class: "row-text" },
            h("b", { text: `${w.prD && w.prD >= E.shiftDay(E.dayKey(), -13) ? "🥇 " : ""}${EX[id].name}` }),
            h("span", { class: "muted small", text: `${fmtKg(w.kg)}${w.d ? ` · ${fmtDate(w.d)}` : ""}${last}${grow > 0 ? ` · +${grow}% с начала` : ""}` }),
            w.e1rm ? h("span", { class: "muted small", text: `Расчётный максимум на 1 повтор ≈ ${fmtKg(w.e1rm)}${w.prD ? ` · рекорд ${fmtDate(w.prD)}` : ""}` }) : null,
            // График и лучший вес — под текстом: на узком экране название не ломается на три строки
            h("span", { class: "spark-row" }, w.hist.length > 1 ? weightSpark(w.hist) : null, h("span", { class: "pill", text: `лучший ${fmtKg(w.best)}` }))),
          icon("chevron", 16));
      })))
      : h("section", { class: "card glass" }, h("p", { class: "muted", text: "Пока пусто. В плеере у упражнений с гантелями, гирей или штангой укажите вес и число повторов — подходы сохранятся вместе с тренировкой, а тренер подскажет, когда прибавить вес." })),
    h("section", { class: "card glass" },
      h("h2", { text: "Как прибавлять вес" }),
      h("ul", { class: "bullets" },
        h("li", { text: "Работайте в диапазоне повторов, например 8–12. Сначала добавляйте повторы." }),
        h("li", { text: "Когда во всех подходах легко выходит верхняя граница — прибавьте 2,5–5% веса и вернитесь к нижней. Плеер сам подскажет, когда пора." }),
        h("li", { text: "Расчётный максимум на 1 повтор (1ПМ) считается по формуле Эпли — проверять его на практике не нужно, это опасно без страховки." }),
        h("li", { text: "Техника важнее килограммов: если движение «поплыло», вес великоват." }),
        h("li", { text: "Боль в суставе — не повод терпеть. Нажмите «Больно» в плеере, и тренер заменит упражнение." })),
      h("p", {}, h("a", { href: "#guide/weights-start", text: "Статья: как безопасно начать с весами →" }))),
    entries.length ? h("p", { class: "center" }, h("button", {
      class: "link-btn small", type: "button", text: "Очистить журнал весов",
      onClick: async () => {
        const ok = await confirmSheet({ title: "Очистить журнал весов?", message: "Записанные веса по всем упражнениям удалятся. Тренировки в дневнике останутся.", ok: "Очистить", danger: true });
        if (!ok) return;
        state.weights = {};
        persist();
        refresh();
        toast("Журнал весов очищен");
      }
    })) : null
  ];
}

// ===== Справочник травм =====
const guideFilter = { q: "", area: "all" };
function viewGuide(sub) {
  if (sub && own(GUIDE_BY_ID, sub)) return guideArticle(GUIDE_BY_ID[sub]);
  const mine = guideFor(trackedRegions());
  const list = h("div", { class: "guide-list" });
  const fill = () => {
    const q = guideFilter.q.trim().toLowerCase();
    const items = GUIDE.filter(a => (guideFilter.area === "all" || a.area === guideFilter.area) &&
      (!q || `${a.title} ${a.short}`.toLowerCase().includes(q) || a.regions.some(id => own(REGION, id) && REGION[id].name.toLowerCase().includes(q))));
    list.replaceChildren(...(items.length
      ? GUIDE_AREAS.filter(ar => items.some(a => a.area === ar.id)).map(ar => h("section", { class: "card glass" },
        h("h2", { text: ar.name }),
        h("div", { class: "list" }, items.filter(a => a.area === ar.id).map(a => guideRow(a)))))
      : [h("section", { class: "card glass" }, h("p", { class: "muted", text: "Ничего не нашлось. Попробуйте другое слово, например «колено» или «спина»." }))]));
  };
  const search = h("input", { class: "input", type: "search", placeholder: "Поиск: колено, растяжение, спина…", "aria-label": "Поиск по справочнику", maxlength: 60 });
  search.value = guideFilter.q;
  search.addEventListener("input", () => { guideFilter.q = search.value; fill(); });
  fill();
  return [
    h("h1", { class: "page-title", text: "Тело" }),
    bodyTabs("guide"),
    h("h2", { class: "section-title", text: "Справочник травм" }),
    h("p", { class: "lead", text: "Что делать при частых травмах и боли: первая помощь, тревожные признаки, когда идти к врачу и как безопасно вернуться к нагрузке." }),
    h("section", { class: "card glass warn" },
      h("p", { class: "small" }, h("b", { text: "Это не замена врачу. " }),
        "Статьи пересказывают открытые рекомендации медицинских организаций (NHS, NICE) и консенсусы спортивных врачей — источники указаны в каждой статье. Диагноз и лечение назначает только врач после осмотра.")),
    mine.length ? h("section", { class: "card glass" },
      h("p", { class: "eyebrow", text: "Для ваших зон" }),
      h("div", { class: "list" }, mine.slice(0, 5).map(a => guideRow(a)))) : null,
    h("section", { class: "card glass" },
      search,
      h("div", { style: { marginTop: "12px" } }, choice({
        label: "Раздел", value: guideFilter.area,
        options: [{ value: "all", label: "Все" }, ...GUIDE_AREAS.map(a => ({ value: a.id, label: a.name }))],
        onChange: v => { guideFilter.area = v; fill(); }
      })),
      h("p", { class: "muted small", style: { marginTop: "10px" }, text: `Прочитано ${state.guideRead.length} из ${GUIDE.length}` })),
    list
  ];
}

function markGuideRead(id) {
  if (!state || state.guideRead.includes(id)) return;
  state.guideRead = state.guideRead.concat(id).slice(-100);
  const nb = E.newBadges(state);
  persist();
  if (nb.length) toast(badgeToast(nb));
}

function guideArticle(a) {
  const area = GUIDE_AREAS.find(x => x.id === a.area);
  const r = E.restrictions(state);
  const marked = a.regions.filter(id => r.regionSev[id]);
  const exs = a.exercises.filter(id => own(EX, id)).map(id => EX[id]);
  const prog = a.program ? PROGRAMS.find(p => p.id === a.program) : null;
  postRender.push(() => markGuideRead(a.id));
  return [
    h("a", { class: "back-link", href: "#guide" }, icon("back", 18), "Справочник"),
    h("p", { class: "eyebrow", text: area ? area.name : "Справочник" }),
    h("h1", { class: "page-title", text: a.title }),
    h("p", { class: "lead", text: a.short }),
    marked.length ? h("div", { class: "note-box ok", style: { margin: "0 0 14px" } },
      `Вы отметили: ${marked.map(id => REGION[id].name.toLowerCase()).join(", ")}. Тренер уже учитывает это в тренировках.`) : null,
    a.sections.map(sec => h("section", { class: `card glass${sec.alert ? " alert" : ""}` },
      h("h2", { text: sec.h }),
      (sec.p || []).map(t => h("p", { text: t })),
      sec.list ? h("ul", { class: "bullets" }, sec.list.map(t => h("li", { text: t }))) : null)),
    exs.length ? guideExercises(a, exs, r) : null,
    prog ? h("a", { class: "quick-item glass", href: `#program/${prog.id}`, style: { marginBottom: "14px" } },
      h("span", { class: "fi emoji", "aria-hidden": "true", text: prog.icon }),
      h("span", { class: "row-text" },
        h("b", { text: `Программа «${prog.name}»` }),
        h("span", { class: "muted small", text: `${prog.days} ${E.plural(prog.days, "день", "дня", "дней")} · ${prog.desc}` })),
      icon("chevron", 18)) : null,
    h("section", { class: "card glass" },
      h("h2", { text: "Источники" }),
      h("ul", { class: "bullets small sources" }, a.sources.map(([title, url]) => h("li", {}, h("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: title })))),
      h("p", { class: "muted small", text: "Тексты написаны своими словами по открытым материалам. Это общие сведения, а не консультация: при травме обратитесь к врачу." }))
  ];
}

function guideExercises(a, exs, r) {
  return h("section", { class: "card glass" },
    h("h2", { text: "Упражнения для восстановления" }),
    h("p", { class: "muted small", text: "Начинайте, когда острая боль прошла и врач не запретил нагрузку. Двигайтесь в пределах лёгкого дискомфорта, без резкой боли." }),
    exs.map(ex => {
      const ok = E.fits(ex, r, state.profile);
      return h("div", { class: "ex-row" },
        h("div", { class: "row-text" }, h("b", { text: ex.name }), h("span", { class: "muted small", text: E.doseText(E.makeItem(ex, 1)) })),
        h("span", { class: `pill${ok ? "" : " muted-pill"}`, text: ok ? "подходит" : "не сейчас" }),
        h("button", { class: "icon-btn", type: "button", "aria-label": `Подробнее: ${ex.name}`, onClick: () => exerciseSheet(ex.id) }, icon("info", 20)));
    }),
    h("p", { class: "muted small", style: { marginTop: "10px" }, text: "Неподходящие сейчас упражнения тренер заменит безопасными или пропустит." }),
    h("div", { class: "btn-row" },
      h("button", {
        class: "btn primary", type: "button",
        onClick: () => startPlayer(E.buildCustom(state, { title: `Справочник: ${a.title}`, ids: exs.map(ex => ex.id), k: 0.9, kind: "guide", goal: "custom", rest: 10 }))
      }, icon("play", 18), "Начать комплекс")));
}

// ===== Программы восстановления =====
function programCard(p) {
  const pr = E.programProgress(state, p.id);
  const missing = (p.equip || []).filter(e => !state.profile.equipment.includes(e));
  return h("a", { class: "quick-item glass", href: `#program/${p.id}` },
    h("span", { class: "fi emoji", "aria-hidden": "true", text: p.icon }),
    h("span", { class: "row-text" },
      h("b", { text: p.name }),
      h("span", { class: "muted small", text: pr.finished ? "Пройдена 🎉" : pr.started ? `Занятие ${pr.next} из ${p.days}` : `${p.days} ${E.plural(p.days, "занятие", "занятия", "занятий")} · ${p.desc}` }),
      missing.length ? h("span", { class: "need", text: `Нужно: ${missing.map(e => equipName(e).toLowerCase()).join(", ")}` }) : null,
      pr.started ? h("span", { class: "progress slim", "aria-hidden": "true" }, h("i", { style: { width: `${Math.round((pr.done / p.days) * 100)}%` } })) : null),
    icon("chevron", 18));
}
function programsSection() {
  return [
    h("p", { class: "lead", text: "Курсы по шагам: каждое занятие немного сложнее предыдущего. Упражнения подстраиваются под ваши зоны и инвентарь." }),
    h("h2", { class: "section-title", text: "Восстановление" }),
    h("div", { class: "quick" }, PROGRAMS.filter(p => p.kind !== "strength").map(programCard)),
    h("h2", { class: "section-title", text: "Сила" }),
    h("div", { class: "quick" }, PROGRAMS.filter(p => p.kind === "strength").map(programCard)),
    h("h2", { class: "section-title", text: "Выносливость" }),
    h("div", { class: "quick" }, runCard()),
    h("p", { class: "center", style: { marginTop: "18px" } }, h("a", { href: "#workout/challenges", text: "Челленджи на 30 дней →" }))
  ];
}

// ===== Бег с нуля =====
const fmtDur = sec => (sec % 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} мин` : `${sec / 60} мин`);
function runPlanText(s) {
  if (!s.walk) return `бег ${s.run / 60} минут без остановки`;
  return `${s.reps} × (бег ${fmtDur(s.run)} + ходьба ${fmtDur(s.walk)})`;
}
const runTotalMin = s => Math.round((600 + s.run * s.reps + s.walk * Math.max(0, s.reps - 1)) / 60);
function runCard() {
  const rs = E.runState(state);
  return h("a", { class: "quick-item glass", href: "#run" },
    h("span", { class: "fi emoji", "aria-hidden": "true", text: "👟" }),
    h("span", { class: "row-text" },
      h("b", { text: "Бег с нуля: 9 недель" }),
      h("span", { class: "muted small", text: rs.finished ? "Пройдена 🏅" : rs.started ? `Занятие ${rs.next} из ${RUN_DAYS} · ${runPlanText(rs.session)}` : "От минуты бега до 30 минут без остановки, 3 раза в неделю" }),
      rs.started ? h("span", { class: "progress slim", "aria-hidden": "true" }, h("i", { style: { width: `${Math.round((rs.done / RUN_DAYS) * 100)}%` } })) : null),
    icon("chevron", 18));
}
function startRun(n, repeat = false) {
  const rs = E.runState(state);
  const { session, steps } = E.buildRunDay(state, n, rs.walkOnly);
  session.repeat = repeat;
  startPlayer(session, steps);
}
function viewRun() {
  const back = h("a", { class: "back-link", href: "#workout/programs" }, icon("back", 18), "Программы");
  const rs = E.runState(state);
  const done = new Set(rs.started ? state.run.done : []);
  const s = rs.session;
  const reset = async () => {
    const ok = await confirmSheet({ title: "Начать программу заново?", message: "Отметки о пройденных занятиях сбросятся. Пробежки в дневнике останутся.", ok: "Сбросить" });
    if (!ok) return;
    state.run = null;
    persist();
    refresh();
    toast("Прогресс программы сброшен");
  };
  let main;
  if (rs.blocked) {
    main = h("section", { class: "card glass warn" },
      h("h2", { text: "Сейчас программа на паузе" }),
      h("p", { text: "При беременности и после недавней операции бег начинают только после разрешения врача. Спокойные прогулки обычно можно — уточните у врача." }));
  } else if (rs.finished) {
    main = h("section", { class: "card glass" },
      h("h2", { text: "30 минут бега без остановки! 🏅" }),
      h("p", { text: "Программа пройдена. Дальше — 2–3 пробежки в неделю в разговорном темпе или забег на 5 км." }),
      h("div", { class: "btn-row" }, h("button", { class: "btn primary", type: "button", text: "Пройти заново", onClick: reset })));
  } else {
    main = h("section", { class: "card glass" },
      h("div", { class: "card-head" },
        h("h2", { text: `Занятие ${rs.next} · неделя ${s.week}` }),
        h("span", { class: "pill", text: `≈ ${runTotalMin(s)} мин` })),
      h("p", { text: `Разминка: 5 минут бодрой ходьбы. Затем ${runPlanText(s)}. Заминка: 5 минут спокойной ходьбы.` }),
      rs.walkOnly ? h("div", { class: "note-box", text: `Сейчас вместо бега — быстрая ходьба по той же схеме: ${rs.why}. Когда ограничение снимут, вернётесь к бегу.` }) : null,
      rs.doneToday ? h("p", { class: "note-box", text: "Сегодня занятие уже было. Следующее — через день: суставам и связкам нужен отдых." })
        : rs.yesterday ? h("p", { class: "note-box", text: "Вчера была пробежка. Лучше отдохнуть сегодня — между занятиями нужен день отдыха. Можно спокойно погулять." }) : null,
      h("div", { class: "btn-row" },
        h("button", { class: "btn primary", type: "button", onClick: () => startRun(rs.next) }, icon("play", 18), `Начать занятие ${rs.next}`),
        rs.next > 1 ? h("button", { class: "btn ghost", type: "button", text: `Повторить занятие ${rs.next - 1}`, onClick: () => startRun(rs.next - 1, true) }) : null));
  }
  return [
    back,
    h("p", { class: "eyebrow", text: "Программа на 9 недель" }),
    h("h1", { class: "page-title", text: "👟 Бег с нуля" }),
    h("p", { class: "lead", text: "От минуты бега до 30 минут без остановки. Три занятия в неделю с днём отдыха между ними: бег чередуется с ходьбой, бег постепенно удлиняется." }),
    h("section", { class: "card glass" },
      h("div", { class: "card-head" },
        h("h2", { text: rs.finished ? "Пройдено! 🏅" : rs.started ? `Выполнено ${rs.done} из ${RUN_DAYS}` : `${RUN_DAYS} занятий` }),
        h("span", { class: "pill", text: `${rs.done} / ${RUN_DAYS}` })),
      h("div", { class: "day-dots run-dots", role: "img", "aria-label": `Выполнено ${rs.done} из ${RUN_DAYS} занятий` },
        Array.from({ length: RUN_DAYS }, (_, i) => h("i", { class: done.has(i + 1) ? "done" : !rs.finished && i + 1 === rs.next ? "next" : "", text: String(i + 1) }))),
      h("p", { class: "muted small", text: "Каждая неделя — 3 занятия. Тяжело? Повторите занятие или всю неделю: это нормально и даже полезно." })),
    main,
    h("section", { class: "card glass" },
      h("h2", { text: "Как бегать безопасно" }),
      h("ul", { class: "bullets small" },
        h("li", { text: "Темп — разговорный: можно говорить фразами. Задыхаетесь — замедлитесь или перейдите на шаг." }),
        h("li", { text: "Удобная беговая обувь и ровная мягкая поверхность снижают нагрузку на суставы." }),
        h("li", { text: "Усталость в мышцах — нормально. Боль в колене, голени, стопе или ахилле — повод перейти на ходьбу и отметить зону в разделе «Тело»." }),
        h("li", { text: "Боль в груди, сильная одышка, головокружение — сразу остановитесь; при угрозе жизни звоните 112." })),
      h("p", {}, h("a", { href: "#guide/shin-splints", text: "Статья: боль в голени у бегунов →" })),
      rs.started && !rs.finished ? h("button", { class: "link-btn small", type: "button", text: "Сбросить прогресс", onClick: reset }) : null)
  ];
}

// ===== Челленджи =====
function challengeTarget(cs) {
  const { c } = cs;
  if (c.unit === "reps") return `${cs.target} ${E.plural(cs.target, "повтор", "повтора", "повторов")}${Array.isArray(c.ex) ? ` · ${EX[cs.ex].name.toLowerCase()}` : ""}`;
  if (c.unit === "sec") return `${E.fmtSec(cs.target)} в планке`;
  if (c.unit === "walk") return `прогулка ${cs.target} мин`;
  return `${cs.items.length} ${E.plural(cs.items.length, "упражнение", "упражнения", "упражнений")} ${c.what || "растяжки"}`;
}
function challengeLine(cs) {
  if (cs.finished) return "Пройден! 🏆";
  if (cs.doneToday) return `День ${cs.done} выполнен ✓ · следующий — завтра`;
  if (cs.rest) return `День ${cs.day} из 30 · отдых`;
  return `День ${cs.day} из 30 · ${challengeTarget(cs)}`;
}
function challengeCard(c) {
  const cs = E.challengeState(state, c.id);
  return h("a", { class: "quick-item glass", href: `#challenge/${c.id}` },
    h("span", { class: "fi emoji", "aria-hidden": "true", text: c.icon }),
    h("span", { class: "row-text" },
      h("b", { text: c.name }),
      h("span", { class: "muted small", text: cs.started ? challengeLine(cs) : c.desc }),
      cs.started ? h("span", { class: "progress slim", "aria-hidden": "true" }, h("i", { style: { width: `${Math.round((cs.done / 30) * 100)}%` } })) : null),
    icon("chevron", 18));
}
function viewChallenge(id) {
  const c = CHALLENGES.find(x => x.id === id);
  const back = h("a", { class: "back-link", href: "#workout/programs" }, icon("back", 18), "Программы");
  if (!c) return [back, h("h1", { class: "page-title", text: "Челлендж не найден" }), h("p", {}, h("a", { href: "#workout/programs", text: "Все программы и челленджи" }))];
  const cs = E.challengeState(state, id);
  const done = new Set(cs.started ? state.challenges[id].done : []);
  const today = E.dayKey();
  // Засчитать текущий день (отдых, прогулку); тренировочный день засчитывается при сохранении тренировки
  const markDay = extra => {
    const ch = own(state.challenges, id) ? state.challenges[id] : (state.challenges[id] = { start: today, done: [], last: "" });
    if (!ch.done.includes(cs.day)) ch.done = ch.done.concat(cs.day).sort((a, b) => a - b);
    ch.last = today;
    if (extra) extra();
    const nb = E.newBadges(state);
    persist();
    refresh();
    if (ch.done.length >= 30) confetti();
    toast(nb.length ? badgeToast(nb) : ch.done.length >= 30 ? "Челлендж пройден! 🏆" : `День ${cs.day} засчитан`);
  };
  const reset = async () => {
    const ok = await confirmSheet({ title: "Начать челлендж заново?", message: "Отметки о выполненных днях сбросятся. Тренировки в дневнике останутся.", ok: "Сбросить" });
    if (!ok) return;
    delete state.challenges[id];
    persist();
    refresh();
    toast("Прогресс челленджа сброшен");
  };
  let todayCard;
  if (cs.finished) {
    todayCard = h("section", { class: "card glass" },
      h("h2", { text: "30 дней позади! 🏆" }),
      h("p", { text: "Месяц — это уже привычка. Можно пройти челлендж ещё раз или взять другой." }),
      h("div", { class: "btn-row" }, h("button", { class: "btn primary", type: "button", text: "Пройти заново", onClick: reset })));
  } else if (cs.doneToday) {
    todayCard = h("section", { class: "card glass" },
      h("h2", { text: `День ${cs.done} выполнен ✓` }),
      h("p", { class: "muted", text: "Следующий день откроется завтра: мышцы крепнут, пока отдыхают." }));
  } else if (cs.rest) {
    todayCard = h("section", { class: "card glass" },
      h("h2", { text: `День ${cs.day} — отдых 😴` }),
      h("p", { class: "muted", text: "Сегодня без нагрузки: прогуляйтесь или сделайте лёгкую растяжку. Отметьте день — и завтра продолжим." }),
      h("div", { class: "btn-row" }, h("button", { class: "btn primary", type: "button", onClick: () => markDay() }, icon("check", 18), "Отметить день отдыха")));
  } else if (c.unit === "walk") {
    todayCard = h("section", { class: "card glass" },
      h("h2", { text: `День ${cs.day}: прогулка ${cs.target} мин` }),
      h("p", { class: "muted", text: "В своём темпе, можно в 2–3 захода. Телефон брать не обязательно — отметьте, когда вернётесь: минуты попадут в дневник." }),
      h("div", { class: "btn-row" }, h("button", {
        class: "btn primary", type: "button",
        onClick: () => markDay(() => {
          state.sessions.push({ id: newId(), d: today, hour: new Date().getHours(), mins: cs.target, title: `${c.name} · день ${cs.day}`, goal: "activity", mode: "normal", rpe: 0, count: 0, pains: [] });
          if (state.sessions.length > 1000) state.sessions.splice(0, state.sessions.length - 1000);
        })
      }, icon("check", 18), "Прогулка сделана")));
  } else {
    const s = E.buildChallengeDay(state, id);
    const items = s.blocked ? [] : s.blocks.flatMap(b => b.items);
    const rounds = s.blocks.length ? s.blocks[0].rounds : 1;
    todayCard = s.blocked
      ? h("section", { class: "card glass warn" }, h("h2", { text: "Сейчас челлендж на паузе" }), h("ul", { class: "adapt" }, s.notes.map(n => h("li", { class: "note", text: n }))))
      : h("section", { class: "card glass" },
        h("h2", { text: `День ${cs.day} из 30` }),
        h("p", { class: "muted small", text: `Цель: ${challengeTarget(cs)}${rounds > 1 && items[0] ? ` — ${rounds} ${E.plural(rounds, "подход", "подхода", "подходов")} по ${E.doseText(items[0])}, отдых ${s.rest} сек` : ""}` }),
        exRows(items),
        s.adaptations.length ? h("ul", { class: "adapt", style: { marginTop: "12px" } }, s.adaptations.map(x => h("li", { text: x }))) : null,
        h("div", { class: "btn-row" },
          h("button", { class: "btn primary", type: "button", disabled: !items.length, onClick: () => startPlayer(s) }, icon("play", 18), `Начать день ${cs.day}`)));
  }
  return [
    back,
    h("p", { class: "eyebrow", text: "Челлендж на 30 дней" }),
    h("h1", { class: "page-title", text: `${c.icon} ${c.name}` }),
    h("p", { class: "lead", text: c.desc }),
    h("section", { class: "card glass" },
      h("div", { class: "card-head" },
        h("h2", { text: cs.finished ? "Пройдено! 🏆" : cs.started ? `Выполнено ${cs.done} из 30` : "30 дней" }),
        h("span", { class: "pill", text: `${cs.done} / 30` })),
      h("div", { class: "day-dots", role: "img", "aria-label": `Выполнено ${cs.done} из 30 дней` },
        Array.from({ length: 30 }, (_, i) => {
          const n = i + 1;
          const cls = [done.has(n) ? "done" : "", !cs.finished && !cs.doneToday && n === cs.day ? "next" : "", c.rest && n % c.rest === 0 ? "rest" : ""].filter(Boolean).join(" ");
          return h("i", { class: cls, text: String(n) });
        })),
      c.rest ? h("p", { class: "muted small", text: `Каждый ${c.rest}-й день — отдых (обведён пунктиром).` }) : null),
    todayCard,
    h("section", { class: "card glass" },
      h("ul", { class: "bullets small" },
        h("li", { text: "Не получается всё сразу — сделайте сколько можете и сохраните тренировку: день засчитается." }),
        h("li", { text: "Боль в суставе — повод остановиться: нажмите «Больно», и тренер заменит упражнение." }),
        h("li", { text: "Если вы восстанавливаетесь после травмы, сначала пройдите программу восстановления." })),
      cs.started && !cs.finished ? h("button", { class: "link-btn small", type: "button", text: "Сбросить прогресс", onClick: reset }) : null)
  ];
}

function viewProgram(id) {
  const prog = PROGRAMS.find(p => p.id === id);
  const back = h("a", { class: "back-link", href: "#workout/programs" }, icon("back", 18), "Программы");
  if (!prog) return [back, h("h1", { class: "page-title", text: "Программа не найдена" }), h("p", {}, h("a", { href: "#workout", text: "Вернуться к тренировкам" }))];
  const pr = E.programProgress(state, id);
  const done = new Set(pr.started ? state.programs[id].done : []);
  const today = E.dayKey();
  const doneToday = state.sessions.some(x => x.d === today && x.title.startsWith(prog.name));
  const missing = (prog.equip || []).filter(e => !state.profile.equipment.includes(e));
  const session = pr.finished ? null : E.buildProgramDay(state, id);
  const guide = prog.guide && own(GUIDE_BY_ID, prog.guide) ? GUIDE_BY_ID[prog.guide] : null;
  let from = 1;
  const stages = prog.phases.map((ph, i) => {
    const days = from === ph.until ? `день ${from}` : `дни ${from}–${ph.until}`;
    const load = ph.k < 1 ? ", облегчённая дозировка" : ph.k > 1 ? ", нагрузка выше" : "";
    from = ph.until + 1;
    return h("li", { text: `Этап ${i + 1}, ${days}: ${ph.items.length} ${E.plural(ph.items.length, "упражнение", "упражнения", "упражнений")}${load}` });
  });
  const reset = async () => {
    const ok = await confirmSheet({ title: "Начать программу заново?", message: "Отметки о пройденных днях сбросятся. Тренировки в дневнике останутся.", ok: "Сбросить" });
    if (!ok) return;
    delete state.programs[id];
    persist();
    refresh();
    toast("Прогресс программы сброшен");
  };
  const out = [
    back,
    h("p", { class: "eyebrow", text: prog.kind === "strength" ? "Силовая программа" : "Программа восстановления" }),
    h("h1", { class: "page-title", text: `${prog.icon} ${prog.name}` }),
    h("p", { class: "lead", text: prog.desc }),
    missing.length ? h("div", { class: "note-box", style: { marginBottom: "14px" } },
      h("p", { class: "small" }, `Нужно: ${missing.map(e => equipName(e).toLowerCase()).join(", ")}. Без этого упражнения заменятся похожими — или `,
        h("a", { href: "#more/profile", text: "отметьте инвентарь в профиле" }), ".")) : null,
    h("section", { class: "card glass" },
      h("div", { class: "card-head" },
        h("h2", { text: pr.finished ? "Программа пройдена! 🎉" : `Занятие ${pr.next} из ${prog.days}` }),
        h("span", { class: "pill", text: `${pr.done} из ${prog.days}` })),
      h("div", { class: "day-dots", role: "img", "aria-label": `Пройдено ${pr.done} из ${prog.days} занятий` },
        Array.from({ length: prog.days }, (_, i) => h("i", { class: done.has(i + 1) ? "done" : !pr.finished && i + 1 === pr.next ? "next" : "", text: String(i + 1) }))),
      h("ul", { class: "bullets small" }, stages))
  ];
  if (session && session.blocked) {
    out.push(h("section", { class: "card glass warn" },
      h("h2", { text: "Сейчас программа на паузе" }),
      h("ul", { class: "adapt" }, session.notes.map(n => h("li", { class: "note", text: n })))));
  } else if (session) {
    const items = session.blocks.flatMap(b => b.items);
    out.push(h("section", { class: "card glass" },
      h("h2", { text: `Занятие ${pr.next}` }),
      h("p", { class: "muted small", text: `${roundsInfo(session)} · ${items.length} ${E.plural(items.length, "упражнение", "упражнения", "упражнений")}` }),
      exRows(items),
      session.adaptations.length ? h("ul", { class: "adapt", style: { marginTop: "12px" } }, session.adaptations.map(x => h("li", { text: x }))) : null,
      doneToday ? h("p", { class: "note-box", text: prog.kind === "strength" ? "Сегодня вы уже занимались по программе. Следующее занятие — через день: мышцам нужно 48 часов на восстановление." : "Сегодня вы уже занимались по программе. Следующее занятие лучше сделать завтра: мышцам и связкам нужно время на восстановление." }) : null,
      h("div", { class: "btn-row" },
        h("button", { class: "btn primary", type: "button", disabled: !items.length, onClick: () => startPlayer(session) }, icon("play", 18), `Начать занятие ${pr.next}`))));
  } else {
    out.push(h("section", { class: "card glass" },
      h("h2", { text: "Отличная работа!" }),
      h("p", { text: "Все дни пройдены. Можно повторить программу или перейти к обычным тренировкам — тренер продолжит беречь отмеченные зоны." }),
      h("div", { class: "btn-row" }, h("button", { class: "btn primary", type: "button", text: "Пройти заново", onClick: reset }))));
  }
  if (guide) out.push(h("section", { class: "card glass" }, h("p", { class: "eyebrow", text: "Почитать перед началом" }), h("div", { class: "list" }, guideRow(guide))));
  out.push(h("section", { class: "card glass" },
    h("ul", { class: "bullets small" },
      h("li", { text: "Станет больно во время занятия — нажмите «Больно»: упражнение заменится, а зона будет под защитой." }),
      h("li", { text: "Острая или нарастающая боль, отёк, онемение — повод остановиться и показаться врачу." }),
      h("li", { text: "Программа не заменяет лечебную физкультуру, которую назначил врач." })),
    pr.started && !pr.finished ? h("button", { class: "link-btn small", type: "button", text: "Сбросить прогресс", onClick: reset }) : null));
  return out;
}

// ===== Рекорды статики =====
const RECORD_BLOCK = ["hypertension", "heart", "pregnancy", "surgery", "caution"];
let recordPick = "";
function subRecords() {
  const r = E.restrictions(state);
  const head = [
    h("h1", { class: "page-title", text: "Рекорды статики" }),
    h("p", { class: "lead", text: "Сколько вы продержитесь? Засекайте время и смотрите, как растёт выносливость мышц, которые держат суставы и спину." })
  ];
  if (state.profile.conditions.some(c => RECORD_BLOCK.includes(c))) {
    return [...head, h("section", { class: "card glass warn" },
      h("h2", { text: "Испытания на максимум вам сейчас не подходят" }),
      h("p", { text: "Долгое напряжение «до отказа» повышает давление и нагрузку на сердце. При ваших особенностях здоровья выбирайте обычные тренировки — в них статика дозирована и короткая." }))];
  }
  const fitting = RECORD_EX.filter(id => E.fits(EX[id], r, state.profile));
  const unfit = RECORD_EX.filter(id => !fitting.includes(id));
  if (!fitting.length) {
    return [...head, h("section", { class: "card glass warn" },
      h("p", { text: "Сейчас все упражнения на рекорд нагружают зоны, которые нужно беречь. Вернитесь, когда восстановитесь." }))];
  }
  if (!fitting.includes(recordPick)) recordPick = fitting[0];
  const clock = h("div", { class: "big-timer record-clock", "aria-live": "off", text: "0:00" });
  const status = h("p", { class: "player-dose", "aria-live": "polite" });
  const btn = h("button", { class: "btn primary block", type: "button", text: "Старт" });
  const showBest = () => {
    const rec = state.records[recordPick];
    status.textContent = rec ? `Рекорд: ${mmss(rec.best)} · ${fmtDate(rec.d)}` : "Рекорда пока нет — установите первый!";
  };
  let phase = "idle", t0 = 0, iv = null, count = 0;
  const stopTimer = () => {
    clearInterval(iv);
    iv = null;
    keepAwake(false);
  };
  const finish = () => {
    const sec = Math.floor((performance.now() - t0) / 1000);
    stopTimer();
    phase = "idle";
    btn.textContent = "Старт";
    if (sec < 3) { clock.textContent = "0:00"; showBest(); toast("Слишком коротко — попробуйте ещё раз"); return; }
    const prev = state.records[recordPick];
    const best = !prev || sec > prev.best;
    state.records[recordPick] = { best: best ? sec : prev.best, d: best ? E.dayKey() : prev.d, last: sec, tries: Math.min(100000, (prev ? prev.tries : 0) + 1) };
    const nb = E.newBadges(state);
    persist();
    if (best) {
      confetti();
      if (state.settings.sound) beep(990, 0.35);
    }
    say(best ? "Новый рекорд!" : "Готово");
    toast(nb.length ? badgeToast(nb) : best ? (prev ? `Новый рекорд: ${mmss(sec)}! Было ${mmss(prev.best)}` : `Первый результат: ${mmss(sec)}`) : `${mmss(sec)}. Рекорд — ${mmss(prev.best)}`);
    refresh();
  };
  btn.addEventListener("click", () => {
    if (phase === "run") { finish(); return; }
    if (phase === "count") {
      stopTimer();
      phase = "idle";
      btn.textContent = "Старт";
      clock.textContent = "0:00";
      showBest();
      return;
    }
    unlockAudio();
    phase = "count";
    count = 3;
    clock.textContent = String(count);
    status.textContent = "Займите позицию";
    btn.textContent = "Отмена";
    keepAwake(true);
    if (state.settings.sound) beep(520, 0.12);
    say("Приготовьтесь");
    iv = setInterval(() => {
      if (!document.body.contains(clock)) { stopTimer(); phase = "idle"; return; }
      if (phase === "count") {
        count -= 1;
        if (count > 0) {
          clock.textContent = String(count);
          if (state.settings.sound) beep(520, 0.12);
          return;
        }
        phase = "run";
        t0 = performance.now();
        clock.textContent = "0:00";
        status.textContent = "Держим! Нажмите «Стоп», когда техника начнёт ломаться";
        btn.textContent = "Стоп";
        if (state.settings.sound) beep(880, 0.3);
        if (state.settings.vibrate) buzz(150);
        say("Держим");
        clearInterval(iv);
        iv = setInterval(() => {
          if (!document.body.contains(clock)) { stopTimer(); phase = "idle"; return; }
          const sec = (performance.now() - t0) / 1000;
          clock.textContent = mmss(Math.floor(sec));
          if (sec >= 600) finish();
        }, 250);
      }
    }, 1000);
  });
  showBest();
  const done = RECORD_EX.filter(id => state.records[id]);
  return [...head,
    h("section", { class: "card glass record-card" },
      choice({
        label: "Упражнение", value: recordPick,
        options: fitting.map(id => ({ value: id, label: EX[id].name })),
        onChange: v => {
          if (phase !== "idle") return;
          recordPick = v;
          clock.textContent = "0:00";
          showBest();
        }
      }),
      clock, status, btn,
      unfit.length ? h("p", { class: "muted small", style: { marginTop: "10px" }, text: `Сейчас не подходят: ${unfit.map(id => EX[id].name.toLowerCase()).join(", ")}.` }) : null),
    done.length ? h("section", { class: "card glass" },
      h("h2", { text: "Ваши рекорды" }),
      h("div", { class: "list" }, done.map(id => h("div", { class: "row" },
        h("span", { class: "row-text" }, h("b", { text: EX[id].name }),
          h("span", { class: "muted small", text: `${fmtDate(state.records[id].d)} · попыток: ${state.records[id].tries}` })),
        h("b", { class: "record-best", text: mmss(state.records[id].best) }))))) : null,
    h("section", { class: "card glass" },
      h("h2", { text: "Правила честного рекорда" }),
      h("ul", { class: "bullets" },
        h("li", { text: "Техника важнее секунд: как только поза «поплыла» или появилась боль — стоп, это и есть результат." }),
        h("li", { text: "Дышите ровно, не задерживайте дыхание." }),
        h("li", { text: "Пробуйте одно упражнение не чаще раза в 2–3 дня — мышцам нужно восстановиться." })))
  ];
}

// ===== Знакомство =====
let onbStep = 0;
let onb = null;

function renderOnboarding() {
  if (!onb) {
    const p = state.profile;
    onb = {
      name: p.name, ageGroup: p.ack ? p.ageGroup : "", ack: false, screening: p.screening.slice(),
      goal: p.goal, level: p.level, equipment: p.equipment.slice(), minutes: p.minutes, days: p.days.slice(),
      conditions: p.conditions.filter(c => c !== "caution")
    };
  }
  const steps = [onbWelcome, onbSafety, onbGoal, onbSetup, onbBody];
  onbStep = Math.min(onbStep, steps.length - 1);
  postRender.length = 0;
  const { body, check } = steps[onbStep]();
  const err = h("p", { class: "error", role: "alert" });
  const last = onbStep === steps.length - 1;
  const next = h("button", { class: "btn primary", type: "button", text: last ? "Готово" : "Далее" });
  next.addEventListener("click", () => {
    const problem = check ? check() : null;
    if (problem) { err.textContent = problem; return; }
    if (last) { finishOnboarding(); return; }
    onbStep += 1;
    renderOnboarding();
    window.scrollTo(0, 0);
  });
  const back = onbStep > 0 ? h("button", { class: "btn ghost", type: "button", text: "Назад", onClick: () => { onbStep -= 1; renderOnboarding(); window.scrollTo(0, 0); } }) : null;
  app.replaceChildren(h("div", { class: "onb" },
    h("div", { class: "onb-top" },
      h("span", { class: "brand" }, h("img", { src: "icon.svg", alt: "", width: 26, height: 26 }), h("span", {}, "Листо", h("b", { text: "пульс" }))),
      h("div", { class: "dots", role: "img", "aria-label": `Шаг ${onbStep + 1} из ${steps.length}` }, steps.map((_, i) => h("i", { class: i === onbStep ? "on" : "" })))),
    h("div", { class: "onb-body" }, body, err),
    h("div", { class: "onb-actions glass-clear" }, back, next)));
  runPostRender();
}

function onbWelcome() {
  const name = h("input", { class: "input", maxlength: 40, placeholder: "Например, Аня", autocomplete: "nickname" });
  name.value = onb.name;
  name.addEventListener("input", () => { onb.name = name.value; });
  const ack = h("input", { type: "checkbox", checked: onb.ack });
  ack.addEventListener("change", () => { onb.ack = ack.checked; });
  return {
    body: [
      h("img", { class: "hero-logo", src: "icon.svg", alt: "" }),
      h("h1", { class: "page-title", text: "Тренер, который слушает тело" }),
      h("p", { class: "lead", text: "Листопульс подбирает домашние тренировки с учётом травм, болезненных зон и самочувствия — и сразу меняет упражнение, если что-то заболело." }),
      h("section", { class: "card glass" },
        feature("body", "Карта тела", "Отметьте, что беспокоит, — опасные упражнения исчезнут из плана."),
        feature("heart", "Самочувствие каждый день", "Плохо спали или устали — тренировка станет легче."),
        feature("shield", "Данные только у вас", "Без регистрации, серверов и рекламы. По желанию — пароль и шифрование.")),
      h("section", { class: "card glass" },
        h("label", { class: "field" }, h("span", { text: "Как к вам обращаться? (необязательно)" }), name),
        h("div", { class: "q" }, h("b", { text: "Ваш возраст" }),
          choice({ label: "Возраст", value: onb.ageGroup, options: AGE_GROUPS.map(a => ({ value: a.id, label: a.name })), onChange: v => { onb.ageGroup = v; } })),
        h("p", { class: "muted small", text: "Приложение рассчитано на возраст от 12 лет; до 14 лет — вместе с родителями." })),
      h("section", { class: "card glass warn" },
        h("p", {}, h("b", { text: "Важно. " }), "Листопульс не заменяет врача и не является медицинским изделием. Советы общие и строятся по тому, что вы укажете сами. При заболеваниях, после травм и операций посоветуйтесь с врачом."),
        h("label", { class: "check-row" }, ack,
          h("span", {}, "Я понимаю это и принимаю ",
            h("a", { href: "terms.html", target: "_blank", rel: "noopener", text: "условия использования" }), " и ",
            h("a", { href: "privacy.html", target: "_blank", rel: "noopener", text: "политику конфиденциальности" }), ".")))
    ],
    check: () => (!onb.ageGroup ? "Выберите возраст" : !onb.ack ? "Отметьте, что принимаете условия" : null)
  };
}

function onbSafety() {
  const info = h("div", { class: "note-box", hidden: !onb.screening.length },
    h("b", { text: "Посоветуйтесь с врачом перед началом тренировок. " }),
    "Мы включим бережный режим и учтём ваши ответы — изменить это можно в разделе «Тело».");
  return {
    body: [
      h("h1", { class: "page-title", text: "Безопасность прежде всего" }),
      h("p", { class: "lead", text: "Несколько вопросов о здоровье. Ответы остаются только на этом устройстве." }),
      h("section", { class: "card glass" }, SCREENING.map(q => h("div", { class: "q" },
        h("b", { text: q.q }),
        choice({
          className: "seg", label: q.q, value: onb.screening.includes(q.id),
          options: [{ value: false, label: "Нет" }, { value: true, label: "Да" }],
          onChange: v => {
            onb.screening = v ? [...new Set([...onb.screening, q.id])] : onb.screening.filter(x => x !== q.id);
            info.hidden = !onb.screening.length;
          }
        })))),
      info
    ]
  };
}

function onbGoal() {
  return {
    body: [
      h("h1", { class: "page-title", text: "Ваша цель" }),
      h("p", { class: "lead", text: "От цели зависят упражнения в основной части. Её можно сменить в любой момент." }),
      h("section", { class: "card glass" },
        h("div", { class: "q" }, h("b", { text: "Цель" }), choice({ label: "Цель", value: onb.goal, options: GOALS.map(g => ({ value: g.id, label: g.name })), onChange: v => { onb.goal = v; } })),
        h("div", { class: "q" }, h("b", { text: "Уровень" }), choice({ className: "seg", label: "Уровень", value: onb.level, options: LEVELS.map(l => ({ value: l.v, label: l.name })), onChange: v => { onb.level = v; } })))
    ]
  };
}

function onbSetup() {
  return {
    body: [
      h("h1", { class: "page-title", text: "Условия" }),
      h("p", { class: "lead", text: "Подберём упражнения под ваш инвентарь и расписание." }),
      h("section", { class: "card glass" },
        h("div", { class: "q" }, h("b", { text: "Что есть дома?" }),
          choice({ multiple: true, label: "Инвентарь", value: onb.equipment, options: EQUIPMENT.map(e => ({ value: e.id, label: e.name })), onChange: v => { onb.equipment = v; } }),
          h("p", { class: "muted small", style: { marginTop: "8px" }, text: "Коврик или полотенце пригодятся для упражнений на полу." })),
        h("div", { class: "q" }, h("b", { text: "Сколько времени на тренировку?" }),
          choice({ className: "seg", label: "Длительность", value: onb.minutes, options: [10, 20, 30, 45].map(m => ({ value: m, label: `${m} мин` })), onChange: v => { onb.minutes = v; } })),
        h("div", { class: "q" }, h("b", { text: "В какие дни удобно?" }),
          choice({ multiple: true, label: "Дни", value: onb.days, options: WEEKDAYS.map((w, i) => ({ value: i + 1, label: w })), onChange: v => { onb.days = v; } })))
    ],
    check: () => (onb.days.length ? null : "Выберите хотя бы один день")
  };
}

function onbBody() {
  return {
    body: [
      h("h1", { class: "page-title", text: "Что беспокоит?" }),
      h("p", { class: "lead", text: "Коснитесь зоны на модели или обведите место, которое болит, — или пропустите этот шаг. Всё можно изменить позже в разделе «Тело»." }),
      h("section", { class: "card glass stage-card" }, bodyStage({ layers: false })),
      h("section", { class: "card glass" },
        h("h2", { text: "Особенности здоровья" }),
        choice({ multiple: true, label: "Особенности здоровья", value: onb.conditions, options: CONDITIONS.filter(c => !c.hidden).map(c => ({ value: c.id, label: c.name })), onChange: v => { onb.conditions = v; } }))
    ]
  };
}

function finishOnboarding() {
  const p = state.profile;
  const derived = SCREENING.filter(q => onb.screening.includes(q.id)).map(q => q.cond);
  p.onboarded = true;
  p.ack = true;
  p.name = clean(onb.name, 40);
  p.ageGroup = onb.ageGroup;
  p.screening = onb.screening.slice();
  p.goal = onb.goal;
  p.level = onb.level;
  p.equipment = onb.equipment.slice();
  p.minutes = onb.minutes;
  p.days = onb.days.slice().sort();
  p.conditions = [...new Set([...onb.conditions, ...derived])];
  p.screenedAt = E.dayKey();
  onb = null;
  onbStep = 0;
  planCache.key = "";
  persist();
  if (window.location.hash !== "#today") window.location.hash = "#today";
  render();
  toast("Готово! Тренировка на сегодня уже собрана");
}

// ===== Плеер тренировки =====
const stepSeconds = st => (EX[st.item.id].side ? st.item.sec * 2 : st.item.sec);
const isHold = st => st.type === "ex" && EX[st.item.id].type === "hold";

function startPlayer(session, stepsOverride) {
  if (player) return;
  const steps = stepsOverride || E.flatten(session);
  if (!steps.length) { toast("В этой тренировке нет подходящих упражнений"); return; }
  unlockAudio();
  player = {
    session, steps, i: 0, timed: false, deadline: null, remaining: 0, paused: false, prep: false, half: false, hold: null, kg: {}, used: {},
    sets: {}, exDone: {}, prs: [], curReps: null,
    startedAt: Date.now(), pausedAt: 0, pausedTotal: 0, done: 0, pains: [], lastWhole: null, mins: 0,
    timerEl: null, sideEl: null, timer: null,
    el: h("div", { class: "player", role: "dialog", "aria-modal": "true", "aria-label": "Тренировка" })
  };
  document.body.append(player.el);
  app.inert = true;
  document.documentElement.classList.add("no-scroll");
  keepAwake(true);
  player.timer = setInterval(tick, 200);
  enterStep(0);
}

function startCountdown(sec) {
  const P = player;
  P.timed = true;
  P.remaining = sec;
  P.deadline = P.paused ? null : Date.now() + sec * 1000;
  P.lastWhole = null;
}

// Шаг выполнен: считаем упражнения и подходы (для дневника и карты восстановления мышц)
function completeStep(st) {
  const P = player;
  P.done += 1;
  if (st && st.type === "ex") P.exDone[st.item.id] = (P.exDone[st.item.id] || 0) + 1;
}

function enterStep(i) {
  const P = player;
  P.i = i;
  P.half = false;
  P.prep = false;
  P.hold = null;
  P.curReps = null;
  if (i >= P.steps.length) { finishPlayer(); return; }
  const st = P.steps[i];
  const prevRest = i > 0 && P.steps[i - 1].type === "rest";
  if (st.type === "rest") {
    startCountdown(st.sec);
    say(st.label ? `${st.label}. Далее: ${nextName(i)}` : `Отдых ${st.sec} секунд. Далее: ${nextName(i)}`);
  } else if (st.type === "work") {
    if (i === 0) { P.prep = true; startCountdown(5); say("Приготовьтесь"); }
    else { startCountdown(st.sec); say(st.label || `Работа. Раунд ${st.round}`); }
  } else {
    const ex = EX[st.item.id];
    if (ex.type === "hold") {
      // Изометрия: удержание → расслабление → удержание… (после отдыха начинаем сразу)
      P.hold = { rep: 1, side: 1, phase: prevRest ? "hold" : "prep" };
      if (prevRest) { startCountdown(ex.hold); say(`${ex.name}. Держим ${ex.hold} секунд`); }
      else { startCountdown(E.PREP_SEC); say(`Приготовьтесь: ${ex.name}. ${E.doseText(st.item)}`); }
    } else if (st.item.sec) {
      if (!prevRest) { P.prep = true; startCountdown(5); say(`Приготовьтесь: ${ex.name}`); }
      else { startCountdown(stepSeconds(st)); say(`${ex.name}. ${E.doseText(st.item)}`); }
    } else {
      P.timed = false;
      P.deadline = null;
      P.remaining = 0;
      say(`${ex.name}. ${E.doseText(st.item)}`);
    }
  }
  renderPlayer();
}

// Следующая фаза изометрического упражнения
function holdNext() {
  const P = player;
  const st = P.steps[P.i];
  const ex = EX[st.item.id];
  const H = P.hold;
  const sound = state.settings.sound;
  if (H.phase !== "hold") {
    H.phase = "hold";
    startCountdown(ex.hold);
    if (sound) beep(760, 0.25);
    say("Держим");
  } else if (H.rep < st.item.reps) {
    H.rep += 1;
    H.phase = "relax";
    startCountdown(E.relaxOf(ex));
    if (sound) beep(440, 0.25);
    say("Расслабьтесь");
  } else if (ex.side && H.side === 1) {
    H.side = 2;
    H.rep = 1;
    H.phase = "relax";
    startCountdown(Math.max(E.relaxOf(ex), 5));
    if (sound) beep(700, 0.2);
    say("Смена стороны");
  } else {
    if (sound) beep(880, 0.3);
    completeStep(st);
    enterStep(P.i + 1);
    return;
  }
  renderPlayer();
}

function tick() {
  const P = player;
  if (!P || P.paused || !P.timed || P.deadline === null) return;
  const st = P.steps[P.i];
  if (!st) return;
  const left = (P.deadline - Date.now()) / 1000;
  P.remaining = Math.max(0, left);
  const whole = Math.ceil(left);
  if (whole !== P.lastWhole) {
    P.lastWhole = whole;
    const quiet = P.hold && P.hold.phase === "relax";
    if (whole <= 3 && whole > 0 && state.settings.sound && !quiet) beep(520, 0.12);
    if (P.timerEl) P.timerEl.textContent = mmss(P.remaining);
  }
  if (st.type === "ex" && !P.hold && !P.prep && st.item.sec && EX[st.item.id].side && !P.half && left <= st.item.sec) {
    P.half = true;
    if (state.settings.sound) beep(700, 0.2);
    if (state.settings.vibrate) buzz(120);
    say("Смена стороны");
    if (P.sideEl) P.sideEl.textContent = "Вторая сторона";
  }
  if (left > 0) return;
  if (P.hold) {
    if (state.settings.vibrate) buzz(P.hold.phase === "hold" ? 200 : 120);
    holdNext();
    return;
  }
  if (state.settings.sound) beep(880, 0.3);
  if (state.settings.vibrate) buzz(200);
  if (P.prep) {
    P.prep = false;
    startCountdown(st.type === "work" ? st.sec : stepSeconds(st));
    say(st.type === "work" ? (st.label ? `${st.label}!` : "Работа!") : `${EX[st.item.id].name}. Начали!`);
    renderPlayer();
    return;
  }
  if (st.type === "ex" || st.type === "work") completeStep(st);
  enterStep(P.i + 1);
}

function setPaused(paused) {
  const P = player;
  if (!P || P.paused === paused) return;
  if (paused) {
    P.paused = true;
    P.pausedAt = Date.now();
    if (P.timed && P.deadline !== null) P.remaining = Math.max(0, (P.deadline - Date.now()) / 1000);
    P.deadline = null;
  } else {
    P.paused = false;
    P.pausedTotal += Date.now() - P.pausedAt;
    if (P.timed) P.deadline = Date.now() + P.remaining * 1000;
  }
}
function togglePause() {
  setPaused(!player.paused);
  renderPlayer();
}

function nextName(i) {
  for (let j = i + 1; j < player.steps.length; j++) {
    const st = player.steps[j];
    if (st.type === "ex") return st.sets ? `${EX[st.item.id].name} · подход ${st.set} из ${st.sets}` : EX[st.item.id].name;
    if (st.type === "work") return st.label ? `${st.label.toLowerCase()} · ${mmss(st.sec)}` : "работа";
    if (st.type === "rest" && st.label) return `${st.label.toLowerCase()} · ${mmss(st.sec)}`;
  }
  return "";
}

const HOLD_PHASE = { prep: "Приготовьтесь", hold: "Держим", relax: "Расслабьтесь" };
function renderPlayer() {
  const P = player;
  const st = P.steps[P.i];
  if (!st) return;
  const pct = Math.round((P.i / P.steps.length) * 100);
  const sound = state.settings.sound, voice = state.settings.voice;
  const top = h("div", { class: "player-top" },
    h("button", { class: "icon-btn", type: "button", "aria-label": "Завершить тренировку", onClick: askExit }, icon("close", 20)),
    h("div", { class: "progress", role: "progressbar", "aria-label": "Прогресс тренировки", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": pct }, h("i", { style: { width: `${pct}%` } })),
    h("button", { class: "icon-btn", type: "button", "aria-label": sound ? "Выключить звук" : "Включить звук", onClick: () => { state.settings.sound = !sound; persist(); renderPlayer(); } }, icon(sound ? "sound" : "mute", 20)),
    h("button", {
      class: `icon-btn${voice ? " on" : ""}`, type: "button", "aria-pressed": voice ? "true" : "false", "aria-label": "Голосовые подсказки",
      onClick: () => { state.settings.voice = !voice; persist(); renderPlayer(); if (!voice) speak("Голосовые подсказки включены"); }
    }, icon("voice", 20)));

  P.timerEl = null;
  P.sideEl = null;
  const timerNode = () => (P.timerEl = h("div", { class: "big-timer", text: mmss(P.remaining) }));
  const pauseBtn = cls => h("button", { class: `btn ${cls}`, type: "button", "aria-label": P.paused ? "Продолжить" : "Пауза", onClick: togglePause }, icon(P.paused ? "play" : "pause", 18), cls === "primary" ? (P.paused ? "Продолжить" : "Пауза") : null);
  const painBtn = () => h("button", { class: "btn pain", type: "button", onClick: painSheet, text: "Больно" });
  const skipBtn = () => h("button", { class: "btn ghost", type: "button", "aria-label": "Пропустить упражнение", onClick: () => enterStep(P.i + 1) }, icon("next", 18));
  let card, controls;

  if (st.type === "rest") {
    card = h("section", { class: "player-card glass is-rest" },
      h("p", { class: "player-block", text: st.label || "Отдых" }), timerNode(),
      h("p", { class: "player-dose", text: st.cue || "Дышите спокойно, можно попить воды" }));
    controls = h("div", { class: "player-controls" },
      h("button", { class: "btn ghost", type: "button", onClick: () => { P.remaining += 15; if (P.deadline !== null) P.deadline += 15000; if (P.timerEl) P.timerEl.textContent = mmss(P.remaining); } }, "+15 с"),
      h("button", { class: "btn primary", type: "button", text: "Пропустить", onClick: () => enterStep(P.i + 1) }),
      pauseBtn("ghost"));
  } else if (st.type === "work") {
    card = h("section", { class: `player-card glass${P.prep ? " is-prep" : ""}` },
      h("p", { class: "player-block", text: st.label ? (st.rounds ? `Интервал ${st.round} из ${st.rounds}` : P.session.title) : `Раунд ${st.round} из ${st.rounds}` }),
      h("h1", { class: "player-ex", text: P.prep ? "Приготовьтесь" : st.label || "Работа" }),
      timerNode(),
      st.cue && !P.prep ? h("p", { class: "player-dose", text: st.cue }) : null);
    controls = h("div", { class: "player-controls" },
      h("span"),
      pauseBtn("primary"),
      h("button", { class: "btn ghost", type: "button", "aria-label": "Следующий этап", onClick: () => { if (!P.prep) completeStep(st); enterStep(P.i + 1); } }, icon("next", 18)));
  } else {
    const ex = EX[st.item.id];
    const blockInfo = `${st.block}${st.sets ? ` · подход ${st.set} из ${st.sets}` : st.rounds > 1 ? ` · круг ${st.round} из ${st.rounds}` : ""}`;
    const demo = demoBox(ex.id);
    const swapBtn = h("button", { class: "swap-btn", type: "button", onClick: swapSheet }, icon("swap", 15), "Заменить");
    if (isHold(st)) {
      const H = P.hold || { rep: 1, side: 1, phase: "prep" };
      const n = st.item.reps;
      const sideText = ex.side ? ` · ${H.side === 1 ? "первая" : "вторая"} сторона` : "";
      card = h("section", { class: `player-card glass hold-card is-${H.phase}` },
        h("p", { class: "player-block", text: blockInfo }),
        h("h1", { class: "player-ex", text: ex.name }),
        swapBtn,
        demo,
        h("p", { class: "hold-phase", text: HOLD_PHASE[H.phase] }),
        timerNode(),
        h("p", { class: "player-dose", text: `${H.phase === "relax" ? "Далее повтор" : "Повтор"} ${H.rep} из ${n}${sideText}` }),
        h("div", { class: "hold-dots", "aria-hidden": "true" },
          Array.from({ length: n }, (_, k) => h("i", { class: k < H.rep - 1 ? "done" : k === H.rep - 1 && H.phase === "hold" ? "now" : "" }))),
        h("ul", { class: "cues" }, ex.cues.map(c => h("li", { text: c }))));
      controls = h("div", { class: "player-controls" }, painBtn(), pauseBtn("primary"), skipBtn());
    } else {
      let main;
      if (P.prep) main = [h("p", { class: "player-dose", text: `Приготовьтесь · ${E.doseText(st.item)}` }), timerNode()];
      else if (st.item.sec) main = [timerNode(), ex.side ? (P.sideEl = h("p", { class: "player-dose", text: P.half ? "Вторая сторона" : "Первая сторона" })) : null];
      else if (ex.weighted) main = [h("p", { class: "player-dose", text: `Цель: ${E.doseText(st.item)}` }), weightControl(ex, st)];
      else main = [h("div", { class: "big-reps", text: `×${st.item.reps}` }), h("p", { class: "player-dose", text: ex.side ? "на каждую сторону · нажмите «Готово», когда закончите" : "нажмите «Готово», когда закончите" })];
      card = h("section", { class: `player-card glass${P.prep ? " is-prep" : ""}` },
        h("p", { class: "player-block", text: blockInfo }),
        h("h1", { class: "player-ex", text: ex.name }),
        swapBtn,
        demo,
        main,
        h("ul", { class: "cues" }, ex.cues.map(c => h("li", { text: c }))));
      const primary = st.item.reps
        ? h("button", {
          class: "btn primary", type: "button",
          onClick: () => {
            if (ex.weighted && P.kg[ex.id] !== null && P.kg[ex.id] !== undefined) logSet(ex, P.kg[ex.id], P.curReps || st.item.reps);
            completeStep(st);
            if (state.settings.sound) beep(880, 0.2);
            enterStep(P.i + 1);
          }
        }, icon("check", 18), "Готово")
        : pauseBtn("primary");
      controls = h("div", { class: "player-controls" }, painBtn(), primary, skipBtn());
    }
  }
  const next = nextName(P.i);
  P.el.replaceChildren(top,
    h("div", { class: "player-main" }, card, next ? h("p", { class: "next-up", text: `Далее: ${next}` }) : null),
    controls);
}

// Подход с весом: вес и сделанные повторы. Новый рекорд (по расчётному 1ПМ) отмечаем сразу
function logSet(ex, kg, reps) {
  const P = player;
  (P.sets[ex.id] = P.sets[ex.id] || []).push([kg, reps]);
  P.used[ex.id] = kg;
  const prev = state.weights[ex.id];
  const best = Math.max(prev && prev.e1rm ? prev.e1rm : 0, ...P.sets[ex.id].slice(0, -1).map(([k, r]) => E.e1rm(k, r)));
  if (prev && prev.e1rm > 0 && E.e1rm(kg, reps) > best && !P.prs.includes(ex.id)) {
    P.prs.push(ex.id);
    if (state.settings.vibrate) buzz([80, 60, 80]);
    toast(`🥇 Новый рекорд: ${ex.name.toLowerCase()} — ${fmtKg(kg)} × ${reps}`);
  }
}
const setsText = list => list.map(([kg, r]) => `${fmtNum(kg)}×${r}`).join(", ");

// Рабочий вес и повторы в плеере. Подсказка прогрессии: все повторы с весом сделаны — пора прибавить
function weightControl(ex, st) {
  const P = player;
  const prev = state.weights[ex.id];
  const target = st.item.reps;
  const sug = E.suggestWeight(state, ex.id, target);
  if (P.kg[ex.id] === undefined) P.kg[ex.id] = sug ? sug.kg : null;
  if (P.curReps === null) P.curReps = target;
  const val = h("b", { class: "w-val", "aria-live": "polite", text: fmtKg(P.kg[ex.id]) });
  const repVal = h("b", { class: "w-val", "aria-live": "polite", text: String(P.curReps) });
  const setKg = kg => {
    P.kg[ex.id] = E.roundWeight(kg);
    val.textContent = fmtKg(P.kg[ex.id]);
  };
  const setReps = n => {
    P.curReps = E.clamp(n, 1, 50);
    repVal.textContent = String(P.curReps);
  };
  const today = P.sets[ex.id] || [];
  let hint;
  if (sug && sug.up) hint = `В прошлый раз все повторы с ${fmtKg(prev.kg)} — пора прибавить: ${fmtKg(sug.kg)}`;
  else if (prev && prev.last && prev.last.length) hint = `В прошлый раз: ${setsText(prev.last)} кг`;
  else if (prev) hint = `В прошлый раз ${fmtKg(prev.kg)} · лучший ${fmtKg(prev.best)}`;
  else hint = "Укажите вес и сделанные повторы — запомню на следующий раз";
  const stepper = (label, value, minus, plus, minusLabel, plusLabel) => h("div", { class: "w-col" },
    h("span", { class: "muted small", text: label }),
    h("div", { class: "w-row" },
      h("button", { class: "icon-btn", type: "button", "aria-label": minusLabel, onClick: minus }, icon("minus", 18)),
      value,
      h("button", { class: "icon-btn", type: "button", "aria-label": plusLabel, onClick: plus }, icon("plus", 18))));
  return h("div", { class: "weight-ctl" },
    h("div", { class: "w-cols" },
      stepper(E.weightUnit(ex), val,
        () => { const k = P.kg[ex.id]; if (k !== null) setKg(Math.max(0.5, k - E.weightStep(k - 0.01))); },
        () => { const k = P.kg[ex.id]; setKg(k === null ? E.startWeight(ex) : k + E.weightStep(k)); },
        "Меньше вес", "Больше вес"),
      stepper("Сделано повторов", repVal, () => setReps(P.curReps - 1), () => setReps(P.curReps + 1), "Меньше повторов", "Больше повторов")),
    today.length ? h("span", { class: "small", text: `Сегодня: ${setsText(today)} кг` }) : null,
    h("span", { class: `small${sug && sug.up ? " up-hint" : " muted"}`, text: hint }));
}

// Заменить упражнение вручную: нет инвентаря, не нравится, занято место
function swapSheet() {
  const P = player;
  const st = P.steps[P.i];
  const ex = EX[st.item.id];
  const wasPaused = P.paused;
  setPaused(true);
  renderPlayer();
  const r = E.restrictions(state);
  const used = new Set(P.steps.filter(x => x.type === "ex").map(x => x.item.id));
  const alts = E.findReplacements(ex, r, state.profile, used, 5);
  const resume = () => { if (!wasPaused) setPaused(false); renderPlayer(); };
  const pick = alt => {
    const k = st.item.reps ? st.item.reps / ex.base : st.item.sec / ex.base;
    for (let j = P.i; j < P.steps.length; j++) {
      const s2 = P.steps[j];
      if (s2.type === "ex" && s2.item.id === ex.id) s2.item = E.makeItem(alt, k);
    }
    toast(`Заменили на «${alt.name}»`);
    setPaused(false);
    enterStep(P.i);
  };
  const close = sheet({
    title: "Чем заменить?",
    body: [
      h("p", { class: "muted small", text: `Похожие упражнения вместо «${ex.name}» — с учётом ваших зон и инвентаря.` }),
      alts.length
        ? h("div", { class: "list" }, alts.map(alt => h("button", { class: "row row-btn", type: "button", onClick: () => { close(); pick(alt); } },
          h("span", { class: "row-text" }, h("b", { text: alt.name }), h("span", { class: "muted small", text: `${GROUPS[alt.group]} · ${LEVELS[alt.level - 1].name}${alt.equip.length ? ` · ${alt.equip.map(e => equipName(e).toLowerCase()).join(", ")}` : ""}` })),
          icon("swap", 18))))
        : h("p", { class: "muted", text: "Подходящей замены не нашлось — упражнение можно пропустить." }),
      h("p", { class: "muted small", text: "Если упражнение вызывает боль, нажмите «Больно»: тренер не только заменит его, но и побережёт эту зону." })
    ],
    actions: [h("button", { class: "btn ghost", type: "button", text: "Отмена", onClick: () => { close(); resume(); } })],
    onClose: () => { if (player && player.paused && !wasPaused) resume(); }
  });
}

function askExit() {
  const P = player;
  const wasPaused = P.paused;
  setPaused(true);
  renderPlayer();
  const close = sheet({
    title: "Завершить тренировку?",
    body: h("p", { class: "muted", text: P.done ? `Выполнено упражнений: ${P.done}. Можно сохранить то, что успели.` : "Пока не выполнено ни одного упражнения." }),
    actions: [
      h("button", { class: "btn ghost", type: "button", text: "Продолжить", onClick: () => { close(); if (!wasPaused) { setPaused(false); renderPlayer(); } } }),
      h("button", { class: "btn primary", type: "button", text: P.done ? "Завершить" : "Выйти", onClick: () => { close(); if (P.done) finishPlayer(); else closePlayer(); } })
    ]
  });
}

function painSheet() {
  const P = player;
  const ex = EX[P.steps[P.i].item.id];
  setPaused(true);
  renderPlayer();
  const loaded = Object.keys(ex.load);
  const order = [...loaded, ...REGIONS.map(r => r.id).filter(id => !loaded.includes(id))];
  const close = sheet({
    title: "Где неприятно?",
    body: [
      h("p", { class: "muted small", text: "Заменим упражнение на безопасное и 7 дней будем беречь эту зону. Ориентир: слабая боль до 3 из 10, которая не нарастает и проходит к утру, при восстановлении допустима; сильнее — меняем упражнение." }),
      h("div", { class: "chips" }, order.map(id => h("button", { class: "chip", type: "button", text: REGION[id].name, onClick: () => { close(); handlePain(id); } }))),
      h("div", { class: "btn-row" }, h("button", { class: "btn ghost", type: "button", text: "Не больно — просто тяжело", onClick: () => { close(); easier(); } })),
      h("div", { class: "note-box" },
        h("b", { text: "Резкая или сильная боль, отёк, онемение — остановитесь. " }),
        "При боли в груди, обмороке или сильной одышке звоните 112.",
        h("div", { class: "btn-row" }, h("button", { class: "btn danger", type: "button", text: "Завершить тренировку", onClick: () => { close(); finishPlayer(); } })))
    ]
  });
}

function cleanSteps(steps, from) {
  const out = steps.slice(0, from);
  for (let j = from; j < steps.length; j++) {
    const st = steps[j];
    if (st.removed) continue;
    if (st.type === "rest" && (!out.length || out[out.length - 1].type === "rest")) continue;
    out.push(st);
  }
  while (out.length && out[out.length - 1].type === "rest") out.pop();
  return out;
}

function handlePain(region) {
  const P = player;
  const ex = EX[P.steps[P.i].item.id];
  E.reportPain(state, region);
  P.pains.push({ ex: ex.id, region });
  planCache.key = "";
  const r = E.restrictions(state);
  const used = new Set(P.steps.filter(x => x.type === "ex").map(x => x.item.id));
  used.add(ex.id);
  const swap = new Map();
  for (let j = P.i; j < P.steps.length; j++) {
    const st = P.steps[j];
    if (st.type !== "ex") continue;
    const e2 = EX[st.item.id];
    if (e2.id !== ex.id && E.fits(e2, r, state.profile)) continue;
    if (!swap.has(e2.id)) {
      const alt = E.findReplacement(e2, r, state.profile, used);
      swap.set(e2.id, alt);
      if (alt) used.add(alt.id);
    }
    const alt = swap.get(e2.id);
    if (alt) {
      const k = st.item.reps ? st.item.reps / e2.base : st.item.sec / e2.base;
      st.item = E.makeItem(alt, k);
    } else {
      st.removed = true;
    }
  }
  P.steps = cleanSteps(P.steps, P.i);
  persist();
  const alt = swap.get(ex.id);
  const zone = REGION[region].name.toLowerCase();
  toast(alt ? `Заменили на «${alt.name}». Бережём зону «${zone}» 7 дней` : `Убрали «${ex.name}» — бережём зону «${zone}» 7 дней`);
  setPaused(false);
  enterStep(P.i);
}

function easier() {
  const P = player;
  const id = P.steps[P.i].item.id;
  for (let j = P.i; j < P.steps.length; j++) {
    const st = P.steps[j];
    if (st.type !== "ex" || st.item.id !== id) continue;
    if (EX[id].type === "hold") st.item = { id, reps: Math.max(2, Math.round(st.item.reps * 0.7)) };
    else st.item = st.item.reps ? { id, reps: Math.max(3, Math.round(st.item.reps * 0.7)) } : { id, sec: Math.max(10, Math.round((st.item.sec * 0.7) / 5) * 5) };
  }
  toast("Сделали упражнение легче");
  setPaused(false);
  enterStep(P.i);
}

function finishPlayer() {
  const P = player;
  clearInterval(P.timer);
  P.timer = null;
  keepAwake(false);
  if (P.paused) setPaused(false);
  P.mins = Math.max(1, Math.round((Date.now() - P.startedAt - P.pausedTotal) / 60000));
  say("Тренировка завершена. Отличная работа!");
  let rpe = 6;
  const zones = [...new Set(P.pains.map(p => REGION[p.region].name.toLowerCase()))];
  P.el.replaceChildren(h("div", { class: "summary" },
    h("section", { class: "player-card glass" },
      h("p", { class: "player-block", text: P.session.title }),
      h("h1", { class: "player-ex", text: "Готово! 🎉" }),
      h("div", { class: "stats", style: { margin: "16px 0" } }, stat(P.mins, E.plural(P.mins, "минута", "минуты", "минут")),
        stat(P.done, P.session.kind === "timer" ? E.plural(P.done, "раунд", "раунда", "раундов") : P.session.kind === "run" ? E.plural(P.done, "интервал", "интервала", "интервалов") : E.plural(P.done, "подход", "подхода", "подходов")),
        stat(P.pains.length, E.plural(P.pains.length, "сигнал боли", "сигнала боли", "сигналов боли"))),
      h("div", { class: "q", style: { textAlign: "left" } },
        h("b", { text: "Насколько было тяжело?" }),
        choice({ className: "rpe", label: "Тяжесть тренировки от 1 до 10", value: rpe, options: Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) })), onChange: v => { rpe = v; } }),
        h("div", { class: "scale-labels" }, h("span", { text: "очень легко" }), h("span", { text: "на пределе" }))),
      zones.length ? h("p", { class: "small", style: { textAlign: "left" }, text: `Зоны «${zones.join("», «")}» будут под защитой 7 дней. Завтра спросим, как они, — если боль не проходит или усиливается, покажитесь врачу.` }) : null,
      P.session.kind === "program" && P.done ? h("p", { class: "small", style: { textAlign: "left" }, text: `Сохраните — и занятие ${P.session.programDay} программы будет засчитано.` }) : null,
      Object.keys(P.sets).length ? h("p", { class: "small", style: { textAlign: "left" }, text: `Подходы с весом: ${Object.entries(P.sets).map(([id, list]) => `${EX[id].name.toLowerCase()} — ${setsText(list)} кг`).join("; ")}. Сохраним их в журнал весов.` }) : null,
      P.prs.length ? h("p", { class: "small pr-line", style: { textAlign: "left" }, text: `🥇 Новые рекорды: ${P.prs.map(id => EX[id].name.toLowerCase()).join(", ")}` }) : null,
      P.done ? h("div", { class: "btn-row center-row" }, h("button", {
        class: "btn small ghost", type: "button",
        onClick: () => shareCard({
          title: P.session.title,
          sub: fmtDate(E.dayKey(), { weekday: "long", day: "numeric", month: "long" }),
          stats: [[P.mins, E.plural(P.mins, "минута", "минуты", "минут")], [P.done, P.session.kind === "timer" ? E.plural(P.done, "раунд", "раунда", "раундов") : E.plural(P.done, "подход", "подхода", "подходов")],
            [E.streak(state) || 1, E.plural(E.streak(state) || 1, "день подряд", "дня подряд", "дней подряд")], [P.prs.length || Object.keys(P.exDone).length, P.prs.length ? E.plural(P.prs.length, "рекорд", "рекорда", "рекордов") : E.plural(Object.keys(P.exDone).length, "упражнение", "упражнения", "упражнений")]]
        }, `Тренировка «${P.session.title}» в Листопульсе: ${P.mins} ${E.plural(P.mins, "минута", "минуты", "минут")} 🌿`)
      }, icon("share", 16), "Поделиться")) : null,
      h("p", { class: "muted small", style: { textAlign: "left" }, text: "По вашей оценке тренер подстроит нагрузку в следующий раз." }),
      h("div", { class: "btn-row" },
        h("button", { class: "btn ghost", type: "button", text: "Не сохранять", onClick: () => closePlayer() }),
        h("button", { class: "btn primary", type: "button", text: "Сохранить", onClick: () => saveWorkout(rpe) })))));
  P.el.scrollTop = 0;
}

function saveWorkout(rpe) {
  const P = player;
  const start = new Date(P.startedAt);
  const day = E.dayKey(start);
  state.sessions.push({
    id: newId(), d: day, hour: start.getHours(), mins: P.mins, title: P.session.title,
    goal: P.session.goal, mode: P.session.mode, rpe, count: P.done, pains: P.pains.slice(0, 20),
    ex: Object.entries(P.exDone).slice(0, 40)
  });
  if (state.sessions.length > 1000) state.sessions.splice(0, state.sessions.length - 1000);
  if (P.session.kind === "plan") E.applyFeedback(state, rpe, P.pains.length);
  const prs = Object.entries(P.sets).filter(([id, list]) => E.recordSets(state, id, list, day).pr).map(([id]) => id);
  if (P.session.kind === "program" && P.done) {
    const pid = P.session.program;
    const pr = own(state.programs, pid) ? state.programs[pid] : (state.programs[pid] = { start: day, done: [] });
    if (!pr.done.includes(P.session.programDay)) pr.done = pr.done.concat(P.session.programDay).sort((a, b) => a - b);
  }
  if (P.session.kind === "run" && P.done) {
    const run = state.run || (state.run = { start: day, done: [], last: "" });
    if (!P.session.repeat && !run.done.includes(P.session.runDay)) run.done = run.done.concat(P.session.runDay).sort((a, b) => a - b);
    run.last = day;
  }
  if (P.session.kind === "challenge" && P.done && own(CHALLENGE_BY_ID, P.session.challenge)) {
    const cid = P.session.challenge;
    const ch = own(state.challenges, cid) ? state.challenges[cid] : (state.challenges[cid] = { start: day, done: [], last: "" });
    if (!ch.done.includes(P.session.challengeDay)) ch.done = ch.done.concat(P.session.challengeDay).sort((a, b) => a - b);
    ch.last = day;
  }
  const nb = E.newBadges(state);
  planCache.key = "";
  persist();
  requestPersistence();
  closePlayer();
  confetti();
  toast(nb.length ? badgeToast(nb) : prs.length ? `🥇 Новый рекорд: ${EX[prs[0]].name.toLowerCase()}!` : "Тренировка сохранена в дневник");
}

// ===== Прогулка или пробежка с GPS =====
// Маршрут пишется, только пока приложение открыто и экран включён. Координаты держатся в памяти
// и после завершения стираются: в дневник попадают только дистанция и время.
let tracker = null;
const toRad = v => (v * Math.PI) / 180;
function geoDist(a, b) {
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
const TRACK_KIND = { walk: { title: "Прогулка", max: 4 }, run: { title: "Бег", max: 9 } };
function startTracker(kind = "walk") {
  if (player || tracker) return;
  if (!("geolocation" in navigator)) { toast("Этот браузер не умеет определять местоположение"); return; }
  tracker = {
    kind, status: "idle", pts: [], dist: 0, startedAt: 0, pausedAt: 0, pausedTotal: 0, paused: false, watch: null, timer: null,
    acc: null, last: null, msg: "Нажмите «Старт», когда будете готовы. Первые секунды телефон ищет спутники.",
    el: h("div", { class: "player tracker", role: "dialog", "aria-modal": "true", "aria-label": "Запись маршрута" }), nodes: {}
  };
  document.body.append(tracker.el);
  app.inert = true;
  document.documentElement.classList.add("no-scroll");
  renderTracker();
}
const trackElapsed = T => (T.startedAt ? (T.paused ? T.pausedAt : Date.now()) - T.startedAt - T.pausedTotal : 0);
function trackerBegin() {
  const T = tracker;
  T.status = "running";
  T.startedAt = Date.now();
  T.msg = "Ищем спутники…";
  keepAwake(true);
  unlockAudio();
  T.watch = navigator.geolocation.watchPosition(onTrackPos, onTrackErr, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
  T.timer = setInterval(updateTracker, 1000);
  renderTracker();
}
function onTrackPos(pos) {
  const T = tracker;
  if (!T || T.status !== "running") return;
  const { latitude, longitude, accuracy } = pos.coords;
  T.acc = Math.round(accuracy);
  if (T.paused) { updateTracker(); return; }
  if (accuracy > 35) { T.msg = `Слабый сигнал GPS (±${T.acc} м) — выйдите на открытое место`; updateTracker(); return; }
  T.msg = `Точность GPS ±${T.acc} м`;
  const p = [latitude, longitude, pos.timestamp || Date.now()];
  if (T.last) {
    const d = geoDist(T.last, p);
    const dt = Math.max(1, (p[2] - T.last[2]) / 1000);
    // Дрожание на месте не считаем, а резкий скачок — ошибка спутника
    if (d < Math.max(3, accuracy / 2)) { updateTracker(); return; }
    if (d / dt > 12) { updateTracker(); return; }
    T.dist += d;
  }
  T.last = p;
  T.pts.push([latitude, longitude]);
  if (T.pts.length > 4000) T.pts = T.pts.filter((_, i) => i % 2 === 0);
  updateTracker();
}
function onTrackErr(err) {
  const T = tracker;
  if (!T) return;
  T.msg = err && err.code === 1
    ? "Нет доступа к местоположению. Разрешите его для этого сайта в настройках браузера."
    : "Не удаётся получить сигнал GPS. Выйдите на открытое место или подождите.";
  updateTracker();
}
function routeSvg(pts) {
  const svg = s("svg", { class: "route", viewBox: "0 0 300 170", role: "img", "aria-label": "Схема маршрута без карты" });
  if (pts.length < 2) return svg;
  const lat0 = pts[0][0];
  const k = Math.cos(toRad(lat0));
  const xy = pts.map(([la, lo]) => [lo * k, -la]);
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const sc = 150 / span;
  const ox = 150 - ((minX + maxX) / 2) * sc, oy = 85 - ((minY + maxY) / 2) * sc;
  const P2 = xy.map(([x, y]) => [x * sc + ox, y * sc + oy]);
  const last = P2[P2.length - 1];
  svg.append(
    s("polyline", { points: P2.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ") }),
    s("circle", { class: "route-start", cx: P2[0][0].toFixed(1), cy: P2[0][1].toFixed(1), r: 5 }),
    s("circle", { class: "route-end", cx: last[0].toFixed(1), cy: last[1].toFixed(1), r: 6 }));
  return svg;
}
function updateTracker() {
  const T = tracker;
  if (!T) return;
  const n = T.nodes;
  const sec = Math.floor(trackElapsed(T) / 1000);
  const km = T.dist / 1000;
  if (n.dist) n.dist.textContent = `${km.toFixed(2).replace(".", ",")} км`;
  if (n.time) n.time.textContent = mmss(sec);
  if (n.pace) n.pace.textContent = km >= 0.05 ? paceText(sec / 60, km) : "— мин/км";
  if (n.msg) n.msg.textContent = T.msg;
  if (n.route && T.pts.length >= 2 && T.pts.length !== n.routeLen) {
    n.routeLen = T.pts.length;
    n.route.replaceChildren(routeSvg(T.pts));
  }
}
function trackerPause() {
  const T = tracker;
  if (T.paused) {
    T.pausedTotal += Date.now() - T.pausedAt;
    T.paused = false;
    T.last = null;
  } else {
    T.paused = true;
    T.pausedAt = Date.now();
  }
  renderTracker();
}
function stopTracker() {
  const T = tracker;
  if (!T) return;
  if (T.watch !== null) { try { navigator.geolocation.clearWatch(T.watch); } catch (e) { /* уже остановлено */ } }
  clearInterval(T.timer);
  keepAwake(false);
  T.el.remove();
  tracker = null;
  app.inert = false;
  document.documentElement.classList.remove("no-scroll");
}
async function finishTracker() {
  const T = tracker;
  if (T.paused) trackerPause();
  const mins = Math.round(trackElapsed(T) / 60000);
  const km = Math.round(T.dist / 10) / 100;
  if (mins < 1 && km < 0.05) {
    const ok = await confirmSheet({ title: "Сохранить нечего", message: "Запись слишком короткая. Выйти без сохранения?", ok: "Выйти" });
    if (ok) { stopTracker(); render(); }
    return;
  }
  const kind = TRACK_KIND[T.kind];
  const now = new Date(T.startedAt);
  const day = E.dayKey(now);
  state.sessions.push({ id: newId(), d: day, hour: now.getHours(), mins: Math.max(1, mins), title: kind.title, goal: "activity", mode: "normal", rpe: 0, count: 0, pains: [], ex: [], km });
  if (state.sessions.length > 1000) state.sessions.splice(0, state.sessions.length - 1000);
  // Прогулка засчитывается в челлендж «30 дней ходьбы», если хватило минут
  let extra = "";
  if (own(state.challenges, "walk30") && T.kind === "walk") {
    const cs = E.challengeState(state, "walk30");
    if (!cs.finished && !cs.doneToday && !cs.rest && mins >= cs.target) {
      const ch = state.challenges.walk30;
      if (!ch.done.includes(cs.day)) ch.done = ch.done.concat(cs.day).sort((a, b) => a - b);
      ch.last = day;
      extra = ` День ${cs.day} челленджа засчитан.`;
    }
  }
  const nb = E.newBadges(state);
  persist();
  requestPersistence();
  stopTracker();
  render();
  confetti();
  toast(nb.length ? badgeToast(nb) : `${kind.title}: ${fmtNum(km)} км за ${Math.max(1, mins)} мин — записано в дневник.${extra}`);
}
async function cancelTracker() {
  const T = tracker;
  if (T.status === "running" && (T.dist > 20 || trackElapsed(T) > 60000)) {
    const ok = await confirmSheet({ title: "Выйти без сохранения?", message: "Записанный маршрут не сохранится.", ok: "Выйти", danger: true });
    if (!ok) return;
  }
  stopTracker();
  render();
}
function renderTracker() {
  const T = tracker;
  const n = T.nodes;
  n.dist = h("div", { class: "big-timer track-dist", "aria-live": "off" });
  n.time = h("b", {});
  n.pace = h("b", {});
  n.msg = h("p", { class: "player-dose", "aria-live": "polite" });
  n.route = h("div", { class: "route-box" });
  n.routeLen = 0;
  const top = h("div", { class: "player-top" },
    h("button", { class: "icon-btn", type: "button", "aria-label": "Закрыть", onClick: cancelTracker }, icon("close", 20)),
    h("p", { class: "track-title", text: T.status === "idle" ? "Запись маршрута" : `${TRACK_KIND[T.kind].title} · GPS` }));
  const card = h("section", { class: "player-card glass tracker-card" },
    T.status === "idle" ? h("div", { class: "q" }, h("b", { text: "Что записываем?" }),
      choice({ className: "seg", label: "Вид активности", value: T.kind, options: [{ value: "walk", label: "Прогулка" }, { value: "run", label: "Бег" }], onChange: v => { T.kind = v; } })) : null,
    n.dist,
    h("div", { class: "track-stats" },
      h("span", {}, h("span", { class: "muted small", text: "время" }), n.time),
      h("span", {}, h("span", { class: "muted small", text: "темп" }), n.pace)),
    n.msg,
    n.route,
    h("p", { class: "muted small", text: "Держите экран включённым: в фоне браузер не записывает маршрут. Координаты не сохраняются — в дневник попадут только дистанция и время." }));
  let controls;
  if (T.status === "idle") {
    controls = h("div", { class: "player-controls track-controls" },
      h("button", { class: "btn primary", type: "button", onClick: trackerBegin }, icon("play", 18), "Старт"));
  } else {
    controls = h("div", { class: "player-controls track-controls" },
      h("button", { class: "btn ghost", type: "button", onClick: trackerPause }, icon(T.paused ? "play" : "pause", 18), T.paused ? "Продолжить" : "Пауза"),
      h("button", { class: "btn primary", type: "button", onClick: finishTracker }, icon("check", 18), "Завершить"));
  }
  T.el.replaceChildren(top, h("div", { class: "player-main" }, card), controls);
  updateTracker();
}

const CHALLENGE_BY_ID = Object.fromEntries(CHALLENGES.map(c => [c.id, c]));
function closePlayer(rerender = true) {
  if (!player) return;
  clearInterval(player.timer);
  keepAwake(false);
  try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch (e) { /* голос недоступен */ }
  player.el.remove();
  player = null;
  app.inert = false;
  document.documentElement.classList.remove("no-scroll");
  if (rerender) render();
}

function startInterval() {
  const steps = [];
  for (let r = 1; r <= timerCfg.rounds; r++) {
    steps.push({ type: "work", sec: timerCfg.work, round: r, rounds: timerCfg.rounds });
    if (timerCfg.rest && r < timerCfg.rounds) steps.push({ type: "rest", sec: timerCfg.rest });
  }
  startPlayer({ kind: "timer", title: "Интервальный таймер", goal: "timer", mode: "normal" }, steps);
}

boot();
