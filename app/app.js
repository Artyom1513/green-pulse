// ===== Листопульс: приложение «Тренер, который слушает тело» =====
// Одностраничное приложение без сервера: всё считается и хранится на устройстве.
import { h, s, icon, toast, sheet, confirmSheet, choice, toggle, ring, unlockAudio, beep, buzz, speak, keepAwake, confetti, download, mmss, fmtDate } from "./ui.js";
import * as store from "./store.js";
import {
  REGIONS, HOTSPOTS, SEVERITY, CONDITIONS, AGE_GROUPS, GOALS, LEVELS, EQUIPMENT, GROUPS,
  EXERCISES, EX, QUICK, BADGES, TIPS, RED_FLAGS, SCREENING
} from "./data.js";
import * as E from "./engine.js";

const VERSION = "1.0.0";
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
const ROUTES = { today: viewToday, workout: viewWorkout, body: viewBody, journal: viewJournal, more: viewMore };
const TABS = [["today", "Сегодня", "today"], ["workout", "Тренировка", "workout"], ["body", "Тело", "body"], ["journal", "Дневник", "journal"], ["more", "Ещё", "more"]];

function render() {
  if (!state) return;
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
  app.replaceChildren(h("div", { class: "shell" }, topbar(), main), tabbar(name));
  window.scrollTo(0, keep ? y : 0);
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
  const key = JSON.stringify([d, state.profile, state.body, state.checkins.find(c => c.d === d) || null, state.modeOverride, variant(), state.progress.factor]);
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
      choice({ multiple: true, label: "Что болит сегодня", value: [], options: REGIONS.map(r => ({ value: r.id, label: r.name })), onChange: v => { draft.pain = v; } })),
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
function viewWorkout() {
  const plan = currentPlan();
  const p = state.profile;
  const d = E.dayKey();
  const out = [
    h("h1", { class: "page-title", text: "Тренировка" }),
    h("p", { class: "lead", text: "План собран под вашу цель, самочувствие и особенности тела. Меняйте настройки — план пересоберётся." }),
    h("section", { class: "card glass" },
      h("div", { class: "q" }, h("b", { text: "Длительность" }),
        choice({ className: "seg", label: "Длительность", value: p.minutes, options: [10, 20, 30, 45].map(m => ({ value: m, label: `${m} мин` })), onChange: v => { p.minutes = v; persist(); refresh(); } })),
      h("div", { class: "q" }, h("b", { text: "Цель" }),
        choice({ label: "Цель", value: p.goal, options: GOALS.map(g => ({ value: g.id, label: g.name })), onChange: v => { p.goal = v; persist(); refresh(); } })),
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
    out.push(h("section", { class: "card glass" },
      h("div", { class: "block-head" },
        h("h3", { text: b.name }),
        b.rounds > 1 ? h("span", { class: "pill", text: `${b.rounds} ${E.plural(b.rounds, "круг", "круга", "кругов")}` }) : null),
      b.items.map(it => {
        num += 1;
        const ex = EX[it.id];
        return h("div", { class: "ex-row" },
          h("span", { class: "ex-num", text: String(num) }),
          h("div", { class: "row-text" }, h("b", { text: ex.name }), h("span", { class: "muted small", text: E.doseText(it) })),
          h("button", { class: "icon-btn", type: "button", "aria-label": `Подробнее: ${ex.name}`, onClick: () => exerciseSheet(ex.id) }, icon("info", 20)));
      })));
  }
  if (!plan.blocked && plan.rest > 10) out.push(h("p", { class: "muted small center", text: `≈ ${plan.est} мин · отдых между упражнениями основной части — ${plan.rest} сек` }));

  out.push(h("div", { class: "btn-row" },
    h("button", { class: "btn primary", type: "button", onClick: () => startPlayer(plan) }, icon("play", 18), plan.blocked ? "Начать дыхание" : "Начать тренировку"),
    plan.blocked ? null : h("button", {
      class: "btn ghost", type: "button",
      onClick: () => { state.planVariant = { d, n: variant() + 1 }; persist(); refresh(); toast("Собрали другой вариант"); }
    }, icon("refresh", 18), "Другой вариант")));

  out.push(
    h("h2", { class: "section-title", text: "Короткие тренировки" }),
    h("div", { class: "quick" }, QUICK.map(q => h("button", { class: "quick-item glass", type: "button", onClick: () => quickSheet(q.id) },
      h("span", { class: "fi" }, icon("bolt", 20)),
      h("span", { class: "row-text" }, h("b", { text: q.name }), h("span", { class: "muted small", text: q.desc })),
      icon("chevron", 18)))),
    h("p", { class: "center", style: { marginTop: "18px" } }, h("a", { href: "#more/library", text: "Библиотека упражнений →" })));
  return out;
}

function quickSheet(id) {
  const q = E.buildQuick(state, id);
  const items = q.blocks.flatMap(b => b.items);
  const close = sheet({
    title: q.title,
    body: [
      h("p", { class: "muted", text: q.blocked ? "Сейчас тренировки на паузе — доступна только дыхательная практика." : `≈ ${q.est} мин · упражнения идут друг за другом` }),
      items.map((it, i) => h("div", { class: "ex-row" },
        h("span", { class: "ex-num", text: String(i + 1) }),
        h("div", { class: "row-text" }, h("b", { text: EX[it.id].name }), h("span", { class: "muted small", text: E.doseText(it) })))),
      q.adaptations.length ? h("ul", { class: "adapt", style: { marginTop: "12px" } }, q.adaptations.map(a => h("li", { text: a }))) : null
    ],
    actions: [h("button", { class: "btn primary", type: "button", onClick: () => { close(); startPlayer(q); } }, icon("play", 18), "Начать")]
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
function viewBody() {
  const r = E.restrictions(state);
  const caution = state.profile.conditions.includes("caution");
  const cautionNote = CONDITIONS.find(c => c.id === "caution").notes[0];
  const notes = [...new Set(r.notes)];
  return [
    h("h1", { class: "page-title", text: "Тело" }),
    h("p", { class: "lead", text: "Отметьте травмы, боль и особенности здоровья — тренер уберёт опасные упражнения и подскажет, что делать. Данные остаются только на этом устройстве." }),
    h("section", { class: "card glass" }, bodyMap(), h("div", { class: "legend" }, [1, 2, 3].map(v => h("span", { class: `pill sev-${v}`, text: SEVERITY[v].name })))),
    h("section", { class: "card glass" }, h("h2", { text: "Зоны" }), h("div", { class: "list" }, REGIONS.map(reg => regionRow(reg, r)))),
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
        h("li", { text: "Особенности здоровья исключают опасные типы нагрузки: прыжки, высокую интенсивность, положения вниз головой и другие." }),
        h("li", { text: "Кнопка «Больно» во время тренировки сразу заменяет упражнение и 7 дней бережёт эту зону." }),
        h("li", { text: "Это общие правила безопасности, а не диагноз. Если что-то болит долго или сильно — покажитесь врачу." })))
  ];
}

function regionRow(reg, r) {
  const sev = r.regionSev[reg.id];
  const b = state.body[reg.id];
  const tempActive = b && b.temp && b.temp.until >= E.dayKey();
  const sub = b && b.note ? b.note : tempActive ? `После сигнала боли бережём до ${fmtDate(b.temp.until)}` : "";
  return h("button", { class: "row row-btn", type: "button", onClick: () => regionSheet(reg.id) },
    h("span", { class: "row-text" }, h("b", { text: reg.name }), sub ? h("span", { class: "muted small", text: sub }) : null),
    h("span", { class: `pill ${sev ? `sev-${sev}` : "muted-pill"}`, text: sev ? SEVERITY[sev].name : "в порядке" }),
    icon("chevron", 18));
}

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

function regionSheet(id) {
  const reg = REGION[id];
  const today = E.dayKey();
  const entry = state.body[id] || { sev: 0, note: "", since: "", temp: null };
  const tempActive = !!(entry.temp && entry.temp.until >= today);
  const draft = { sev: entry.sev, note: entry.note, since: entry.since, clearTemp: false };
  const desc = h("p", { class: "muted small", style: { marginTop: "10px" } });
  const effect = h("div", { class: "note-box" });
  const updateInfo = () => {
    desc.textContent = SEVERITY[draft.sev].desc;
    const preview = { ...state, body: { ...state.body, [id]: { sev: draft.sev, note: "", since: "", temp: null } } };
    const rr = E.restrictions(preview);
    const removed = EXERCISES.filter(ex => (ex.load[id] || 0) > rr.regionMax[id]);
    effect.className = `note-box${removed.length ? "" : " ok"}`;
    effect.replaceChildren(removed.length
      ? h("span", {}, h("b", { text: `Исключим ${removed.length} ${E.plural(removed.length, "упражнение", "упражнения", "упражнений")}: ` }),
        `${removed.slice(0, 5).map(e => e.name).join(", ")}${removed.length > 5 ? " и другие" : ""}.`)
      : h("span", { text: "Все упражнения остаются доступны." }));
  };
  const note = h("textarea", { class: "input", maxlength: 200, rows: 3, placeholder: "Например: старая травма, болит при приседаниях" });
  note.value = draft.note;
  note.addEventListener("input", () => { draft.note = note.value; });
  const since = h("input", { class: "input", type: "date", max: today, value: draft.since });
  since.addEventListener("change", () => { draft.since = since.value; });

  const close = sheet({
    title: reg.name,
    body: [
      choice({ label: "Состояние зоны", value: draft.sev, options: SEVERITY.map(x => ({ value: x.v, label: x.name })), onChange: v => { draft.sev = v; updateInfo(); } }),
      desc, effect,
      tempActive ? h("div", { class: "note-box" },
        h("p", { class: "small", text: `После сигнала боли на тренировке зона под защитой до ${fmtDate(entry.temp.until)}.` }),
        h("button", {
          class: "btn small ghost", type: "button", text: "Уже не болит — снять защиту",
          onClick: e => { draft.clearTemp = true; e.currentTarget.disabled = true; e.currentTarget.textContent = "Снимем после сохранения"; }
        })) : null,
      h("label", { class: "field", style: { marginTop: "14px" } }, h("span", { text: "Заметка — видна только вам" }), note),
      h("label", { class: "field" }, h("span", { text: "С какого времени (необязательно)" }), since),
      h("h3", { class: "sub-title", text: "Советы" }),
      h("ul", { class: "bullets small" }, reg.tips.map(t => h("li", { text: t })))
    ],
    actions: [h("button", {
      class: "btn primary", type: "button", text: "Сохранить",
      onClick: () => {
        const temp = tempActive && !draft.clearTemp ? entry.temp : null;
        const noteText = clean(draft.note, 200);
        const sinceValue = /^\d{4}-\d{2}-\d{2}$/.test(draft.since) && draft.since <= today ? draft.since : "";
        if (!draft.sev && !noteText && !temp) delete state.body[id];
        else state.body[id] = { sev: draft.sev, note: noteText, since: sinceValue, temp };
        persist();
        close();
        refresh();
        toast(draft.sev ? `Сохранено. Тренировки подстроены под зону «${reg.name.toLowerCase()}»` : "Сохранено");
      }
    })]
  });
  updateInfo();
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

function viewJournal() {
  const days = E.minutesByDay(state, 7);
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
      h("h2", { text: "Последние 7 дней" }),
      h("p", { class: "muted small", text: `${week} мин из 150 рекомендованных ВОЗ` }),
      h("div", { class: "bars", role: "img", "aria-label": days.map(x => `${fmtDate(x.d, { weekday: "short" })}: ${x.mins} мин`).join(", ") },
        days.map(x => h("div", { class: `bar${x.mins ? "" : " zero"}` },
          x.mins ? h("small", { text: String(x.mins) }) : null,
          h("i", { style: { height: `${Math.max(4, Math.round((x.mins / max) * 96))}px` } }),
          h("span", { text: fmtDate(x.d, { weekday: "short" }) }))))),
    recent.length >= 2 ? h("section", { class: "card glass" },
      h("h2", { text: "Готовность за 2 недели" }),
      h("p", { class: "muted small", text: "По отметкам самочувствия: чем выше, тем лучше сон, энергия и восстановление." }),
      sparkline(recent)) : null,
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
  ["library", "book", "Упражнения", `${EXERCISES.length} ${E.plural(EXERCISES.length, "упражнение", "упражнения", "упражнений")} с подсказками`],
  ["timer", "timer", "Интервальный таймер", "Работа и отдых по кругу"],
  ["breath", "wind", "Дыхание", "Спокойствие за пару минут"],
  ["calendar", "calendar", "Напоминания", "Тренировки в календаре телефона"],
  ["profile", "user", "Профиль и цели", "Цель, уровень, инвентарь"],
  ["settings", "sliders", "Настройки", "Тема, звук, голос, стекло"],
  ["data", "shield", "Данные и защита", "Пароль, копия, удаление"],
  ["install", "phone", "Установить", "Иконка на главном экране"],
  ["about", "doc", "О приложении", "Правила и безопасность"]
];
const SUB = { library: subLibrary, timer: subTimer, breath: subBreath, calendar: subCalendar, profile: subProfile, settings: subSettings, data: subData, install: subInstall, about: subAbout };

function viewMore(sub) {
  if (sub && own(SUB, sub)) return [h("a", { class: "back-link", href: "#more" }, icon("back", 18), "Ещё"), ...SUB[sub]()];
  return [
    h("h1", { class: "page-title", text: "Ещё" }),
    h("p", { class: "lead", text: "Инструменты, настройки и защита данных." }),
    h("div", { class: "menu-grid" }, MORE.map(([id, ic, title, desc]) => h("a", { class: "menu-item glass", href: `#more/${id}` },
      h("span", { class: "fi" }, icon(ic, 22)), h("b", { text: title }), h("span", { text: desc })))),
    h("p", { class: "muted small center", style: { marginTop: "18px" } }, `Листопульс ${VERSION} · 12+ · `, h("a", { href: "../index.html", text: "сайт о здоровье" }))
  ];
}

const libFilter = { q: "", group: "all", mine: false };
function subLibrary() {
  const r = E.restrictions(state);
  const list = h("div", { class: "list" });
  const fill = () => {
    const q = libFilter.q.trim().toLowerCase();
    const items = EXERCISES.filter(ex =>
      (libFilter.group === "all" || ex.group === libFilter.group) &&
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
      toggle({ label: "Только подходящие мне", desc: "С учётом зон, особенностей и инвентаря", checked: libFilter.mine, onChange: v => { libFilter.mine = v; fill(); } })),
    h("section", { class: "card glass" }, list)
  ];
}

const timerCfg = { work: 30, rest: 15, rounds: 8 };
function subTimer() {
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
      h("p", { class: "lead", text: "Отметьте травмы и болезненные зоны — или пропустите этот шаг. Всё можно изменить позже в разделе «Тело»." }),
      h("section", { class: "card glass" }, bodyMap()),
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

function startPlayer(session, stepsOverride) {
  if (player) return;
  const steps = stepsOverride || E.flatten(session);
  if (!steps.length) { toast("В этой тренировке нет подходящих упражнений"); return; }
  unlockAudio();
  player = {
    session, steps, i: 0, timed: false, deadline: null, remaining: 0, paused: false, prep: false, half: false,
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
    if (st.item.sec) {
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
    if (whole <= 3 && whole > 0 && state.settings.sound) beep(520, 0.12);
    if (P.timerEl) P.timerEl.textContent = mmss(P.remaining);
  }
  if (st.type === "ex" && !P.prep && st.item.sec && EX[st.item.id].side && !P.half && left <= st.item.sec) {
    P.half = true;
    if (state.settings.sound) beep(700, 0.2);
    if (state.settings.vibrate) buzz(120);
    say("Смена стороны");
    if (P.sideEl) P.sideEl.textContent = "Вторая сторона";
  }
  if (left > 0) return;
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
    if (st.type === "ex") return EX[st.item.id].name;
    if (st.type === "work") return "работа";
  }
  return "";
}

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
    const blockInfo = `${st.block}${st.rounds > 1 ? ` · круг ${st.round} из ${st.rounds}` : ""}`;
    let main;
    if (P.prep) main = [h("p", { class: "player-dose", text: `Приготовьтесь · ${E.doseText(st.item)}` }), timerNode()];
    else if (st.item.sec) main = [timerNode(), ex.side ? (P.sideEl = h("p", { class: "player-dose", text: P.half ? "Вторая сторона" : "Первая сторона" })) : null];
    else main = [h("div", { class: "big-reps", text: `×${st.item.reps}` }), h("p", { class: "player-dose", text: ex.side ? "на каждую сторону · нажмите «Готово», когда закончите" : "нажмите «Готово», когда закончите" })];
    card = h("section", { class: `player-card glass${P.prep ? " is-prep" : ""}` },
      h("p", { class: "player-block", text: blockInfo }),
      h("h1", { class: "player-ex", text: ex.name }),
      main,
      h("ul", { class: "cues" }, ex.cues.map(c => h("li", { text: c }))));
    const primary = st.item.reps
      ? h("button", { class: "btn primary", type: "button", onClick: () => { P.done += 1; if (state.settings.sound) beep(880, 0.2); enterStep(P.i + 1); } }, icon("check", 18), "Готово")
      : pauseBtn("primary");
    controls = h("div", { class: "player-controls" },
      h("button", { class: "btn pain", type: "button", onClick: painSheet, text: "Больно" }),
      primary,
      h("button", { class: "btn ghost", type: "button", "aria-label": "Пропустить упражнение", onClick: () => enterStep(P.i + 1) }, icon("next", 18)));
  }
  const next = nextName(P.i);
  P.el.replaceChildren(top,
    h("div", { class: "player-main" }, card, next ? h("p", { class: "next-up", text: `Далее: ${next}` }) : null),
    controls);
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
    st.item = st.item.reps ? { id, reps: Math.max(3, Math.round(st.item.reps * 0.7)) } : { id, sec: Math.max(10, Math.round((st.item.sec * 0.7) / 5) * 5) };
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
