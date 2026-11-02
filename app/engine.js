// ===== Листопульс: логика подбора тренировок =====
// Чистые функции без доступа к DOM и сети. Всё считается на устройстве пользователя.
import { REGIONS, LOAD_KEYS, CONDITIONS, AGE_GROUPS, GOALS, EXERCISES, EX, QUICK, GROUPS, EQUIPMENT, PROGRAMS } from "./data.js";

export const REGION_NAME = Object.fromEntries(REGIONS.map(r => [r.id, r.name]));
const REGION_BY_ID = Object.fromEntries(REGIONS.map(r => [r.id, r]));
const EQUIP_NAME = Object.fromEntries(EQUIPMENT.map(e => [e.id, e.name]));

const TAG_REASON = {
  impact: "без прыжков и ударной нагрузки",
  hi: "без высокой интенсивности",
  iso: "без долгой статики",
  inversion: "без положений головой вниз",
  overhead: "без нагрузки над головой",
  flexion: "без скручиваний позвоночника"
};

export const MODES = {
  recovery: { name: "Восстановление", short: "Отдых", k: 0.6, desc: "Тело просит отдыха: мягкая мобильность и дыхание." },
  light: { name: "Лёгкая", short: "Легко", k: 0.8, desc: "Меньше повторений и больше отдыха." },
  normal: { name: "Обычная", short: "Обычно", k: 1, desc: "Тренируемся в привычном темпе." },
  push: { name: "Посильнее", short: "Сильнее", k: 1.15, desc: "Вы в хорошей форме — можно немного прибавить." }
};

const LEVEL_K = { 1: 0.8, 2: 1, 3: 1.25 };
const REST = { 1: 40, 2: 30, 3: 25 };
const ALLOWED = [3, 1, 0, 0]; // допустимая нагрузка при тяжести зоны 0…3
const RELATED = {
  warm: ["warm", "mobility"], legs: ["legs", "iso", "balance"], push: ["push", "iso"], pull: ["pull", "iso", "mobility"],
  core: ["core", "iso"], cardio: ["cardio"], balance: ["balance", "iso", "legs"], iso: ["iso", "mobility"],
  mobility: ["mobility", "cool", "warm"], cool: ["cool", "mobility"]
};
export const PREP_SEC = 5;

// ----- Даты и мелкие помощники -----
export const dayKey = (d = new Date()) => d.toLocaleDateString("sv-SE"); // ГГГГ-ММ-ДД по местному времени
export const shiftDay = (key, n) => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};
export const fmtSec = s => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} мин` : `${s} сек`);
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

// Детерминированный генератор случайных чисел: один и тот же день и настройки — один и тот же план
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ----- Тяжесть зон -----
// Складывается из ручной отметки зоны, обведённых на 3D-модели областей, сигнала боли
// на тренировке (7 дней) и отметки самочувствия за день. Берётся максимум.
export function markSeverity(state, id) {
  let sev = 0;
  for (const m of state.marks) {
    if (m.regions.some(x => x.id === id)) sev = Math.max(sev, m.sev);
  }
  return sev;
}
export function regionSeverity(state, id, day = dayKey(), withMarks = true) {
  const b = state.body[id];
  let sev = b ? b.sev : 0;
  if (b && b.temp && b.temp.until >= day) sev = Math.max(sev, b.temp.sev);
  const ci = state.checkins.find(c => c.d === day);
  if (ci && ci.pain.includes(id)) sev = Math.max(sev, 2);
  if (withMarks) sev = Math.max(sev, markSeverity(state, id));
  return sev;
}

// ----- Ограничения -----
export function restrictions(state, day = dayKey()) {
  const p = state.profile;
  const r = {
    keyMax: Object.fromEntries(LOAD_KEYS.map(k => [k, 3])), keySource: {},
    regionSev: {}, banned: new Set(), banSource: {}, notes: [], reasons: [],
    maxLevel: p.level, block: null, longWarmup: false, balance: false, acute: []
  };
  for (const reg of REGIONS) {
    const s = regionSeverity(state, reg.id, day);
    r.regionSev[reg.id] = s;
    if (!s) continue;
    r.reasons.push(reg.name);
    if (s === 3) r.acute.push(reg.name);
    for (const key of reg.keys) {
      if (ALLOWED[s] < r.keyMax[key]) {
        r.keyMax[key] = ALLOWED[s];
        r.keySource[key] = reg.name;
      }
    }
    for (const tag of (reg.bans && reg.bans[s]) || []) {
      r.banned.add(tag);
      if (!r.banSource[tag]) r.banSource[tag] = reg.name.toLowerCase();
    }
  }
  const apply = src => {
    (src.ban || []).forEach(t => {
      r.banned.add(t);
      if (!r.banSource[t]) r.banSource[t] = src.name.toLowerCase();
    });
    if (src.maxLevel) r.maxLevel = Math.min(r.maxLevel, src.maxLevel);
    if (src.longWarmup) r.longWarmup = true;
    if (src.balance) r.balance = true;
    if (src.notes) r.notes.push(...src.notes);
  };
  for (const id of p.conditions) {
    const c = CONDITIONS.find(x => x.id === id);
    if (!c) continue;
    r.reasons.push(c.name);
    apply(c);
    if (c.block && !r.block) r.block = c;
  }
  const age = AGE_GROUPS.find(a => a.id === p.ageGroup);
  if (age) {
    apply(age);
    if (age.ban || age.balance || age.maxLevel) r.reasons.push(`возраст ${age.name}`);
  }
  return r;
}

// Причины, по которым упражнение исключено именно ради безопасности
export function safetyReasons(ex, r) {
  const out = [];
  for (const [key, load] of Object.entries(ex.load)) {
    if (load > r.keyMax[key]) out.push(`бережём зону «${r.keySource[key]}»`);
  }
  for (const t of ex.tags) {
    if (r.banned.has(t)) out.push(`${TAG_REASON[t] || t} (${r.banSource[t]})`);
  }
  return [...new Set(out)];
}

// Все причины, почему упражнение сейчас не подходит; пустой список — подходит
export function whyNot(ex, r, profile) {
  const out = safetyReasons(ex, r);
  if (ex.level > r.maxLevel) out.push(r.maxLevel < profile.level ? "пока нужна более лёгкая нагрузка" : "сложнее вашего уровня");
  const missing = ex.equip.filter(e => !profile.equipment.includes(e));
  if (missing.length) out.push(`нужно: ${missing.map(e => EQUIP_NAME[e].toLowerCase()).join(", ")}`);
  return out;
}
export const fits = (ex, r, profile) => whyNot(ex, r, profile).length === 0;

// Какие упражнения убирает одна зона при заданной тяжести (для подсказки в карточке зоны)
export function excludedByRegion(regionId, sev) {
  const reg = REGION_BY_ID[regionId];
  if (!reg || !sev) return [];
  const bans = (reg.bans && reg.bans[sev]) || [];
  return EXERCISES.filter(ex => reg.keys.some(k => (ex.load[k] || 0) > ALLOWED[sev]) || ex.tags.some(t => bans.includes(t)));
}

// ----- Дозировка -----
export const relaxOf = ex => ex.relax || 4;
export function makeItem(ex, k = 1) {
  if (ex.type === "reps") return { id: ex.id, reps: clamp(Math.round(ex.base * k), 3, 30) };
  if (ex.type === "hold") return { id: ex.id, reps: clamp(Math.round(ex.base * k), 2, 15) };
  return { id: ex.id, sec: clamp(Math.round((ex.base * k) / 5) * 5, 10, 180) };
}
export function itemSeconds(item) {
  const ex = EX[item.id];
  let one;
  if (ex.type === "hold") one = item.reps * (ex.hold + relaxOf(ex));
  else one = item.reps ? item.reps * 3 + 4 : item.sec;
  return ex.side ? one * 2 : one;
}
export function doseText(item) {
  const ex = EX[item.id];
  let base;
  if (ex.type === "hold") base = `${item.reps} × ${ex.hold} сек удержания`;
  else base = item.reps ? `${item.reps} ${plural(item.reps, "повторение", "повторения", "повторений")}` : fmtSec(item.sec);
  return ex.side ? `${base} на каждую сторону` : base;
}

// ----- Замена упражнения -----
const totalLoad = e => Object.values(e.load).reduce((a, b) => a + b, 0);
export function findReplacement(ex, r, profile, exclude = new Set()) {
  const groups = RELATED[ex.group] || [ex.group];
  const pool = EXERCISES.filter(e => groups.includes(e.group) && e.id !== ex.id && !exclude.has(e.id) && fits(e, r, profile));
  if (!pool.length) return null;
  pool.sort((a, b) =>
    groups.indexOf(a.group) - groups.indexOf(b.group) ||
    (a.type !== ex.type) - (b.type !== ex.type) ||
    Math.abs(a.level - ex.level) - Math.abs(b.level - ex.level) ||
    totalLoad(a) - totalLoad(b));
  return pool[0];
}

// ----- Самочувствие -----
export function readinessScore(ci) {
  return Math.round(((ci.sleep + ci.energy + (6 - ci.soreness) + (6 - ci.stress)) - 4) / 16 * 100);
}
export function modeFromScore(score, level) {
  if (score < 35) return "recovery";
  if (score < 55) return "light";
  if (score >= 80 && level >= 2) return "push";
  return "normal";
}
export function currentMode(state, day = dayKey()) {
  if (state.modeOverride && state.modeOverride.d === day) return state.modeOverride.mode;
  const ci = state.checkins.find(c => c.d === day);
  return ci ? modeFromScore(ci.score, state.profile.level) : "normal";
}

// ----- Сборка тренировки -----
function explain(session, r, groups) {
  const byReason = new Map();
  for (const ex of EXERCISES) {
    if (!groups.includes(ex.group)) continue;
    for (const reason of safetyReasons(ex, r)) {
      if (!byReason.has(reason)) byReason.set(reason, []);
      byReason.get(reason).push(ex.name);
    }
  }
  for (const [reason, names] of byReason) {
    const more = names.length > 3 ? ` и ещё ${names.length - 3}` : "";
    session.adaptations.push(`${capitalize(reason)}: убрали ${names.slice(0, 3).join(", ")}${more}.`);
  }
}

function finalize(s) {
  let total = 0, count = 0;
  for (const b of s.blocks) {
    for (let round = 0; round < b.rounds; round++) {
      for (const it of b.items) {
        const ex = EX[it.id];
        total += itemSeconds(it) + (b.kind === "main" ? s.rest : 8) + (ex.type === "hold" ? PREP_SEC : 0);
        count += 1;
      }
    }
  }
  s.est = Math.max(1, Math.round(total / 60));
  s.count = count;
  return s;
}

function pausedSession(s, r) {
  s.blocked = true;
  s.title = "Тренировки на паузе";
  s.notes = r.block.notes.slice();
  s.blocks = [{ kind: "main", name: "Дыхательная практика", rounds: 1, items: [makeItem(EX.bellyBreath, 3)] }];
  s.rest = 0;
  return finalize(s);
}

export function buildSession(state, { variant = 0 } = {}) {
  const p = state.profile;
  const day = dayKey();
  const r = restrictions(state, day);
  let mode = currentMode(state, day);
  // При острой боли — только щадящий режим
  if (r.acute.length && (mode === "normal" || mode === "push")) mode = "light";
  const goal = GOALS.find(g => g.id === p.goal) || GOALS[0];
  const level = Math.min(p.level, r.maxLevel);
  const rand = mulberry32(hashStr(JSON.stringify([day, p.goal, p.minutes, p.level, p.equipment, p.conditions, p.ageGroup, r.regionSev, mode, variant])));
  const used = new Set();
  const choose = (group, maxLevel = 3) => {
    const pool = EXERCISES.filter(e => e.group === group && !used.has(e.id) && e.level <= maxLevel && fits(e, r, p));
    if (!pool.length) return null;
    const near = pool.filter(e => e.level === Math.min(level, maxLevel));
    const src = near.length && rand() < 0.75 ? near : pool;
    const ex = src[Math.floor(rand() * src.length)];
    used.add(ex.id);
    return ex;
  };
  const s = {
    kind: "plan", title: "", goal: goal.id, mode, rest: REST[level] + (mode === "light" ? 10 : 0),
    blocks: [], adaptations: [], notes: [...new Set(r.notes)], blocked: false
  };
  if (r.block) return pausedSession(s, r);
  if (r.acute.length) {
    s.notes.unshift(`Отмечена острая боль (${r.acute.join(", ").toLowerCase()}): эту зону не нагружаем, тренировка — щадящая. Если боль сильная, нарастает или не проходит несколько дней, обратитесь к врачу.`);
  }

  const k = LEVEL_K[level] * MODES[mode].k * state.progress.factor;

  if (mode === "recovery") {
    s.title = "Восстановление";
    const items = [];
    for (const g of ["warm", "mobility", "iso", "mobility", "cool", "cool"]) {
      const ex = choose(g, 1);
      if (ex) items.push(makeItem(ex, g === "iso" ? 0.8 : 1));
    }
    if (!used.has("bellyBreath") && fits(EX.bellyBreath, r, p)) items.push(makeItem(EX.bellyBreath, 1));
    s.blocks.push({ kind: "main", name: "Мягкая мобильность", rounds: 1, items });
    s.rest = 10;
    s.notes.unshift("Самочувствие сегодня на нуле — делаем мягкую мобильность, немного изометрии и дыхание. Если есть силы, добавьте спокойную прогулку.");
    explain(s, r, ["warm", "mobility", "iso", "cool"]);
    return finalize(s);
  }

  const minutes = p.minutes;
  const warmN = (minutes <= 10 ? 2 : minutes <= 20 ? 3 : 4) + (r.longWarmup ? 1 : 0);
  const warm = [];
  for (let i = 0; i < warmN; i++) {
    const ex = choose("warm");
    if (ex) warm.push(makeItem(ex, 1));
  }

  let groups = goal.main.slice();
  if (minutes <= 10) groups = groups.slice(0, 4);
  else if (minutes >= 45) groups = groups.concat(goal.main.slice(0, 2));
  else if (minutes >= 30) groups = groups.concat(goal.main.slice(0, 1));
  const main = [];
  const skipped = new Set();
  for (const g of groups) {
    const ex = choose(g);
    if (ex) main.push(makeItem(ex, goal.id === "flexibility" ? 1 : k));
    else skipped.add(g);
  }
  if (goal.id === "flexibility") s.rest = 15;
  if (goal.id === "joints") s.rest = Math.min(s.rest, 25);

  const balance = [];
  if (r.balance && goal.id !== "joints") {
    for (let i = 0; i < 2; i++) {
      const ex = choose("balance");
      if (ex) balance.push(makeItem(ex, 1));
    }
  }

  const coolN = minutes <= 10 ? 1 : minutes <= 20 ? 2 : 3;
  const cool = [];
  for (let i = 0; i < coolN; i++) {
    const ex = choose(i === coolN - 1 || rand() < 0.5 ? "cool" : "mobility") || choose("cool");
    if (ex) cool.push(makeItem(ex, 1));
  }

  const sec = items => items.reduce((a, it) => a + itemSeconds(it) + 8, 0);
  const roundSec = main.reduce((a, it) => a + itemSeconds(it) + s.rest + (EX[it.id].type === "hold" ? PREP_SEC : 0), 0);
  const avail = minutes * 60 - sec(warm) - sec(cool) - sec(balance);
  const rounds = main.length ? clamp(Math.round(avail / roundSec) || 1, 1, 6) : 0;

  s.blocks.push({ kind: "warm", name: "Разминка", rounds: 1, items: warm });
  if (main.length) s.blocks.push({ kind: "main", name: "Основная часть", rounds, items: main });
  if (balance.length) s.blocks.push({ kind: "balance", name: "Равновесие", rounds: 1, items: balance });
  if (cool.length) s.blocks.push({ kind: "cool", name: "Заминка", rounds: 1, items: cool });
  s.title = `${goal.short}: ${MODES[mode].name.toLowerCase()} тренировка`;
  for (const g of skipped) {
    s.adaptations.push(`Группа «${GROUPS[g]}» пропущена: с вашими ограничениями и инвентарём подходящих упражнений сейчас нет.`);
  }
  explain(s, r, [...new Set(["warm", ...groups, "cool", "mobility", ...(r.balance ? ["balance"] : [])])]);
  return finalize(s);
}

// Тренировка из заданного списка упражнений: неподходящие заменяются безопасными
export function buildCustom(state, { title, ids, k = 1, kind = "custom", goal = "custom", rest = 8 }) {
  const p = state.profile;
  const r = restrictions(state);
  const s = { kind, title, goal, mode: "normal", rest, blocks: [], adaptations: [], notes: [...new Set(r.notes)], blocked: false };
  if (r.block) return pausedSession(s, r);
  const used = new Set();
  const items = [];
  for (const exId of ids) {
    const ex = EX[exId];
    if (!ex || used.has(ex.id)) continue;
    if (fits(ex, r, p)) {
      items.push(makeItem(ex, k));
      used.add(ex.id);
      continue;
    }
    const alt = findReplacement(ex, r, p, new Set([...used, ...ids]));
    const why = safetyReasons(ex, r)[0] || whyNot(ex, r, p)[0];
    if (alt) {
      items.push(makeItem(alt, k));
      used.add(alt.id);
      s.adaptations.push(`${ex.name} → ${alt.name}${why ? ` (${why})` : ""}.`);
    } else {
      s.adaptations.push(`${ex.name} — пропущено: безопасной замены нет.`);
    }
  }
  s.blocks.push({ kind: "main", name: title, rounds: 1, items });
  return finalize(s);
}

export function buildQuick(state, id) {
  const q = QUICK.find(x => x.id === id) || QUICK[0];
  const s = buildCustom(state, { title: q.name, ids: q.items, kind: "quick", goal: q.id });
  s.quick = q.id;
  return s;
}

// ----- Программы восстановления -----
export function programProgress(state, id) {
  const prog = PROGRAMS.find(p => p.id === id);
  const st = state.programs[id];
  const done = st ? st.done.length : 0;
  return { prog, started: !!st, done, next: Math.min(done + 1, prog.days), finished: done >= prog.days };
}
export function buildProgramDay(state, id) {
  const { prog, next } = programProgress(state, id);
  const phase = prog.phases.find(ph => next <= ph.until) || prog.phases[prog.phases.length - 1];
  const s = buildCustom(state, { title: `${prog.name} · день ${next}`, ids: phase.items, k: phase.k, kind: "program", goal: "program", rest: 10 });
  s.program = id;
  s.programDay = next;
  return s;
}

// Шаги тренировки для плеера: упражнения и отдых
export function flatten(session) {
  const steps = [];
  for (const b of session.blocks) {
    for (let round = 1; round <= b.rounds; round++) {
      b.items.forEach((it, i) => {
        steps.push({ type: "ex", block: b.name, kind: b.kind, round, rounds: b.rounds, item: { ...it } });
        const last = round === b.rounds && i === b.items.length - 1;
        const rest = b.kind === "main" ? session.rest : 0;
        if (rest && !last) steps.push({ type: "rest", sec: rest });
      });
    }
  }
  return steps;
}

// ----- Сигнал боли -----
// Зона отмечается на 7 дней; повторный сигнал повышает осторожность (но не выше «ограничения»)
export function reportPain(state, region) {
  const day = dayKey();
  const b = state.body[region] || (state.body[region] = { sev: 0, note: "", since: "", temp: null, sides: [], symptoms: [], onset: "", triggers: [] });
  const active = b.temp && b.temp.until >= day;
  b.temp = { until: shiftDay(day, 7), sev: active ? Math.min(2, b.temp.sev + 1) : 1 };
}

// ----- Дневник боли -----
export function logPain(state, region, level, day = dayKey()) {
  state.painLog = state.painLog.filter(x => !(x.d === day && x.region === region));
  state.painLog.push({ d: day, region, level });
  state.painLog.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  if (state.painLog.length > 2000) state.painLog.splice(0, state.painLog.length - 2000);
}
export function painTrend(state, region, days = 30) {
  const from = shiftDay(dayKey(), -(days - 1));
  const points = state.painLog.filter(x => x.region === region && x.d >= from);
  if (!points.length) return null;
  const first = points[0].level, last = points[points.length - 1].level;
  const peak = Math.max(...points.map(x => x.level));
  return { points, first, last, peak, delta: last - first, since: points[0].d };
}
export function painRegions(state, days = 30) {
  const from = shiftDay(dayKey(), -(days - 1));
  return [...new Set(state.painLog.filter(x => x.d >= from).map(x => x.region))];
}

// ----- Прогрессия -----
export function applyFeedback(state, rpe, painCount) {
  let f = state.progress.factor;
  if (painCount > 0 || rpe >= 9) f -= 0.1;
  else if (rpe <= 4) f += 0.08;
  else if (rpe <= 6) f += 0.04;
  else if (rpe <= 8) f += 0.01;
  state.progress.factor = Math.round(clamp(f, 0.6, 1.5) * 100) / 100;
}

// ----- Статистика -----
export function minutesByDay(state, days = 7) {
  const today = dayKey();
  const out = [];
  for (let n = days - 1; n >= 0; n--) {
    const d = shiftDay(today, -n);
    out.push({ d, mins: state.sessions.filter(s => s.d === d).reduce((a, s) => a + s.mins, 0) });
  }
  return out;
}
export const weekMinutes = state => minutesByDay(state, 7).reduce((a, x) => a + x.mins, 0);
export function streak(state) {
  const set = new Set(state.sessions.map(s => s.d));
  let day = dayKey();
  if (!set.has(day)) day = shiftDay(day, -1);
  let n = 0;
  while (set.has(day)) {
    n += 1;
    day = shiftDay(day, -1);
  }
  return n;
}

const JOINT_GOALS = ["joints", "knees", "ankles", "shoulders", "program"];
export function newBadges(state) {
  const got = [];
  const check = (id, cond) => {
    if (!state.badges[id] && cond) {
      state.badges[id] = dayKey();
      got.push(id);
    }
  };
  const n = state.sessions.length;
  check("first", n >= 1);
  check("three", n >= 3);
  check("ten", n >= 10);
  check("twentyFive", n >= 25);
  const st = streak(state);
  check("streak3", st >= 3);
  check("streak7", st >= 7);
  check("who150", weekMinutes(state) >= 150);
  check("listener", state.sessions.some(s => s.pains.length > 0));
  check("mapper", state.marks.length > 0);
  check("painDown", painRegions(state).some(reg => {
    const t = painTrend(state, reg);
    return t && t.points.length >= 2 && t.peak - t.last >= 3;
  }));
  check("program", PROGRAMS.some(p => state.programs[p.id] && state.programs[p.id].done.length >= p.days));
  check("joints5", state.sessions.filter(s => JOINT_GOALS.includes(s.goal)).length >= 5);
  check("reader", state.guideRead.length >= 5);
  check("statics", Object.keys(state.records || {}).length >= 3);
  check("checkin7", state.checkins.length >= 7);
  check("water", state.water.d === dayKey() && state.water.n >= 8);
  check("early", state.sessions.some(s => s.hour < 8));
  check("flex5", state.sessions.filter(s => ["flexibility", "back", "evening"].includes(s.goal)).length >= 5);
  return got;
}

// ----- Напоминания: файл календаря (.ics) -----
export function makeICS(days, time, minutes) {
  const codes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const [hh, mm] = time.split(":").map(Number);
  const pad = n => String(n).padStart(2, "0");
  const fmt = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const now = new Date();
  let start = null;
  for (let i = 0; i < 8 && !start; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    d.setHours(hh, mm, 0, 0);
    const iso = ((d.getDay() + 6) % 7) + 1;
    if (days.includes(iso) && d > now) start = d;
  }
  const end = new Date(start.getTime() + minutes * 60000);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}@listopuls`;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Listopuls//Trainer//RU", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${days.map(d => codes[d - 1]).join(",")}`,
    "SUMMARY:Тренировка — Листопульс",
    "DESCRIPTION:Откройте приложение Листопульс и начните тренировку дня.",
    "BEGIN:VALARM", "TRIGGER:-PT10M", "ACTION:DISPLAY", "DESCRIPTION:Скоро тренировка", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", ""
  ].join("\r\n");
}
