// ===== Листопульс: приложение «Тренер, который слушает тело» =====
// Одностраничное приложение без сервера: всё считается и хранится на устройстве.
import { h, s, icon, toast, sheet, confirmSheet, choice, toggle, ring, unlockAudio, beep, buzz, speak, keepAwake, confetti, download, mmss, fmtDate } from "./ui.js";
import * as store from "./store.js";
import {
  REGIONS, REGION_GROUPS, SIDES, HOTSPOTS, SEVERITY, SYMPTOMS, ONSET, TRIGGERS, CONDITIONS, AGE_GROUPS, GOALS, LEVELS,
  EQUIPMENT, WEIGHT_EQUIP, GROUPS, EXERCISES, EX, QUICK, PROGRAMS, RECORD_EX, BADGES, TIPS, RED_FLAGS, SCREENING
} from "./data.js";
import { GUIDE, GUIDE_AREAS, GUIDE_BY_ID } from "./guide.js";
import { webglSupported, createFigure } from "./body3d.js";
import * as E from "./engine.js";

const VERSION = "1.2.0";
const app = document.getElementById("app");
const REGION = Object.fromEntries(REGIONS.map(r => [r.id, r]));
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clean = (v, max) => String(v || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(36).padStart(2, "0")).join("").slice(0, 12);

let state = null;
let started = false;
let lastRoute = "";
let installPrompt = null;
let player = null;
const postRender = []; // действия после вставки экрана в документ (например, размер 3D-сцены)

// ===== 3D-модель =====
// Один WebGL-контекст на всё приложение: сцена переносится между экранами, а не создаётся заново
let figure = null;
let figureFailed = false;
let figureMode = "rotate";
function getFigure() {
  if (figure || figureFailed) return figure;
  if (!webglSupported()) { figureFailed = true; return null; }
  try {
    figure = createFigure({
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
function paintFigure() {
  if (!figure || !state) return;
  const dark = isDark();
  figure.setTheme({ rim: dark ? [0.3, 0.87, 0.5] : [0.09, 0.64, 0.29], amb: dark ? 0.3 : 0.4 });
  const base = dark ? [0.55, 0.62, 0.6] : [0.86, 0.91, 0.89];
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
  if (e.key !== null && e.key !== "lpapp-v1") return;
  if (!state || player) return;
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
  document.documentElement.classList.toggle("less-glass", !!(state && state.settings.lessGlass));
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
  applyGlass();
  if (!started) {
    started = true;
    window.addEventListener("hashchange", () => render());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", () => { flush(); });
    window.addEventListener("storage", onStorage);
    try { window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintFigure); } catch (e) { /* старый браузер */ }
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
  if (player) keepAwake(true);
  if (state && store.isEncrypted() && hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000 && !player) lockNow();
  hiddenAt = 0;
}

async function lockNow() {
  if (player) closePlayer(false);
  await flush();
  store.forgetKey();
  state = null;
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
const ROUTES = { today: viewToday, workout: viewWorkout, body: viewBody, journal: viewJournal, more: viewMore, guide: viewGuide, program: viewProgram, builder: viewBuilder };
const TAB_OF = { guide: "body", program: "workout", builder: "workout" };
const TABS = [["today", "Сегодня", "today"], ["workout", "Тренировка", "workout"], ["body", "Тело", "body"], ["journal", "Дневник", "journal"], ["more", "Ещё", "more"]];

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
  app.replaceChildren(h("div", { class: "shell" }, topbar(), main), tabbar(TAB_OF[name] || name));
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
  return h("nav", { class: "tabbar glass-clear", "aria-label": "Разделы" },
    TABS.map(([id, label, ic]) => h("a", { class: "tab", href: `#${id}`, "aria-current": id === active ? "page" : null }, icon(ic, 22), h("span", { text: label }))));
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
function viewToday() {
  const d = E.dayKey();
  const r = E.restrictions(state, d);
  const ci = state.checkins.find(c => c.d === d);
  return [
    h("p", { class: "eyebrow", text: fmtDate(d, { weekday: "long", day: "numeric", month: "long" }) }),
    h("h1", { class: "page-title", text: greeting() }),
    r.acute.length ? acuteCard(r) : null,
    ci ? readinessCard(ci) : checkinCard(),
    planCard(currentPlan(), r, state.sessions.filter(x => x.d === d)),
    weekCard(),
    waterCard(),
    h("section", { class: "card glass" }, h("p", { class: "eyebrow", text: "Совет тренера" }), h("p", { text: TIPS[dayIndex() % TIPS.length] }))
  ];
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

function checkinCard() {
  const draft = { sleep: 3, energy: 3, soreness: 2, stress: 2, pain: [] };
  return h("section", { class: "card glass" },
    h("p", { class: "eyebrow", text: "Отметка дня" }),
    h("h2", { text: "Как вы сегодня?" }),
    h("p", { class: "muted small", text: "30 секунд — и тренировка подстроится под ваше состояние." }),
    SCALES.map(sc => h("div", { class: "q" },
      h("b", { text: sc.q }),
      choice({
        className: "scale", label: sc.q, value: draft[sc.key],
        options: [1, 2, 3, 4, 5].map(v => ({ value: v, label: sc.up ? FACES[v - 1] : FACES[5 - v], aria: `${v} из 5` })),
        onChange: v => { draft[sc.key] = v; }
      }),
      h("div", { class: "scale-labels" }, h("span", { text: sc.lo }), h("span", { text: sc.hi })))),
    h("div", { class: "q" },
      h("b", { text: "Что-то болит сегодня?" }),
      painPicker(draft)),
    h("button", {
      class: "btn primary block", type: "button", text: "Сохранить",
      onClick: () => {
        const entry = { d: E.dayKey(), sleep: draft.sleep, energy: draft.energy, soreness: draft.soreness, stress: draft.stress, pain: draft.pain.slice() };
        entry.score = E.readinessScore(entry);
        state.checkins = state.checkins.filter(c => c.d !== entry.d).concat(entry).slice(-400);
        if (state.modeOverride && state.modeOverride.d === entry.d) state.modeOverride = null;
        const nb = E.newBadges(state);
        persist();
        refresh();
        toast(nb.length ? badgeToast(nb) : `Режим на сегодня: ${E.MODES[currentPlan().mode].name.toLowerCase()}`);
      }
    }));
}

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

function readinessCard(ci) {
  const mode = currentPlan().mode; // с учётом острой боли: тогда режим всегда щадящий
  const acute = mode !== E.currentMode(state);
  return h("section", { class: "card glass" },
    h("div", { class: "split" },
      ring(ci.score, 100, { size: 104, stroke: 10, label: String(ci.score), sub: "готовность" }),
      h("div", {},
        h("p", { class: "eyebrow", text: "Самочувствие" }),
        h("h2", { text: `Режим: ${E.MODES[mode].name.toLowerCase()}` }),
        h("p", { class: "muted small", text: acute ? "Из-за острой боли тренировка сегодня щадящая." : E.MODES[mode].desc }),
        ci.pain.length ? h("p", { class: "small", text: `Сегодня бережём: ${ci.pain.map(id => REGION[id].name.toLowerCase()).join(", ")}` }) : null,
        h("button", { class: "link-btn small", type: "button", text: "Изменить отметку", onClick: () => { state.checkins = state.checkins.filter(c => c.d !== ci.d); persist(); refresh(); } }))));
}

function planCard(plan, r, done) {
  if (plan.blocked) {
    return h("section", { class: "card glass warn" },
      h("p", { class: "eyebrow", text: "Тренировка на сегодня" }),
      h("h2", { text: plan.title }),
      h("ul", { class: "adapt" }, plan.notes.map(n => h("li", { class: "note", text: n }))),
      h("div", { class: "btn-row" }, h("a", { class: "btn ghost", href: "#more/breath", text: "Дыхательная практика" })));
  }
  return h("section", { class: "card glass" },
    h("p", { class: "eyebrow", text: "Тренировка на сегодня" }),
    h("h2", { text: plan.title }),
    h("p", { class: "muted", text: `≈ ${plan.est} мин · ${plan.count} ${E.plural(plan.count, "подход", "подхода", "подходов")}` }),
    r.reasons.length ? h("div", { class: "tags" },
      h("span", { class: "pill", text: "Учтено" }),
      r.reasons.slice(0, 4).map(x => h("span", { class: "pill muted-pill", text: x })),
      r.reasons.length > 4 ? h("span", { class: "pill muted-pill", text: `+${r.reasons.length - 4}` }) : null) : null,
    done.length ? h("p", { class: "small", style: { marginTop: "10px" }, text: "Сегодня тренировка уже есть — отличная работа! Можно отдохнуть или сделать растяжку перед сном." }) : null,
    h("div", { class: "btn-row" },
      h("button", { class: "btn primary", type: "button", onClick: () => startPlayer(plan) }, icon("play", 18), "Начать"),
      h("a", { class: "btn ghost", href: "#workout", text: "Смотреть план" })));
}

function weekCard() {
  const mins = E.weekMinutes(state);
  const st = E.streak(state);
  return h("section", { class: "card glass" },
    h("div", { class: "split" },
      ring(mins, 150, { size: 104, stroke: 10, label: String(mins), sub: "из 150 мин" }),
      h("div", {},
        h("p", { class: "eyebrow", text: "Неделя" }),
        h("h2", { text: mins >= 150 ? "Норма ВОЗ выполнена!" : `Ещё ${150 - mins} мин до нормы ВОЗ` }),
        h("p", { class: "muted small", text: "ВОЗ советует взрослым 150–300 минут умеренной активности в неделю. Прогулки тоже считаются — добавьте их в дневник." }),
        st ? h("p", { class: "small" }, h("b", { text: `Серия: ${st} ${E.plural(st, "день", "дня", "дней")} подряд 🔥` })) : null,
        h("button", { class: "btn small ghost", type: "button", text: "+ Добавить активность", onClick: addActivitySheet }))));
}

function waterCard() {
  const goal = 8;
  let count = state.water.d === E.dayKey() ? state.water.n : 0;
  const label = h("p", { class: "muted small", style: { marginTop: "10px" } });
  const btns = [];
  const update = () => {
    btns.forEach((b, i) => b.setAttribute("aria-pressed", i < count ? "true" : "false"));
    label.textContent = count >= goal ? "8 стаканов — водный баланс в норме!" : `Выпито ${count} из ${goal} стаканов · ${(count * 0.25).toLocaleString("ru-RU")} л`;
  };
  for (let i = 0; i < goal; i++) {
    const b = h("button", { class: "glass-btn", type: "button", "aria-label": `Стакан ${i + 1}` });
    b.addEventListener("click", () => {
      const before = count;
      count = count === i + 1 ? i : i + 1;
      state.water = { d: E.dayKey(), n: count };
      update();
      if (count >= goal && before < goal) {
        const nb = E.newBadges(state);
        confetti();
        toast(nb.length ? badgeToast(nb) : "Водный баланс — в норме!");
      }
      persist();
    });
    btns.push(b);
  }
  update();
  return h("section", { class: "card glass" },
    h("p", { class: "eyebrow", text: "Вода" }),
    h("h2", { text: "Стаканы на сегодня" }),
    h("div", { class: "glasses", role: "group", "aria-label": "Стаканы воды по 250 мл" }, btns),
    label);
}

// ===== Тренировка =====
const WORKOUT_TABS = [["", "План"], ["ready", "Готовые"], ["programs", "Программы"], ["mine", "Мои"]];
function workoutTabs(active) {
  return h("nav", { class: "seg sub-tabs", "aria-label": "Разделы тренировок" },
    WORKOUT_TABS.map(([id, label]) => h("a", { class: "chip", href: id ? `#workout/${id}` : "#workout", "aria-current": id === active ? "page" : null }, label)));
}
const fmtKg = kg => (kg === null || kg === undefined ? "— кг" : `${String(kg).replace(".", ",")} кг`);
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

function viewWorkout(sub) {
  const tab = WORKOUT_TABS.some(([id]) => id === sub) ? sub : "";
  const head = [h("h1", { class: "page-title", text: "Тренировка" }), workoutTabs(tab)];
  if (tab === "ready") return [...head, ...readyWorkouts()];
  if (tab === "programs") return [...head, ...programsSection()];
  if (tab === "mine") return [...head, ...myWorkouts()];
  return [...head, ...planView()];
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
function readyWorkouts() {
  return [
    h("p", { class: "lead", text: "Комплексы на любой случай. Неподходящие вам упражнения тренер заменит безопасными." }),
    h("h2", { class: "section-title", text: "Без инвентаря и с лёгким" }),
    h("div", { class: "quick" }, QUICK.filter(q => q.cat !== "weights").map(quickCard)),
    h("h2", { class: "section-title", text: "С весами" }),
    h("p", { class: "muted small", style: { margin: "-4px 0 12px" }, text: "Гантели, гиря или штанга. Отметьте свой инвентарь в профиле — тогда упражнения не придётся заменять." }),
    h("div", { class: "quick" }, QUICK.filter(q => q.cat === "weights").map(quickCard)),
    h("h2", { class: "section-title", text: "Испытай себя" }),
    h("div", { class: "quick" },
      h("a", { class: "quick-item glass", href: "#more/records" },
        h("span", { class: "fi" }, icon("trophy", 20)),
        h("span", { class: "row-text" }, h("b", { text: "Рекорды статики" }), h("span", { class: "muted small", text: "Сколько продержитесь в планке или «стульчике»?" })),
        icon("chevron", 18)),
      h("a", { class: "quick-item glass", href: "#more/weights" },
        h("span", { class: "fi" }, icon("chart", 20)),
        h("span", { class: "row-text" }, h("b", { text: "Рабочие веса" }), h("span", { class: "muted small", text: "Как растут ваши веса по упражнениям" })),
        icon("chevron", 18))),
    h("p", { class: "center", style: { marginTop: "18px" } }, h("a", { href: "#more/library", text: `Библиотека: ${EXERCISES.length} ${E.plural(EXERCISES.length, "упражнение", "упражнения", "упражнений")} →` }))
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
    actions: close => [h("button", { class: "btn primary", type: "button", onClick: () => { close(); startPlayer(s); } }, icon("play", 18), "Начать")]
  });
}

// ----- Свои тренировки -----
const customSession = w => E.buildCustom(state, { title: w.name, ids: w.items, rounds: w.rounds, rest: w.rest, kind: "custom", goal: "custom" });
function myWorkouts() {
  const list = state.custom;
  return [
    h("p", { class: "lead", text: "Соберите тренировку из любых упражнений библиотеки. Тренер всё равно проверит её на безопасность и заменит то, что вам сейчас нельзя." }),
    h("div", { class: "btn-row", style: { margin: "0 0 16px" } }, h("a", { class: "btn primary", href: "#builder" }, icon("plus", 18), "Собрать тренировку")),
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
  sheet({
    title: ex.name,
    body: [
      h("div", { class: "tags" },
        h("span", { class: "pill", text: GROUPS[ex.group] }),
        h("span", { class: "pill muted-pill", text: LEVELS[ex.level - 1].name }),
        ex.equip.map(e => h("span", { class: "pill muted-pill", text: equipName(e) }))),
      h("p", { style: { marginTop: "12px" }, text: `Обычная доза: ${E.doseText(E.makeItem(ex, 1))}` }),
      ex.weighted ? h("p", { class: "small", text: state.weights[id]
        ? `Рабочий вес: ${fmtKg(state.weights[id].kg)}${state.weights[id].d ? ` (${fmtDate(state.weights[id].d)})` : ""}, лучший — ${fmtKg(state.weights[id].best)}.`
        : "Вес подбирайте так, чтобы последние 2–3 повтора давались тяжело, но без потери техники. В плеере его можно записать." }) : null,
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

function bodyStage() {
  const fig = getFigure();
  if (!fig) {
    return [bodyMap(), h("p", { class: "muted small center", text: "Объёмная модель не поддерживается этим браузером, поэтому показана простая карта. Все зоны есть в списке ниже." })];
  }
  fig.setMode(figureMode);
  const hint = h("p", { class: "stage-hint", "aria-live": "polite", text: STAGE_HINT[figureMode] });
  const mode = choice({
    className: "seg stage-mode", label: "Режим работы с моделью", value: figureMode,
    options: [{ value: "rotate", label: "Вращать" }, { value: "lasso", label: "✎ Обвести" }],
    onChange: v => { figureMode = v; fig.setMode(v); hint.textContent = STAGE_HINT[v]; }
  });
  const tool = (ic, label, fn) => h("button", { class: "icon-btn", type: "button", "aria-label": label, title: label, onClick: fn }, icon(ic, 18));
  postRender.push(() => { fig.resize(); paintFigure(); fig.intro(); });
  return h("div", { class: "stage" },
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
    h("div", { class: "legend" },
      [1, 2, 3].map(v => h("span", { class: `pill sev-${v}`, text: SEVERITY[v].name })),
      h("span", { class: "pill sel-pill", text: "выделение" })),
    h("p", { class: "muted small center", text: "Модель стоит к вам лицом: её правая сторона — слева от вас." }));
}

function viewBody() {
  const r = E.restrictions(state);
  const caution = state.profile.conditions.includes("caution");
  const cautionNote = CONDITIONS.find(c => c.id === "caution").notes[0];
  const notes = [...new Set(r.notes)];
  return [
    h("h1", { class: "page-title", text: "Тело" }),
    h("p", { class: "lead", text: "Коснитесь зоны на модели или обведите место, которое болит, — тренер уберёт опасные упражнения и подскажет, что делать. Данные остаются на этом устройстве." }),
    h("section", { class: "card glass stage-card" }, bodyStage()),
    marksCard(),
    painCard(),
    regionsCard(r),
    guideCard(),
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
      notes.length ? h("ul", { class: "adapt", style: { marginTop: "14px" } }, notes.map(n => h("li", { class: "note", text: n }))) : null),
    h("section", { class: "card glass" },
      h("h2", { text: "Возраст" }),
      choice({ label: "Возраст", value: state.profile.ageGroup, options: AGE_GROUPS.map(a => ({ value: a.id, label: a.name })), onChange: v => { state.profile.ageGroup = v; persist(); refresh(); } })),
    h("section", { class: "card glass alert" },
      h("h2", { text: "Когда сразу остановиться" }),
      h("ul", { class: "bullets" }, RED_FLAGS.map(t => h("li", { text: t }))),
      h("p", {}, h("b", { text: "Боль в груди, обморок, сильная одышка — звоните 112." }))),
    h("section", { class: "card glass" },
      h("h2", { text: "Как работает тренер" }),
      h("ul", { class: "bullets" },
        h("li", { text: "«Дискомфорт» убирает упражнения с заметной нагрузкой на зону, «ограничение» и «острая боль» — все упражнения, которые её нагружают." }),
        h("li", { text: "Обведённая область работает так же: тренер учитывает каждую зону внутри обводки." }),
        h("li", { text: "Особенности здоровья исключают опасные типы нагрузки: прыжки, высокую интенсивность, положения вниз головой и другие." }),
        h("li", { text: "Кнопка «Больно» во время тренировки сразу заменяет упражнение и 7 дней бережёт эту зону." }),
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
function guideCard() {
  const mine = guideFor(trackedRegions());
  return h("section", { class: "card glass" },
    h("p", { class: "eyebrow", text: "Справочник" }),
    h("h2", { text: "Травмы и боль: что делать" }),
    h("p", { class: "muted small", text: `${GUIDE.length} ${E.plural(GUIDE.length, "статья", "статьи", "статей")}: первая помощь, когда идти к врачу и как вернуться к нагрузке. По открытым рекомендациям NHS, NICE и консенсусам спортивных врачей.` }),
    mine.length ? h("div", { class: "list" }, mine.slice(0, 3).map(a => guideRow(a))) : null,
    h("div", { class: "btn-row" }, h("a", { class: "btn primary", href: "#guide" }, icon("book", 18), "Открыть справочник")));
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

function viewJournal() {
  const days = E.minutesByDay(state, 7);
  const w = weekStats();
  const max = Math.max(30, ...days.map(x => x.mins));
  const total = state.sessions.reduce((a, x) => a + x.mins, 0);
  const week = E.weekMinutes(state);
  const recent = state.checkins.filter(c => c.d >= E.shiftDay(E.dayKey(), -13));
  const pains = state.sessions.slice().reverse().flatMap(x => x.pains.map(p => ({ d: x.d, ex: p.ex, region: p.region }))).slice(0, 8);
  const hist = state.sessions.slice(-40).reverse();
  return [
    h("div", { class: "card-head" },
      h("h1", { class: "page-title", text: "Дневник" }),
      h("button", { class: "btn small primary", type: "button", onClick: addActivitySheet, text: "+ Активность" })),
    h("p", { class: "lead", text: "Тренировки, прогулки, самочувствие и награды." }),
    h("section", { class: "card glass" }, h("div", { class: "stats" },
      stat(state.sessions.length, E.plural(state.sessions.length, "занятие", "занятия", "занятий")),
      stat(total, E.plural(total, "минута всего", "минуты всего", "минут всего")),
      stat(E.streak(state), E.plural(E.streak(state), "день подряд", "дня подряд", "дней подряд")))),
    h("section", { class: "card glass" },
      h("div", { class: "card-head" },
        h("h2", { text: "Последние 7 дней" }),
        h("button", { class: "btn small ghost", type: "button", onClick: () => shareText(weekShareText()) }, icon("share", 16), "Поделиться")),
      h("p", { class: "muted small", text: `${week} мин из 150 рекомендованных ВОЗ · ${w.workouts} ${E.plural(w.workouts, "тренировка", "тренировки", "тренировок")}${w.avg !== null ? ` · средняя готовность ${w.avg}` : ""}` }),
      h("div", { class: "bars", role: "img", "aria-label": days.map(x => `${fmtDate(x.d, { weekday: "short" })}: ${x.mins} мин`).join(", ") },
        days.map(x => h("div", { class: `bar${x.mins ? "" : " zero"}` },
          x.mins ? h("small", { text: String(x.mins) }) : null,
          h("i", { style: { height: `${Math.max(4, Math.round((x.mins / max) * 96))}px` } }),
          h("span", { text: fmtDate(x.d, { weekday: "short" }) }))))),
    recent.length >= 2 ? h("section", { class: "card glass" },
      h("h2", { text: "Готовность за 2 недели" }),
      h("p", { class: "muted small", text: "По отметкам самочувствия: чем выше, тем лучше сон, энергия и восстановление." }),
      sparkline(recent)) : null,
    painCard(),
    pains.length ? h("section", { class: "card glass" },
      h("h2", { text: "Сигналы боли" }),
      h("div", { class: "list" }, pains.map(p => h("div", { class: "row" },
        h("span", { class: "row-text" }, h("b", { text: REGION[p.region].name }), h("span", { class: "muted small", text: `${fmtDate(p.d)} · ${EX[p.ex].name}` }))))),
      h("p", { class: "muted small", text: "Если одна и та же зона болит снова и снова — покажитесь врачу или реабилитологу." })) : null,
    h("section", { class: "card glass" },
      h("h2", { text: "Награды" }),
      h("div", { class: "badges" }, BADGES.map(b => h("div", { class: `badge${state.badges[b.id] ? "" : " locked"}` },
        h("span", { class: "b-icon", "aria-hidden": "true", text: b.icon }),
        h("b", { text: b.name }),
        h("span", { text: state.badges[b.id] ? fmtDate(state.badges[b.id]) : b.desc }))))),
    h("section", { class: "card glass" },
      h("h2", { text: "История" }),
      hist.length ? h("div", { class: "list" }, hist.map(x => h("div", { class: "row" },
        h("span", { class: "row-text" },
          h("b", { text: x.title || "Тренировка" }),
          h("span", { class: "muted small", text: `${fmtDate(x.d)} · ${x.mins} мин${x.rpe ? ` · тяжесть ${x.rpe}/10` : ""}` })),
        x.pains.length ? h("span", { class: "pill sev-2", text: "боль" }) : null)))
        : h("p", { class: "muted", text: "Пока пусто. Первая тренировка — на вкладке «Сегодня»." }))
  ];
}

// ===== Ещё =====
const MORE = [
  ["guide", "aid", "Справочник травм", `${GUIDE.length} ${E.plural(GUIDE.length, "статья", "статьи", "статей")}: что делать при травмах`, "#guide"],
  ["library", "book", "Упражнения", `${EXERCISES.length} ${E.plural(EXERCISES.length, "упражнение", "упражнения", "упражнений")} с подсказками`],
  ["records", "trophy", "Рекорды статики", "Планка, «стульчик», мостик"],
  ["weights", "chart", "Рабочие веса", "Журнал весов по упражнениям"],
  ["builder", "puzzle", "Конструктор", "Своя тренировка из любых упражнений", "#workout/mine"],
  ["timer", "timer", "Интервальный таймер", "Работа и отдых по кругу"],
  ["breath", "wind", "Дыхание", "Спокойствие за пару минут"],
  ["calendar", "calendar", "Напоминания", "Тренировки в календаре телефона"],
  ["profile", "user", "Профиль и цели", "Цель, уровень, инвентарь"],
  ["settings", "sliders", "Настройки", "Тема, звук, голос, стекло"],
  ["data", "shield", "Данные и защита", "Пароль, копия, удаление"],
  ["install", "phone", "Установить", "Иконка на главном экране"],
  ["about", "doc", "О приложении", "Правила и безопасность"]
];
const SUB = { library: subLibrary, records: subRecords, weights: subWeights, timer: subTimer, breath: subBreath, calendar: subCalendar, profile: subProfile, settings: subSettings, data: subData, install: subInstall, about: subAbout };

function viewMore(sub) {
  if (sub && own(SUB, sub)) return [h("a", { class: "back-link", href: "#more" }, icon("back", 18), "Ещё"), ...SUB[sub]()];
  return [
    h("h1", { class: "page-title", text: "Ещё" }),
    h("p", { class: "lead", text: "Инструменты, настройки и защита данных." }),
    h("div", { class: "menu-grid" }, MORE.map(([id, ic, title, desc, href]) => h("a", { class: "menu-item glass", href: href || `#more/${id}` },
      h("span", { class: "fi" }, icon(ic, 22)), h("b", { text: title }), h("span", { text: desc })))),
    h("p", { class: "muted small center", style: { marginTop: "18px" } }, `Листопульс ${VERSION} · 12+ · `, h("a", { href: "../index.html", text: "сайт о здоровье" }))
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
  const time = h("input", { class: "input", type: "time", value: "19:00" });
  const err = h("p", { class: "error", role: "alert" });
  return [
    h("h1", { class: "page-title", text: "Напоминания" }),
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
      h("h2", { text: "Анкета безопасности" }),
      h("p", { class: "muted small", text: "Здоровье изменилось? Пройдите знакомство заново — ответы обновят бережный режим. Тренировки и дневник сохранятся." }),
      h("button", {
        class: "btn ghost", type: "button", text: "Пройти знакомство заново",
        onClick: () => { p.onboarded = false; onb = null; onbStep = 0; persist(); render(); }
      }))
  ];
}

function subSettings() {
  const st = state.settings;
  return [
    h("h1", { class: "page-title", text: "Настройки" }),
    h("section", { class: "card glass" },
      h("div", { class: "q" }, h("b", { text: "Тема" }),
        choice({ className: "seg", label: "Тема", value: store.getTheme(), options: [{ value: "auto", label: "Как в системе" }, { value: "light", label: "Светлая" }, { value: "dark", label: "Тёмная" }], onChange: v => { store.setTheme(v); applyTheme(v); } }))),
    h("section", { class: "card glass" }, h("div", { class: "list" },
      toggle({ label: "Звуковые сигналы", desc: "Смена упражнений и отсчёт 3-2-1", checked: st.sound, onChange: v => { st.sound = v; persist(); } }),
      toggle({ label: "Голосовые подсказки", desc: "Название упражнения и отдых — вслух", checked: st.voice, onChange: v => { st.voice = v; persist(); if (v) speak("Голосовые подсказки включены"); } }),
      toggle({ label: "Вибрация", desc: "На телефонах с Android", checked: st.vibrate, onChange: v => { st.vibrate = v; persist(); } }),
      toggle({ label: "Меньше прозрачности", desc: "Сплошной фон вместо стекла: легче читать и бережёт батарею", checked: st.lessGlass, onChange: v => { st.lessGlass = v; persist(); applyGlass(); } })))
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

function subData() {
  const enc = store.isEncrypted();
  const file = h("input", { type: "file", accept: "application/json,.json", class: "visually-hidden", "aria-label": "Файл резервной копии" });
  file.addEventListener("change", async () => {
    const f = file.files[0];
    file.value = "";
    if (!f) return;
    if (f.size > store.MAX_IMPORT_BYTES) { toast("Файл слишком большой"); return; }
    try {
      const imported = store.importJSON(await f.text());
      const ok = await confirmSheet({ title: "Загрузить копию?", message: "Данные на этом устройстве будут заменены данными из файла.", ok: "Заменить" });
      if (!ok) return;
      state = imported;
      planCache.key = "";
      persist();
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
        h("button", { class: "btn ghost", type: "button", onClick: () => download(`listopuls-${E.dayKey()}.json`, store.exportJSON(state), "application/json") }, icon("download", 18), "Сохранить копию"),
        h("button", { class: "btn ghost", type: "button", text: "Загрузить копию", onClick: () => file.click() })),
      file),
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
        h("a", { class: "row", href: "terms.html#recommendations" }, h("span", { class: "row-text" }, h("b", { text: "Как подбираются тренировки" })), icon("chevron", 18)),
        h("a", { class: "row", href: "privacy.html" }, h("span", { class: "row-text" }, h("b", { text: "Конфиденциальность" })), icon("chevron", 18)))),
    h("section", { class: "card glass" },
      h("h2", { text: "Авторские права" }),
      h("p", { class: "small", text: "Код, тексты, описания упражнений и иллюстрации созданы для Листопульса. Внешние шрифты, библиотеки и счётчики не используются." }))
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
  const entries = Object.entries(state.weights).filter(([id]) => own(EX, id)).sort((a, b) => (a[1].d < b[1].d ? 1 : a[1].d > b[1].d ? -1 : 0));
  return [
    h("h1", { class: "page-title", text: "Рабочие веса" }),
    h("p", { class: "lead", text: "Листопульс запоминает вес, с которым вы делали упражнения, и подсказывает его в следующий раз." }),
    entries.length
      ? h("section", { class: "card glass" }, h("div", { class: "list" }, entries.map(([id, w]) => {
        const first = w.hist.length ? w.hist[0][1] : w.kg;
        const grow = first ? Math.round(((w.best - first) / first) * 100) : 0;
        return h("button", { class: "row row-btn", type: "button", onClick: () => exerciseSheet(id) },
          h("span", { class: "row-text" },
            h("b", { text: EX[id].name }),
            h("span", { class: "muted small", text: `${fmtKg(w.kg)}${w.d ? ` · ${fmtDate(w.d)}` : ""}${grow > 0 ? ` · +${grow}% с начала` : ""}` })),
          w.hist.length > 1 ? weightSpark(w.hist) : null,
          h("span", { class: "pill", text: `лучший ${fmtKg(w.best)}` }));
      })))
      : h("section", { class: "card glass" }, h("p", { class: "muted", text: "Пока пусто. В плеере у упражнений с гантелями, гирей или штангой укажите вес кнопками «−» и «+» — он сохранится вместе с тренировкой." })),
    h("section", { class: "card glass" },
      h("h2", { text: "Как прибавлять вес" }),
      h("ul", { class: "bullets" },
        h("li", { text: "Работайте в диапазоне повторов, например 8–12. Сначала добавляйте повторы." }),
        h("li", { text: "Когда во всех подходах легко выходит верхняя граница — прибавьте 2,5–5% веса и вернитесь к нижней." }),
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
    h("a", { class: "back-link", href: "#body" }, icon("back", 18), "Тело"),
    h("h1", { class: "page-title", text: "Справочник травм" }),
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
    h("div", { class: "quick" }, PROGRAMS.filter(p => p.kind === "strength").map(programCard))
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
      h("section", { class: "card glass stage-card" }, bodyStage()),
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

function enterStep(i) {
  const P = player;
  P.i = i;
  P.half = false;
  P.prep = false;
  P.hold = null;
  if (i >= P.steps.length) { finishPlayer(); return; }
  const st = P.steps[i];
  const prevRest = i > 0 && P.steps[i - 1].type === "rest";
  if (st.type === "rest") {
    startCountdown(st.sec);
    say(`Отдых ${st.sec} секунд. Далее: ${nextName(i)}`);
  } else if (st.type === "work") {
    if (i === 0) { P.prep = true; startCountdown(5); say("Приготовьтесь"); }
    else { startCountdown(st.sec); say(`Работа. Раунд ${st.round}`); }
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
    P.done += 1;
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
    say(st.type === "work" ? "Работа!" : `${EX[st.item.id].name}. Начали!`);
    renderPlayer();
    return;
  }
  if (st.type === "ex" || st.type === "work") P.done += 1;
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
    if (st.type === "work") return "работа";
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
      h("p", { class: "player-block", text: "Отдых" }), timerNode(),
      h("p", { class: "player-dose", text: "Дышите спокойно, можно попить воды" }));
    controls = h("div", { class: "player-controls" },
      h("button", { class: "btn ghost", type: "button", onClick: () => { P.remaining += 15; if (P.deadline !== null) P.deadline += 15000; if (P.timerEl) P.timerEl.textContent = mmss(P.remaining); } }, "+15 с"),
      h("button", { class: "btn primary", type: "button", text: "Пропустить", onClick: () => enterStep(P.i + 1) }),
      pauseBtn("ghost"));
  } else if (st.type === "work") {
    card = h("section", { class: `player-card glass${P.prep ? " is-prep" : ""}` },
      h("p", { class: "player-block", text: `Раунд ${st.round} из ${st.rounds}` }),
      h("h1", { class: "player-ex", text: P.prep ? "Приготовьтесь" : "Работа" }),
      timerNode());
    controls = h("div", { class: "player-controls" },
      h("span"),
      pauseBtn("primary"),
      h("button", { class: "btn ghost", type: "button", "aria-label": "Следующий этап", onClick: () => { if (!P.prep) P.done += 1; enterStep(P.i + 1); } }, icon("next", 18)));
  } else {
    const ex = EX[st.item.id];
    const blockInfo = `${st.block}${st.sets ? ` · подход ${st.set} из ${st.sets}` : st.rounds > 1 ? ` · круг ${st.round} из ${st.rounds}` : ""}`;
    if (isHold(st)) {
      const H = P.hold || { rep: 1, side: 1, phase: "prep" };
      const n = st.item.reps;
      const sideText = ex.side ? ` · ${H.side === 1 ? "первая" : "вторая"} сторона` : "";
      card = h("section", { class: `player-card glass hold-card is-${H.phase}` },
        h("p", { class: "player-block", text: blockInfo }),
        h("h1", { class: "player-ex", text: ex.name }),
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
      else main = [h("div", { class: "big-reps", text: `×${st.item.reps}` }), h("p", { class: "player-dose", text: ex.side ? "на каждую сторону · нажмите «Готово», когда закончите" : "нажмите «Готово», когда закончите" }),
        ex.weighted ? weightControl(ex) : null];
      card = h("section", { class: `player-card glass${P.prep ? " is-prep" : ""}` },
        h("p", { class: "player-block", text: blockInfo }),
        h("h1", { class: "player-ex", text: ex.name }),
        main,
        h("ul", { class: "cues" }, ex.cues.map(c => h("li", { text: c }))));
      const primary = st.item.reps
        ? h("button", {
          class: "btn primary", type: "button",
          onClick: () => {
            P.done += 1;
            if (ex.weighted && P.kg[ex.id] !== null && P.kg[ex.id] !== undefined) P.used[ex.id] = P.kg[ex.id];
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

// Рабочий вес в плеере: «−» и «+», подсказка прошлого веса
function weightControl(ex) {
  const P = player;
  const prev = state.weights[ex.id];
  if (P.kg[ex.id] === undefined) P.kg[ex.id] = prev ? prev.kg : null;
  const val = h("b", { class: "w-val", "aria-live": "polite", text: fmtKg(P.kg[ex.id]) });
  const set = kg => {
    P.kg[ex.id] = E.roundWeight(kg);
    val.textContent = fmtKg(P.kg[ex.id]);
  };
  return h("div", { class: "weight-ctl" },
    h("span", { class: "muted small", text: E.weightUnit(ex) }),
    h("div", { class: "w-row" },
      h("button", {
        class: "icon-btn", type: "button", "aria-label": "Меньше вес",
        onClick: () => { const k = P.kg[ex.id]; if (k !== null) set(Math.max(0.5, k - E.weightStep(k - 0.01))); }
      }, icon("minus", 18)),
      val,
      h("button", {
        class: "icon-btn", type: "button", "aria-label": "Больше вес",
        onClick: () => { const k = P.kg[ex.id]; set(k === null ? E.startWeight(ex) : k + E.weightStep(k)); }
      }, icon("plus", 18))),
    h("span", { class: "muted small", text: prev ? `В прошлый раз ${fmtKg(prev.kg)} · лучший ${fmtKg(prev.best)}` : "Укажите вес — запомню его на следующий раз" }));
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
      h("p", { class: "muted small", text: "Заменим упражнение на безопасное и 7 дней будем беречь эту зону." }),
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
        stat(P.done, P.session.kind === "timer" ? E.plural(P.done, "раунд", "раунда", "раундов") : E.plural(P.done, "упражнение", "упражнения", "упражнений")),
        stat(P.pains.length, E.plural(P.pains.length, "сигнал боли", "сигнала боли", "сигналов боли"))),
      h("div", { class: "q", style: { textAlign: "left" } },
        h("b", { text: "Насколько было тяжело?" }),
        choice({ className: "rpe", label: "Тяжесть тренировки от 1 до 10", value: rpe, options: Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) })), onChange: v => { rpe = v; } }),
        h("div", { class: "scale-labels" }, h("span", { text: "очень легко" }), h("span", { text: "на пределе" }))),
      zones.length ? h("p", { class: "small", style: { textAlign: "left" }, text: `Зоны «${zones.join("», «")}» будут под защитой 7 дней. Если боль не проходит — покажитесь врачу.` }) : null,
      P.session.kind === "program" && P.done ? h("p", { class: "small", style: { textAlign: "left" }, text: `Сохраните — и занятие ${P.session.programDay} программы будет засчитано.` }) : null,
      Object.keys(P.used).length ? h("p", { class: "small", style: { textAlign: "left" }, text: `Рабочие веса: ${Object.entries(P.used).map(([id, kg]) => `${EX[id].name.toLowerCase()} — ${fmtKg(kg)}`).join(", ")}. Сохраним их вместе с тренировкой.` }) : null,
      h("p", { class: "muted small", style: { textAlign: "left" }, text: "По вашей оценке тренер подстроит нагрузку в следующий раз." }),
      h("div", { class: "btn-row" },
        h("button", { class: "btn ghost", type: "button", text: "Не сохранять", onClick: () => closePlayer() }),
        h("button", { class: "btn primary", type: "button", text: "Сохранить", onClick: () => saveWorkout(rpe) })))));
  P.el.scrollTop = 0;
}

function saveWorkout(rpe) {
  const P = player;
  const start = new Date(P.startedAt);
  state.sessions.push({
    id: newId(), d: E.dayKey(start), hour: start.getHours(), mins: P.mins, title: P.session.title,
    goal: P.session.goal, mode: P.session.mode, rpe, count: P.done, pains: P.pains.slice(0, 20)
  });
  if (state.sessions.length > 1000) state.sessions.splice(0, state.sessions.length - 1000);
  if (P.session.kind === "plan") E.applyFeedback(state, rpe, P.pains.length);
  for (const [id, kg] of Object.entries(P.used)) E.recordWeight(state, id, kg, E.dayKey(start));
  if (P.session.kind === "program" && P.done) {
    const pid = P.session.program;
    const pr = own(state.programs, pid) ? state.programs[pid] : (state.programs[pid] = { start: E.dayKey(start), done: [] });
    if (!pr.done.includes(P.session.programDay)) pr.done = pr.done.concat(P.session.programDay).sort((a, b) => a - b);
  }
  const nb = E.newBadges(state);
  planCache.key = "";
  persist();
  closePlayer();
  confetti();
  toast(nb.length ? badgeToast(nb) : "Тренировка сохранена в дневник");
}

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
