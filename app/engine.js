// ===== Листопульс: логика подбора тренировок =====
// Чистые функции без доступа к DOM и сети. Всё считается на устройстве пользователя.
import { REGIONS, LOAD_KEYS, CONDITIONS, AGE_GROUPS, GOALS, EXERCISES, EX, QUICK, GROUPS, EQUIPMENT, PROGRAMS, WEIGHT_EQUIP, MORNING, CHALLENGES, RUN_WEEKS, RUN_DAYS } from "./data.js";

export const REGION_NAME = Object.fromEntries(REGIONS.map(r => [r.id, r.name]));
const REGION_BY_ID = Object.fromEntries(REGIONS.map(r => [r.id, r]));
const EQUIP_NAME = Object.fromEntries(EQUIPMENT.map(e => [e.id, e.name]));

const TAG_REASON = {
  impact: "без прыжков и ударной нагрузки",
  hi: "без высокой интенсивности",
  iso: "без долгой статики",
  inversion: "без положений головой вниз",
  overhead: "без нагрузки над головой",
  flexion: "без скручиваний позвоночника",
  heavy: "без тяжёлой штанги"
};

export const MODES = {
  recovery: { name: "Восстановление", short: "Отдых", k: 0.6, desc: "Тело просит отдыха: мягкая мобильность и дыхание." },
  light: { name: "Лёгкая", short: "Легко", k: 0.8, desc: "Меньше повторений и больше отдыха." },
  normal: { name: "Обычная", short: "Обычно", k: 1, desc: "Тренируемся в привычном темпе." },
  push: { name: "Посильнее", short: "Сильнее", k: 1.15, desc: "Вы в хорошей форме — можно немного прибавить." }
};

const LEVEL_K = { 1: 0.8, 2: 1, 3: 1.25 };
const REST = { 1: 40, 2: 30, 3: 25 };
const REST_SETS = { 1: 60, 2: 75, 3: 90 }; // отдых между силовыми подходами
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
  if (ex.type === "reps" && ex.weighted) return { id: ex.id, reps: clamp(Math.round(ex.base * (1 + (k - 1) * 0.5)), 4, 15) };
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
// Насколько похожи упражнения по нагрузке на суставы и мышцы — так замена ближе по движению
const similarity = (a, b) => Object.keys(a.load).reduce((sum, k) => sum + Math.min(a.load[k], b.load[k] || 0), 0);
// Несколько замен, от самой похожей: для выбора вручную в плеере
export function findReplacements(ex, r, profile, exclude = new Set(), n = 4) {
  const groups = RELATED[ex.group] || [ex.group];
  const pool = EXERCISES.filter(e => groups.includes(e.group) && e.id !== ex.id && !exclude.has(e.id) && fits(e, r, profile));
  pool.sort((a, b) =>
    groups.indexOf(a.group) - groups.indexOf(b.group) ||
    Math.max(0, a.level - ex.level) - Math.max(0, b.level - ex.level) ||
    similarity(ex, b) - similarity(ex, a) ||
    (b.weighted === ex.weighted) - (a.weighted === ex.weighted) ||
    (a.type !== ex.type) - (b.type !== ex.type) ||
    Math.abs(a.level - ex.level) - Math.abs(b.level - ex.level) ||
    totalLoad(a) - totalLoad(b));
  return pool.slice(0, n);
}
export function findReplacement(ex, r, profile, exclude = new Set()) {
  return findReplacements(ex, r, profile, exclude, 1)[0] || null;
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
    const sets = b.sets || 1;
    for (let round = 0; round < b.rounds; round++) {
      for (const it of b.items) {
        const ex = EX[it.id];
        total += (itemSeconds(it) + (b.kind === "main" || b.kind === "sets" ? s.rest : 8) + (ex.type === "hold" ? PREP_SEC : 0)) * sets;
        count += sets;
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
  // Усталость считаем на начало дня: план не меняется в течение дня от часа к часу
  const fatigue = muscleFatigue(state, new Date(`${day}T00:00:00`).getTime());
  const tired = LOAD_KEYS.filter(k => fatigue[k] >= 0.6);
  const choose = (group, maxLevel = 3, preferWeights = false, compound = false) => {
    let pool = EXERCISES.filter(e => e.group === group && !used.has(e.id) && e.level <= maxLevel && fits(e, r, p));
    if (!pool.length) return null;
    // Как у силовых тренеров: сначала мышцы, которые успели восстановиться
    const fresh = pool.filter(e => maxFatigue(e, fatigue) < 0.6);
    if (tired.length && fresh.length && rand() < 0.9) pool = fresh;
    const weighted = pool.filter(e => e.weighted);
    if (preferWeights && weighted.length && rand() < 0.85) pool = weighted;
    // Многосуставные упражнения (нагрузка на 3 и больше зон) — основа силовой тренировки
    const big = pool.filter(e => Object.keys(e.load).length >= 3);
    if (compound && big.length && rand() < 0.85) pool = big;
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
  const setsMode = !!goal.sets;
  if (setsMode) {
    // Силовые подходы: упражнений меньше, зато по 2–4 подхода с отдыхом
    const n = minutes <= 10 ? 2 : minutes <= 20 ? 3 : minutes <= 30 ? 4 : 6;
    groups = groups.slice(0, n);
  } else if (minutes <= 10) groups = groups.slice(0, 4);
  else if (minutes >= 45) groups = groups.concat(goal.main.slice(0, 2));
  else if (minutes >= 30) groups = groups.concat(goal.main.slice(0, 1));
  const hasWeights = p.equipment.some(e => WEIGHT_EQUIP.includes(e));
  // Если почти все упражнения группы нагружают уставшие мышцы — меняем её на другую, «свежую»
  if (tired.length) {
    const freshShare = g => {
      const all = EXERCISES.filter(e => e.group === g && fits(e, r, p));
      return all.length ? all.filter(e => maxFatigue(e, fatigue) < 0.6 && Object.keys(e.load).length >= 2).length / all.length : 0;
    };
    const alts = ["core", "pull", "push", "legs"].filter(g => freshShare(g) >= 0.4);
    let ai = 0;
    groups = groups.map(g => (freshShare(g) < 0.3 && alts.length ? alts[ai++ % alts.length] : g));
  }
  const main = [];
  const skipped = new Set();
  const seenGroup = {};
  for (const g of groups) {
    const first = !seenGroup[g];
    seenGroup[g] = true;
    const ex = choose(g, 3, !!goal.weights && hasWeights, setsMode && first);
    if (ex) main.push(makeItem(ex, goal.id === "flexibility" ? 1 : k));
    else skipped.add(g);
  }
  if (setsMode) s.rest = REST_SETS[level] + (mode === "light" ? 15 : 0);
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
  const rounds = main.length ? clamp(Math.round(avail / roundSec) || 1, setsMode ? 2 : 1, setsMode ? 4 : 6) : 0;

  s.blocks.push({ kind: "warm", name: "Разминка", rounds: 1, items: warm });
  if (main.length && setsMode) s.blocks.push({ kind: "sets", name: "Силовая часть", rounds: 1, sets: rounds, items: main });
  else if (main.length) s.blocks.push({ kind: "main", name: "Основная часть", rounds, items: main });
  if (balance.length) s.blocks.push({ kind: "balance", name: "Равновесие", rounds: 1, items: balance });
  if (cool.length) s.blocks.push({ kind: "cool", name: "Заминка", rounds: 1, items: cool });
  s.title = `${goal.short}: ${MODES[mode].name.toLowerCase()} тренировка`;
  for (const g of skipped) {
    s.adaptations.push(`Группа «${GROUPS[g]}» пропущена: с вашими ограничениями и инвентарём подходящих упражнений сейчас нет.`);
  }
  if (tired.length) s.adaptations.push(`Даём восстановиться мышцам после недавних тренировок: ${tired.map(k => KEY_NAME[k]).join(", ")}.`);
  explain(s, r, [...new Set(["warm", ...groups, "cool", "mobility", ...(r.balance ? ["balance"] : [])])]);
  return finalize(s);
}

// Тренировка из заданного списка упражнений: неподходящие заменяются безопасными
export function buildCustom(state, { title, ids, k = 1, kind = "custom", goal = "custom", rest = 8, rounds = 1 }) {
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
  s.blocks.push({ kind: "main", name: title, rounds: clamp(rounds, 1, 6), items });
  return finalize(s);
}

export function buildQuick(state, id) {
  const q = QUICK.find(x => x.id === id) || QUICK[0];
  const s = buildCustom(state, { title: q.name, ids: q.items, kind: "quick", goal: q.id, rounds: q.rounds || 1, rest: q.rest || 8 });
  s.quick = q.id;
  return s;
}

// ----- Утренняя зарядка -----
export function buildMorning(state, day = dayKey()) {
  const n = Math.floor(new Date(`${day}T12:00:00`).getTime() / 864e5);
  const items = MORNING[((n % MORNING.length) + MORNING.length) % MORNING.length];
  const s = buildCustom(state, { title: "Утренняя зарядка", ids: items, k: 0.8, kind: "morning", goal: "morning", rest: 0 });
  return s;
}

// ----- Челленджи на 30 дней -----
export function challengeState(state, id) {
  const c = CHALLENGES.find(x => x.id === id);
  const st = state.challenges[id];
  const done = st ? st.done.length : 0;
  const day = Math.min(done + 1, 30);
  const rest = !!c.rest && day % c.rest === 0;
  let target = 0, ex = null, items = null;
  if (c.unit === "reps" || c.unit === "sec") {
    target = Math.min(c.max, c.start + c.step * (day - 1));
    ex = Array.isArray(c.ex) ? c.ex[Math.min(c.ex.length - 1, Math.floor((day - 1) / 7.5))] : c.ex;
  } else if (c.unit === "walk") {
    target = Math.min(c.max, c.start + c.step * (day - 1));
  } else if (c.unit === "routine") {
    items = c.items[Math.min(c.items.length - 1, Math.floor((day - 1) / 7.5))];
  }
  // Один день челленджа — один календарный день
  const doneToday = !!st && st.last === dayKey();
  return { c, started: !!st, done, day, rest, target, ex, items, finished: done >= 30, doneToday };
}
export function buildChallengeDay(state, id) {
  const cs = challengeState(state, id);
  const { c } = cs;
  let s;
  if (c.unit === "routine") s = buildCustom(state, { title: `${c.name} · день ${cs.day}`, ids: cs.items, kind: "challenge", goal: "challenge", rest: 5 });
  else {
    const ex = EX[cs.ex];
    // Повторы распределяются на 2–4 подхода, чтобы не делать всё за один раз; удержание — одним подходом
    const sets = c.unit === "sec" ? 1 : cs.target >= 40 ? 4 : cs.target >= 20 ? 3 : 2;
    const k = cs.target / sets / ex.base;
    s = buildCustom(state, { title: `${c.name} · день ${cs.day}`, ids: [cs.ex], k, kind: "challenge", goal: "challenge", rest: 30, rounds: sets });
  }
  s.challenge = id;
  s.challengeDay = cs.day;
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
  const strength = prog.kind === "strength";
  const s = buildCustom(state, {
    title: `${prog.name} · занятие ${next}`, ids: phase.items, k: phase.k, kind: "program",
    goal: strength ? "strength" : "program", rest: prog.rest || 10, rounds: prog.rounds || 1
  });
  s.program = id;
  s.programDay = next;
  return s;
}

// Шаги тренировки для плеера: упражнения и отдых
export function flatten(session) {
  const steps = [];
  for (const b of session.blocks) {
    if (b.sets) {
      // Подходы подряд: упражнение × подходы, между подходами и упражнениями — отдых
      b.items.forEach((it, i) => {
        for (let set = 1; set <= b.sets; set++) {
          steps.push({ type: "ex", block: b.name, kind: b.kind, round: 1, rounds: 1, set, sets: b.sets, item: { ...it } });
          const last = set === b.sets && i === b.items.length - 1;
          if (session.rest && !last) steps.push({ type: "rest", sec: session.rest });
        }
      });
      continue;
    }
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

// ----- Рабочие веса -----
// Шаг изменения веса: маленькие гантели — по 0,5 кг, штанга — по 2,5 кг
export const weightStep = kg => (kg < 10 ? 0.5 : kg < 30 ? 1 : 2.5);
export const roundWeight = kg => Math.round(clamp(kg, 0.5, 500) * 2) / 2;
export function startWeight(ex) {
  if (ex.equip.includes("barbell")) return 20;
  if (ex.equip.includes("kettlebell")) return 8;
  return 3;
}
export function weightUnit(ex) {
  if (ex.equip.includes("barbell")) return "кг — общий вес штанги";
  if (ex.equip.includes("kettlebell")) return "кг — вес гири";
  return "кг — одна гантель";
}
// Оценка разового максимума по формуле Эпли — для сравнения подходов с разным числом повторов
export const e1rm = (kg, reps) => Math.round(kg * (1 + Math.min(reps, 15) / 30) * 10) / 10;
const emptyLift = () => ({ kg: 0, d: "", best: 0, hist: [], last: [], e1rm: 0, prD: "" });
export function recordWeight(state, exId, kg, day = dayKey()) {
  return recordSets(state, exId, [[kg, 0]], day);
}
// Подходы одного упражнения за тренировку: [[кг, повторы], ...]. Возвращает, побит ли рекорд
export function recordSets(state, exId, sets, day = dayKey()) {
  const clean = sets.filter(x => x[0] > 0).map(([kg, reps]) => [roundWeight(kg), reps || 0]);
  if (!clean.length) return { pr: false };
  const w = state.weights[exId] || emptyLift();
  const top = clean.reduce((a, b) => (b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]) ? b : a));
  const bestE = Math.max(...clean.map(([kg, reps]) => (reps ? e1rm(kg, reps) : 0)));
  const prev = w.e1rm || 0;
  const pr = prev > 0 && bestE > prev;
  w.kg = clean[clean.length - 1][0];
  w.d = day;
  w.best = Math.max(w.best || 0, top[0]);
  w.hist = (w.hist || []).filter(x => x[0] !== day).concat([top[1] ? [day, top[0], top[1]] : [day, top[0]]]).slice(-30);
  w.last = clean.filter(x => x[1]).slice(0, 10);
  if (bestE > prev) w.e1rm = bestE;
  if (pr) w.prD = day;
  state.weights[exId] = w;
  return { pr, e1rm: bestE };
}
// Двойная прогрессия: если в прошлый раз все подходы выполнены на целевые повторы — прибавить вес
export function suggestWeight(state, exId, targetReps) {
  const w = state.weights[exId];
  if (!w || !w.kg) return null;
  const last = (w.last || []).filter(x => x[0] === w.kg);
  if (last.length && targetReps && last.every(x => x[1] >= targetReps)) {
    const next = roundWeight(Math.max(w.kg * 1.05, w.kg + weightStep(w.kg)));
    return { kg: next, up: true };
  }
  return { kg: w.kg, up: false };
}

// ----- Восстановление мышц -----
// Нагрузка за последние 72 часа по зонам: чем больше подходов и тяжелее тренировка, тем дольше восстановление
export const KEY_NAME = {
  neck: "шея", shoulder: "плечи", elbow: "руки", wrist: "предплечья и кисти", upperBack: "верх спины", lowerBack: "поясница",
  hip: "ягодицы", knee: "передняя поверхность бёдер", ankle: "икры", chest: "грудь", abdomen: "пресс", groin: "приводящие мышцы",
  hamstring: "задняя поверхность бёдер"
};
export function muscleFatigue(state, now = Date.now()) {
  // Одна тренировка утомляет мышцу не больше чем на 100%, усталость спадает за 72 часа;
  // несколько тренировок подряд складываются, но тоже не больше 100%
  const fresh = Object.fromEntries(LOAD_KEYS.map(k => [k, 1]));
  for (const ss of state.sessions) {
    if (!ss.ex || !ss.ex.length) continue;
    const t = new Date(`${ss.d}T${String(ss.hour).padStart(2, "0")}:00:00`).getTime();
    const hours = (now - t) / 36e5;
    if (!(hours >= 0) || hours >= 72) continue;
    const decay = 1 - hours / 72;
    const effort = ss.rpe ? 0.6 + ss.rpe / 15 : 1;
    const raw = {};
    for (const [id, n] of ss.ex) {
      const ex = EX[id];
      if (!ex) continue;
      const w = ex.weighted ? 1.4 : ex.group === "warm" || ex.group === "cool" || ex.group === "mobility" ? 0.3 : 1;
      // Лёгкая нагрузка (1): сустав участвует, но мышцы почти не работают
      for (const [k, v] of Object.entries(ex.load)) raw[k] = (raw[k] || 0) + (v === 1 ? 0.5 : v) * n * w * effort;
    }
    for (const [k, v] of Object.entries(raw)) if (Object.prototype.hasOwnProperty.call(fresh, k)) fresh[k] *= 1 - Math.min(1, v / 16) * decay;
  }
  return Object.fromEntries(LOAD_KEYS.map(k => [k, Math.round((1 - fresh[k]) * 1000) / 1000]));
}
const maxFatigue = (ex, fat) => Math.max(0, ...Object.keys(ex.load).map(k => fat[k] || 0));

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
// Тренировки на текущей неделе (с понедельника), без прогулок и другой активности
export function weekWorkouts(state, day = dayKey()) {
  const d = new Date(`${day}T12:00:00`);
  const monday = shiftDay(day, -((d.getDay() + 6) % 7));
  return new Set(state.sessions.filter(x => x.d >= monday && x.d <= day && x.goal !== "activity").map(x => x.d)).size;
}
// ----- Недельные ориентиры ВОЗ (2020) -----
// Взрослым: 150–300 минут умеренной активности или 75–150 интенсивной (минута интенсивной = две умеренной)
// и силовые на основные мышцы не реже 2 дней в неделю. После 65 лет — ещё упражнения на равновесие
// и силу 3 дня в неделю. Подросткам: в среднем 60 минут в день, силовые и интенсивные — 3 дня в неделю.
const STRENGTH_GROUPS = ["legs", "push", "pull", "core", "iso"];
const isStrengthSession = s => s.goal === "strength" || s.goal === "muscle" ||
  (s.ex || []).reduce((a, [id, n]) => a + (EX[id] && STRENGTH_GROUPS.includes(EX[id].group) ? n : 0), 0) >= 4;
const isBalanceSession = s => s.goal === "balance" || (s.ex || []).some(([id]) => EX[id] && EX[id].group === "balance");
const isVigorous = s => (s.goal === "run" && s.mode !== "light") || s.goal === "hiit" || s.mode === "push" || s.rpe >= 7;
export function whoTargets(state) {
  const age = state.profile.ageGroup;
  if (age === "teen") return { mins: 420, strength: 3, balance: 0, teen: true };
  return { mins: 150, strength: 2, balance: age === "senior" ? 3 : 0, teen: false };
}
export function whoWeek(state, day = dayKey()) {
  const t = whoTargets(state);
  const from = shiftDay(day, -6);
  const list = state.sessions.filter(x => x.d >= from && x.d <= day);
  const raw = list.reduce((a, x) => a + x.mins, 0);
  const mins = t.teen ? raw : list.reduce((a, x) => a + x.mins * (isVigorous(x) ? 2 : 1), 0);
  const days = f => new Set(list.filter(f).map(x => x.d)).size;
  return { ...t, done: mins, raw, vigorous: list.filter(isVigorous).reduce((a, x) => a + x.mins, 0), strengthDays: days(isStrengthSession), balanceDays: days(isBalanceSession) };
}

// Серия недель, когда выполнен план по дням тренировок. Дни отдыха её не рвут — в отличие от серии дней
const mondayOf = d => shiftDay(d, -((new Date(`${d}T12:00:00`).getDay() + 6) % 7));
export function weekStreak(state, day = dayKey()) {
  const goal = Math.max(1, state.profile.days.length);
  const workoutDays = new Set(state.sessions.filter(x => x.goal !== "activity").map(x => x.d));
  const count = mon => { let n = 0; for (let i = 0; i < 7; i++) if (workoutDays.has(shiftDay(mon, i))) n += 1; return n; };
  let mon = mondayOf(day);
  let n = count(mon) >= goal ? 1 : 0;
  for (let i = 0; i < 520; i++) {
    mon = shiftDay(mon, -7);
    if (count(mon) >= goal) n += 1;
    else break;
  }
  return n;
}

// Итоги прошлой недели: для карточки в понедельник и картинки «Поделиться»
export function lastWeek(state, day = dayKey()) {
  const mon = shiftDay(mondayOf(day), -7);
  const sun = shiftDay(mon, 6);
  const list = state.sessions.filter(x => x.d >= mon && x.d <= sun);
  const workouts = new Set(list.filter(x => x.goal !== "activity").map(x => x.d)).size;
  const prs = Object.entries(state.weights || {}).filter(([, w]) => w.prD && w.prD >= mon && w.prD <= sun).map(([id]) => id);
  const badges = Object.values(state.badges).filter(d => d >= mon && d <= sun).length;
  const km = Math.round(list.reduce((a, x) => a + (x.km || 0), 0) * 10) / 10;
  return { mon, sun, workouts, goal: Math.max(1, state.profile.days.length), mins: list.reduce((a, x) => a + x.mins, 0), sessions: list.length, prs, badges, km };
}

// Правило 24 часов: если тренировка вызвала боль, на следующий день спрашиваем, как зона
export function pendingFollowup(state, day = dayKey()) {
  const from = shiftDay(day, -2);
  const list = state.sessions.slice(-60).filter(s => s.d >= from && s.d < day && s.pains.length && !s.after);
  list.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.hour - b.hour));
  return list.length ? list[list.length - 1] : null;
}

// Обхват талии: ориентиры, которые ВОЗ приводит для европейцев (у азиатов пороги ниже)
export function waistRisk(sex, cm) {
  if (!cm || (sex !== "m" && sex !== "f")) return null;
  const [up, high] = sex === "m" ? [94, 102] : [80, 88];
  return cm >= high ? 2 : cm >= up ? 1 : 0;
}

// ----- Бег с нуля -----
export function runSession(n) {
  const week = Math.min(RUN_WEEKS.length, Math.ceil(n / 3));
  const w = RUN_WEEKS[week - 1];
  if (w.days) return { week, run: w.days[(n - 1) % 3], walk: 0, reps: 1 };
  return { week, ...w };
}
const RUN_REGIONS = ["hip", "thighFront", "hamstring", "knee", "kneeBack", "shin", "calf", "achilles", "ankle", "foot", "heel", "toes"];
export function runState(state, day = dayKey()) {
  const st = state.run;
  const done = st ? st.done.length : 0;
  const next = Math.min(done + 1, RUN_DAYS);
  const r = restrictions(state, day);
  // Бег — ударная нагрузка: при запрете прыжков и бега или боли в ногах предлагаем ту же схему быстрой ходьбой
  const sore = RUN_REGIONS.filter(id => r.regionSev[id] >= 2);
  const walkOnly = r.banned.has("impact") || sore.length > 0;
  const why = r.banned.has("impact") ? `бег сейчас не подходит: ${r.banSource.impact}` : sore.length ? `бережём зону «${REGIONS.find(x => x.id === sore[0]).name.toLowerCase()}»` : "";
  return {
    started: !!st, done, next, finished: done >= RUN_DAYS, doneToday: !!st && st.last === day,
    yesterday: !!st && st.last === shiftDay(day, -1), walkOnly, why, blocked: r.block, session: runSession(next)
  };
}
// Шаги для плеера: разминка, интервалы бега и ходьбы, заминка
export function buildRunDay(state, n, walkOnly = false) {
  const s = runSession(n);
  const runLabel = walkOnly ? "Быстрая ходьба" : "Бег";
  const steps = [{ type: "work", sec: 300, label: "Разминка: бодрая ходьба", cue: "Постепенно ускоряйте шаг, руки согнуты", round: 0, rounds: 0 }];
  for (let i = 1; i <= s.reps; i++) {
    steps.push({ type: "work", sec: s.run, label: runLabel, cue: walkOnly ? "Широкий быстрый шаг, руки работают" : "Лёгкий темп: можно говорить фразами", round: i, rounds: s.reps });
    if (s.walk && i < s.reps) steps.push({ type: "rest", sec: s.walk, label: walkOnly ? "Спокойная ходьба" : "Ходьба", cue: "Восстановите дыхание, не останавливайтесь" });
  }
  steps.push({ type: "work", sec: 300, label: "Заминка: спокойная ходьба", cue: "Дыхание успокаивается, затем — растяжка икр и бёдер", round: 0, rounds: 0 });
  const session = { kind: "run", title: `${walkOnly ? "Ходьба по схеме бега" : "Бег с нуля"} · занятие ${n}`, goal: "run", mode: walkOnly ? "light" : "normal", runDay: n, walkOnly };
  return { session, steps };
}

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
  const lifts = Object.values(state.weights || {});
  check("lifter", lifts.length >= 5);
  check("stronger", lifts.some(w => w.hist.length >= 3 && w.best >= w.hist[0][1] * 1.2));
  check("builder", (state.custom || []).length > 0);
  check("pr", Object.values(state.weights || {}).some(w => !!w.prD));
  check("morning7", state.sessions.filter(x => x.goal === "morning").length >= 7);
  check("challenger", Object.values(state.challenges || {}).some(c => c.done.length >= 30));
  check("planner", weekWorkouts(state) >= Math.max(1, state.profile.days.length));
  check("checkin7", state.checkins.length >= 7);
  check("water", state.water.d === dayKey() && state.water.n >= 8);
  check("early", state.sessions.some(s => s.hour < 8));
  check("flex5", state.sessions.filter(s => ["flexibility", "back", "evening"].includes(s.goal)).length >= 5);
  check("steady", weekStreak(state) >= 4);
  check("runner", state.sessions.some(s => s.goal === "run"));
  check("run30", !!state.run && state.run.done.length >= RUN_DAYS);
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
