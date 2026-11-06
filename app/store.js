// ===== Листопульс: хранилище данных =====
// Данные живут только на устройстве (localStorage) и никуда не отправляются.
// По желанию пользователя всё шифруется паролем: AES-GCM 256 бит, ключ — PBKDF2-SHA-256, 600 000 итераций.
// Любые загруженные данные (из памяти браузера или из файла) проходят строгую проверку и пересобираются
// по известной схеме: лишние поля отбрасываются, значения ограничиваются по типу и длине.
import { REGIONS, CONDITIONS, AGE_GROUPS, GOALS, EQUIPMENT, EX, QUICK, BADGES, SYMPTOMS, ONSET, TRIGGERS, PROGRAMS, RECORD_EX, CHALLENGES } from "./data.js";
import { GUIDE } from "./guide.js";

const KEY = "lpapp-v1";
const THEME_KEY = "lpapp-theme"; // тема хранится отдельно и без шифрования: нужна до ввода пароля
const ITERATIONS = 600000;
export const MAX_IMPORT_BYTES = 1000000;

const REGION_IDS = REGIONS.map(r => r.id);
const COND_IDS = CONDITIONS.map(c => c.id);
const AGE_IDS = AGE_GROUPS.map(a => a.id);
const GOAL_IDS = GOALS.map(g => g.id);
const EQUIP_IDS = EQUIPMENT.map(e => e.id);
const EX_IDS = Object.keys(EX);
const WEIGHTED_IDS = EX_IDS.filter(id => EX[id].weighted);
const CUSTOM_REST = [0, 15, 30, 45, 60, 90];
const SESSION_GOALS = [...GOAL_IDS, ...QUICK.map(q => q.id), "timer", "activity", "program", "custom", "morning", "challenge"];
const SYMPTOM_IDS = SYMPTOMS.map(x => x.id);
const ONSET_IDS = ONSET.map(x => x.id);
const TRIGGER_IDS = TRIGGERS.map(x => x.id);
const GUIDE_IDS = GUIDE.map(x => x.id);
const SIDE_IDS = ["L", "R"];
const MODES = ["recovery", "light", "normal", "push"];
const SCREEN_IDS = ["chest", "dizzy", "heart", "pressure", "joints", "pregnant", "surgery"];

export const defaultState = () => ({
  v: 1,
  profile: {
    onboarded: false, ack: false, name: "", ageGroup: "adult", goal: "health", level: 1,
    equipment: ["chair"], minutes: 20, days: [1, 3, 5], conditions: [], screening: [],
    sex: "", height: 0
  },
  body: {},
  checkins: [],
  sessions: [],
  progress: { factor: 1 },
  water: { d: "", n: 0 },
  badges: {},
  modeOverride: null,
  planVariant: { d: "", n: 0 },
  marks: [],
  painLog: [],
  programs: {},
  guideRead: [],
  records: {},
  weights: {},
  custom: [],
  challenges: {},
  bodyWeight: [],
  settings: { sound: true, voice: false, vibrate: true, lessGlass: false, lastBackup: "", backupSnooze: "" }
});

// ----- Проверка значений -----
const str = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").trim().slice(0, max) : "");
const text = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").slice(0, max) : "");
const int = (v, min, max, def) => (Number.isInteger(v) && v >= min && v <= max ? v : def);
const bool = (v, def) => (typeof v === "boolean" ? v : def);
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const day = v => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : "");
const ids = (v, list, max) => (Array.isArray(v) ? [...new Set(v.filter(x => list.includes(x)))].slice(0, max) : []);
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (o, k) => (isObj(o) && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
const num = (v, min, max) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10000) / 10000 : null);
const vec3 = (v, min, max) => {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const out = v.map(x => num(x, min, max));
  return out.every(x => x !== null) ? out : null;
};

export function sanitize(raw) {
  if (!isObj(raw) || raw.v !== 1) throw new Error("Неподходящий формат данных");
  const d = defaultState();

  const p = own(raw, "profile");
  if (isObj(p)) {
    const days = Array.isArray(p.days) ? [...new Set(p.days.filter(x => Number.isInteger(x) && x >= 1 && x <= 7))].sort() : [1, 3, 5];
    d.profile = {
      onboarded: bool(p.onboarded, false),
      ack: bool(p.ack, false),
      name: str(p.name, 40),
      ageGroup: oneOf(p.ageGroup, AGE_IDS, "adult"),
      goal: oneOf(p.goal, GOAL_IDS, "health"),
      level: int(p.level, 1, 3, 1),
      equipment: ids(p.equipment, EQUIP_IDS, 10),
      minutes: oneOf(p.minutes, [10, 20, 30, 45], 20),
      days: days.length ? days : [1, 3, 5],
      conditions: ids(p.conditions, COND_IDS, 20),
      screening: ids(p.screening, SCREEN_IDS, 10),
      sex: oneOf(p.sex, ["", "m", "f"], ""),
      height: int(p.height, 100, 250, 0)
    };
  }

  const body = own(raw, "body");
  for (const id of REGION_IDS) {
    const b = own(body, id);
    if (!isObj(b)) continue;
    const t = own(b, "temp");
    const temp = isObj(t) && day(t.until) ? { until: day(t.until), sev: int(t.sev, 1, 3, 1) } : null;
    const entry = {
      sev: int(b.sev, 0, 3, 0), note: text(b.note, 300), since: day(b.since), temp,
      sides: ids(b.sides, SIDE_IDS, 2), symptoms: ids(b.symptoms, SYMPTOM_IDS, 20),
      onset: oneOf(b.onset, ONSET_IDS, ""), triggers: ids(b.triggers, TRIGGER_IDS, 20)
    };
    if (entry.sev || entry.note || entry.temp || entry.symptoms.length || entry.onset || entry.triggers.length) d.body[id] = entry;
  }

  const checkins = own(raw, "checkins");
  if (Array.isArray(checkins)) {
    for (const c of checkins.slice(-400)) {
      if (!isObj(c) || !day(c.d)) continue;
      const v = k => int(c[k], 1, 5, 3);
      d.checkins.push({ d: day(c.d), sleep: v("sleep"), energy: v("energy"), soreness: v("soreness"), stress: v("stress"), score: int(c.score, 0, 100, 50), pain: ids(c.pain, REGION_IDS, 24) });
    }
  }

  const sessions = own(raw, "sessions");
  if (Array.isArray(sessions)) {
    for (const s of sessions.slice(-1000)) {
      if (!isObj(s) || !day(s.d)) continue;
      const pains = Array.isArray(s.pains)
        ? s.pains.filter(x => isObj(x) && EX_IDS.includes(x.ex) && REGION_IDS.includes(x.region)).slice(0, 20).map(x => ({ ex: x.ex, region: x.region }))
        : [];
      // Какие упражнения выполнены и сколько раз — для карты восстановления мышц
      const ex = Array.isArray(s.ex)
        ? s.ex.filter(x => Array.isArray(x) && x.length === 2 && EX_IDS.includes(x[0]) && Number.isInteger(x[1]) && x[1] >= 1 && x[1] <= 50).slice(0, 40).map(x => [x[0], x[1]])
        : [];
      d.sessions.push({
        id: str(s.id, 24) || Math.random().toString(36).slice(2, 12),
        d: day(s.d), hour: int(s.hour, 0, 23, 12), mins: int(s.mins, 0, 300, 0),
        title: str(s.title, 80), goal: oneOf(s.goal, SESSION_GOALS, "health"), mode: oneOf(s.mode, MODES, "normal"),
        rpe: int(s.rpe, 0, 10, 0), count: int(s.count, 0, 500, 0), pains, ex
      });
    }
  }

  const progress = own(raw, "progress");
  const f = own(progress, "factor");
  if (typeof f === "number" && f >= 0.6 && f <= 1.5) d.progress.factor = Math.round(f * 100) / 100;

  const water = own(raw, "water");
  if (isObj(water) && day(water.d)) d.water = { d: day(water.d), n: int(water.n, 0, 30, 0) };

  const badges = own(raw, "badges");
  for (const b of BADGES) {
    const when = day(own(badges, b.id));
    if (when) d.badges[b.id] = when;
  }

  const mo = own(raw, "modeOverride");
  if (isObj(mo) && day(mo.d) && MODES.includes(mo.mode)) d.modeOverride = { d: day(mo.d), mode: mo.mode };

  const pv = own(raw, "planVariant");
  if (isObj(pv) && day(pv.d)) d.planVariant = { d: day(pv.d), n: int(pv.n, 0, 1000, 0) };

  // Отметки, обведённые на 3D-модели
  const marks = own(raw, "marks");
  if (Array.isArray(marks)) {
    for (const m of marks.slice(-40)) {
      if (!isObj(m)) continue;
      const regions = Array.isArray(m.regions)
        ? m.regions.filter(x => isObj(x) && REGION_IDS.includes(x.id)).slice(0, 8).map(x => ({ id: x.id, side: oneOf(x.side, SIDE_IDS, "") }))
        : [];
      const c = vec3(m.c, -1, 2.5), n = vec3(m.n, -1.01, 1.01), r = num(m.r, 0.01, 0.5);
      if (!regions.length || !c || !n || r === null) continue;
      d.marks.push({
        id: str(m.id, 24) || Math.random().toString(36).slice(2, 12), d: day(m.d) || "",
        regions, c, n, r, sev: int(m.sev, 0, 3, 1), pain: int(m.pain, 0, 10, 0),
        symptoms: ids(m.symptoms, SYMPTOM_IDS, 20), onset: oneOf(m.onset, ONSET_IDS, ""),
        triggers: ids(m.triggers, TRIGGER_IDS, 20), note: text(m.note, 300)
      });
    }
  }

  // Дневник боли
  const painLog = own(raw, "painLog");
  if (Array.isArray(painLog)) {
    for (const x of painLog.slice(-2000)) {
      if (!isObj(x) || !day(x.d) || !REGION_IDS.includes(x.region)) continue;
      d.painLog.push({ d: day(x.d), region: x.region, level: int(x.level, 0, 10, 0) });
    }
  }

  // Прогресс программ восстановления
  const programs = own(raw, "programs");
  for (const prog of PROGRAMS) {
    const ps = own(programs, prog.id);
    if (!isObj(ps) || !day(ps.start)) continue;
    const done = Array.isArray(ps.done) ? [...new Set(ps.done.filter(x => Number.isInteger(x) && x >= 1 && x <= prog.days))].sort((a, b) => a - b) : [];
    d.programs[prog.id] = { start: day(ps.start), done };
  }

  d.guideRead = ids(own(raw, "guideRead"), GUIDE_IDS, 100);

  // Рабочие веса: последний, лучший и история (до 20 записей) — только для упражнений с весом
  const weights = own(raw, "weights");
  const kg = v => {
    const x = num(v, 0.5, 500);
    return x === null ? null : Math.round(x * 2) / 2;
  };
  for (const id of WEIGHTED_IDS) {
    const w = own(weights, id);
    if (!isObj(w)) continue;
    const last = kg(w.kg);
    if (last === null) continue;
    const hist = Array.isArray(w.hist)
      ? w.hist.filter(h => Array.isArray(h) && (h.length === 2 || h.length === 3) && day(h[0]) && kg(h[1]) !== null)
        .slice(-30).map(h => (h.length === 3 && Number.isInteger(h[2]) && h[2] >= 1 && h[2] <= 50 ? [day(h[0]), kg(h[1]), h[2]] : [day(h[0]), kg(h[1])]))
      : [];
    const best = Math.max(last, kg(w.best) || 0, ...hist.map(h => h[1]));
    const sets = Array.isArray(w.last)
      ? w.last.filter(x => Array.isArray(x) && x.length === 2 && kg(x[0]) !== null && Number.isInteger(x[1]) && x[1] >= 1 && x[1] <= 50).slice(0, 10).map(x => [kg(x[0]), x[1]])
      : [];
    const e1 = num(w.e1rm, 0, 2000);
    d.weights[id] = { kg: last, d: day(w.d), best, hist, last: sets, e1rm: e1 === null ? 0 : Math.round(e1 * 10) / 10, prD: day(w.prD) };
  }

  // Свои тренировки из конструктора
  const custom = own(raw, "custom");
  if (Array.isArray(custom)) {
    for (const c of custom.slice(0, 20)) {
      if (!isObj(c)) continue;
      const items = Array.isArray(c.items) ? [...new Set(c.items.filter(x => EX_IDS.includes(x)))].slice(0, 20) : [];
      if (!items.length) continue;
      d.custom.push({
        id: str(c.id, 24) || Math.random().toString(36).slice(2, 12),
        name: str(c.name, 40) || "Моя тренировка", items,
        rounds: int(c.rounds, 1, 5, 1), rest: oneOf(c.rest, CUSTOM_REST, 30), d: day(c.d)
      });
    }
  }

  // Челленджи: начало и выполненные дни
  const ch = own(raw, "challenges");
  for (const c of CHALLENGES) {
    const x = own(ch, c.id);
    if (!isObj(x) || !day(x.start)) continue;
    const done = Array.isArray(x.done) ? [...new Set(x.done.filter(n => Number.isInteger(n) && n >= 1 && n <= 30))].sort((a, b) => a - b) : [];
    d.challenges[c.id] = { start: day(x.start), done, last: day(x.last) };
  }

  // Вес тела: [дата, кг]
  const bw = own(raw, "bodyWeight");
  if (Array.isArray(bw)) {
    const seen = new Set();
    for (const x of bw.slice(-500)) {
      if (!Array.isArray(x) || x.length !== 2 || !day(x[0]) || seen.has(x[0])) continue;
      const v = num(x[1], 20, 400);
      if (v === null) continue;
      seen.add(x[0]);
      d.bodyWeight.push([day(x[0]), Math.round(v * 10) / 10]);
    }
    d.bodyWeight.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }

  // Рекорды статики: лучшее время в секундах
  const records = own(raw, "records");
  for (const id of RECORD_EX) {
    const rec = own(records, id);
    if (!isObj(rec) || !day(rec.d)) continue;
    const best = int(rec.best, 1, 3600, 0);
    if (!best) continue;
    d.records[id] = { best, d: day(rec.d), last: int(rec.last, 0, 3600, 0), tries: int(rec.tries, 1, 100000, 1) };
  }

  const st = own(raw, "settings");
  if (isObj(st)) {
    d.settings = {
      sound: bool(st.sound, true), voice: bool(st.voice, false),
      vibrate: bool(st.vibrate, true), lessGlass: bool(st.lessGlass, false),
      lastBackup: day(st.lastBackup), backupSnooze: day(st.backupSnooze)
    };
  }
  return d;
}

// ----- Base64 для бинарных данных -----
const b64 = buf => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

// ----- Шифрование -----
let session = null; // { key, salt, it } — ключ только в памяти, не извлекаемый
const enc = new TextEncoder();
const dec = new TextDecoder();

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

const readRaw = () => {
  try { return localStorage.getItem(KEY); } catch (e) { return null; }
};
const writeRaw = value => {
  try {
    localStorage.setItem(KEY, value);
    return true;
  } catch (e) {
    return false;
  }
};

// Конверт в памяти браузера: { v, enc: false, data } или { v, enc: true, it, salt, iv, ct }
export function readEnvelope() {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const env = JSON.parse(raw);
    if (!isObj(env) || env.v !== 1) return null;
    if (env.enc === true) {
      const ok = typeof env.salt === "string" && typeof env.iv === "string" && typeof env.ct === "string" &&
        Number.isInteger(env.it) && env.it >= 100000 && env.it <= 5000000;
      return ok ? env : null;
    }
    return env;
  } catch (e) {
    return null;
  }
}

export const isEncrypted = () => session !== null;

export function loadPlain(env) {
  try { return sanitize(env.data); } catch (e) { return defaultState(); }
}

export async function unlock(env, password) {
  const salt = unb64(env.salt);
  const key = await deriveKey(password, salt, env.it);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, key, unb64(env.ct)); // неверный пароль → ошибка
  const data = sanitize(JSON.parse(dec.decode(plain)));
  session = { key, salt, it: env.it };
  return data;
}

let saving = Promise.resolve(true);
export function save(state) {
  saving = saving.then(async () => {
    const json = JSON.stringify(state);
    if (session) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, session.key, enc.encode(json));
      return writeRaw(JSON.stringify({ v: 1, enc: true, it: session.it, salt: b64(session.salt), iv: b64(iv), ct: b64(ct) }));
    }
    return writeRaw(JSON.stringify({ v: 1, enc: false, data: state }));
  }).catch(() => false);
  return saving;
}

export async function setPassword(state, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt, ITERATIONS);
  session = { key, salt, it: ITERATIONS };
  return save(state);
}

export async function removePassword(state) {
  session = null;
  return save(state);
}

// Заблокировать: ключ стирается из памяти, данные остаются зашифрованными
export function forgetKey() {
  session = null;
}

export function wipe() {
  session = null;
  try {
    localStorage.removeItem(KEY);
  } catch (e) { /* нечего удалять */ }
}

// ----- Резервная копия -----
export function exportJSON(state) {
  return JSON.stringify({ app: "listopuls-trainer", v: 1, exported: new Date().toISOString(), data: state }, null, 2);
}
export function importJSON(textValue) {
  if (typeof textValue !== "string" || textValue.length > MAX_IMPORT_BYTES) throw new Error("Файл слишком большой");
  const parsed = JSON.parse(textValue);
  if (!isObj(parsed) || parsed.app !== "listopuls-trainer" || parsed.v !== 1) throw new Error("Это не резервная копия Листопульса");
  return sanitize(parsed.data);
}

// ----- Тема -----
export const getTheme = () => {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "auto";
  } catch (e) {
    return "auto";
  }
};
export const setTheme = t => {
  try {
    if (t === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, t);
  } catch (e) { /* без сохранения */ }
};
