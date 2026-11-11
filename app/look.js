// ===== Листопульс: персонализация оформления =====
// Цвет, фон, шрифт, форма, расположение и схемы движений. Всё применяется через CSS-переменные
// и классы на <html>: таблица стилей задаёт значения по умолчанию, а здесь меняются только
// пользовательские. Цвета подбираются с проверкой контраста по WCAG 2.2 (текст — не ниже 4,5:1),
// поэтому любой выбранный цвет остаётся читаемым и в светлой, и в тёмной теме.

export const LOOK_KEY = "lpapp-look";

export const TAB_IDS = ["today", "workout", "body", "journal", "more"];
export const TAB_NAMES = { today: "Сегодня", workout: "Тренировки", body: "Тело", journal: "Прогресс", more: "Профиль" };
export const HOME_BLOCKS = [
  ["hero", "Тренировка на сегодня"], ["tasks", "Дела на сегодня"], ["fav", "Избранные тренировки"],
  ["week", "Неделя"], ["motto", "Мой девиз"], ["tip", "Совет дня"]
];
const HOME_IDS = HOME_BLOCKS.map(b => b[0]);

// Цвет акцента: исходный цвет, из которого считаются оттенки для кнопок, ссылок и тёмной темы
export const PALETTES = [
  { id: "forest", name: "Лес", seed: "#16a34a" },
  { id: "mint", name: "Мята", seed: "#0d9488" },
  { id: "sky", name: "Небо", seed: "#0284c7" },
  { id: "ocean", name: "Океан", seed: "#2563eb" },
  { id: "lavender", name: "Лаванда", seed: "#7c3aed" },
  { id: "berry", name: "Ягода", seed: "#db2777" },
  { id: "sunset", name: "Закат", seed: "#ea580c" },
  { id: "graphite", name: "Графит", seed: "#475569" }
];
const PALETTE_IDS = PALETTES.map(p => p.id);

// Фоны: основной цвет, второй цвет градиента и три мягких пятна (для светлой и тёмной темы)
export const BACKGROUNDS = [
  { id: "soft", name: "Мягкий" },
  { id: "warm", name: "Тёплый", l: ["#fbf5ef", "#f8ecef", "rgba(251, 146, 60, .26)", "rgba(244, 114, 182, .20)", "rgba(250, 204, 21, .18)"], d: ["#130f0c", "#150d14", "rgba(251, 146, 60, .16)", "rgba(244, 114, 182, .12)", "rgba(250, 204, 21, .06)"] },
  { id: "cool", name: "Прохладный", l: ["#eef4fb", "#efeefb", "rgba(56, 189, 248, .26)", "rgba(167, 139, 250, .22)", "rgba(45, 212, 191, .16)"], d: ["#090f17", "#0d0b18", "rgba(56, 189, 248, .17)", "rgba(167, 139, 250, .15)", "rgba(45, 212, 191, .08)"] },
  { id: "aurora", name: "Сияние", l: ["#eef7f6", "#f2eefb", "rgba(45, 212, 191, .28)", "rgba(167, 139, 250, .24)", "rgba(244, 114, 182, .14)"], d: ["#071211", "#0e0a17", "rgba(45, 212, 191, .2)", "rgba(167, 139, 250, .17)", "rgba(244, 114, 182, .08)"] },
  { id: "paper", name: "Бумага", l: ["#faf7f0", "#f6f1e6", "transparent", "transparent", "transparent"], d: ["#12110f", "#151310", "transparent", "transparent", "transparent"] },
  { id: "plain", name: "Однотонный", l: ["#f3f5f4", "#f3f5f4", "transparent", "transparent", "transparent"], d: ["#0c0f0e", "#0c0f0e", "transparent", "transparent", "transparent"] },
  { id: "photo", name: "Своё фото" }
];
const BG_IDS = BACKGROUNDS.map(b => b.id);

// Шрифты встроены в приложение (папка fonts, лицензия OFL) и работают без интернета.
// Файл шрифта загружается, только когда его выбрали
export const FONTS = [
  { id: "system", name: "Системный", stack: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' },
  { id: "rounded", name: "Округлый", stack: '"LP Nunito", system-ui, sans-serif' },
  { id: "modern", name: "Современный", stack: '"LP Rubik", system-ui, sans-serif' },
  { id: "serif", name: "С засечками", stack: '"LP PT Serif", Georgia, "Times New Roman", serif' },
  { id: "mono", name: "Моноширинный", stack: '"LP JetBrains Mono", ui-monospace, Menlo, Consolas, monospace' }
];
export const HEAD_FONTS = [
  { id: "same", name: "Как текст" },
  ...FONTS.filter(f => f.id !== "system"),
  { id: "playful", name: "Игривый", stack: '"LP Comfortaa", system-ui, sans-serif' },
  { id: "hand", name: "Рукописный", stack: '"LP Caveat", "Segoe Print", cursive' }
];
const FONT_IDS = FONTS.map(f => f.id);
const HEAD_IDS = HEAD_FONTS.map(f => f.id);

// Тело на 3D-модели и фигуры в схемах: как в профиле, мужское или женское
export const SEXES = [{ value: "auto", label: "Как в профиле" }, { value: "m", label: "Мужское" }, { value: "f", label: "Женское" }];
export const RADII = [{ value: "soft", label: "Мягкие" }, { value: "calm", label: "Сдержанные" }, { value: "sharp", label: "Прямые" }];
export const DENSITY = [{ value: "airy", label: "Просторно" }, { value: "normal", label: "Обычно" }, { value: "compact", label: "Компактно" }];
export const FIGURES = [
  { id: "auto", name: "Как у темы" },
  { id: "accent", name: "Цвет акцента" },
  { id: "slate", name: "Графит", l: ["#475569", "#b6c0cc"], d: ["#cbd5e1", "#64748b"] },
  { id: "warm", name: "Тёплый", l: ["#7c5c47", "#cdb8a8"], d: ["#e7d5c7", "#8a7362"] },
  { id: "ink", name: "Контрастный", l: ["#111827", "#9ca3af"], d: ["#f9fafb", "#6b7280"] }
];
// Цвет 3D-манекена: светлая и тёмная тема, доли RGB
export const BODIES = [
  { id: "mint", name: "Мятный", l: [0.86, 0.91, 0.89], d: [0.55, 0.62, 0.6] },
  { id: "light", name: "Светлый", l: [0.93, 0.93, 0.92], d: [0.64, 0.65, 0.66] },
  { id: "warm", name: "Тёплый", l: [0.93, 0.86, 0.79], d: [0.63, 0.56, 0.5] },
  { id: "slate", name: "Графит", l: [0.74, 0.77, 0.81], d: [0.44, 0.47, 0.52] }
];
export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5];
// Тон кожи фигур в схемах движений и цвет волос к нему
export const SKINS = [
  { id: "light", name: "Светлый", c: "#f2d1b3", hair: "#6b4a2f" },
  { id: "medium", name: "Средний", c: "#e2b08a", hair: "#3b2a20" },
  { id: "tan", name: "Смуглый", c: "#c58b5f", hair: "#2a1d16" },
  { id: "brown", name: "Тёмный", c: "#8f5c3a", hair: "#1c1410" },
  { id: "deep", name: "Очень тёмный", c: "#5e3c27", hair: "#14100d" }
];
// Вид фигуры в схемах: объёмная (3D, как в профессиональных библиотеках упражнений), рисунок или силуэт
export const FIG_STYLES = [{ value: "3d", label: "Объёмная" }, { value: "detail", label: "Рисунок" }, { value: "flat", label: "Силуэт" }];
export const EMOJI = ["🌿", "🍃", "🌳", "🌸", "🍀", "🌞", "🌙", "⭐", "🔥", "⚡", "💪", "🏃", "🧘", "🚴", "🏊", "🎯", "🏔️", "🌊", "🦊", "🐻", "🐼", "🦁", "🐯", "🐨"];

// Готовые стили: один нажатием меняют сразу цвет, фон, шрифты и форму
export const PRESETS = [
  { id: "classic", name: "Листопульс", desc: "Зелёный, мягкое стекло", set: { accent: "forest", bg: "soft", font: "system", head: "same", radius: "soft", density: "normal", glass: true } },
  { id: "ocean", name: "Океан", desc: "Синий, округлый шрифт", set: { accent: "ocean", bg: "cool", font: "rounded", head: "same", radius: "soft", density: "normal", glass: true } },
  { id: "sunset", name: "Закат", desc: "Тёплые тона, игривые заголовки", set: { accent: "sunset", bg: "warm", font: "rounded", head: "playful", radius: "soft", density: "normal", glass: true } },
  { id: "lavender", name: "Лаванда", desc: "Фиолетовое сияние", set: { accent: "lavender", bg: "aurora", font: "modern", head: "same", radius: "soft", density: "normal", glass: true } },
  { id: "notebook", name: "Блокнот", desc: "Бумага, засечки, рукописные заголовки", set: { accent: "graphite", bg: "paper", font: "serif", head: "hand", radius: "calm", density: "normal", glass: false } },
  { id: "minimal", name: "Минимализм", desc: "Без стекла, прямые углы, плотно", set: { accent: "graphite", bg: "plain", font: "system", head: "same", radius: "sharp", density: "compact", glass: false } },
  { id: "contrast", name: "Чёткий", desc: "Крупный жирный текст, без прозрачности", set: { accent: "ocean", bg: "plain", font: "system", head: "same", radius: "calm", density: "airy", glass: false, bold: true, reading: true, scale: 115 } }
];
const PRESET_IDS = PRESETS.map(p => p.id);

export const defaultLook = () => ({
  v: 2, preset: "classic", accent: "forest", custom: "", bg: "soft", blur: 6, dim: 45,
  font: "system", head: "same", scale: 100, bold: false, reading: false,
  radius: "soft", density: "normal", glass: true,
  tabs: [...TAB_IDS], labels: true, start: "today",
  home: HOME_IDS.map(id => [id, true]),
  avatar: "letter", emoji: "🌿",
  figure: "auto", muscles: true, speed: 1, body: "mint", still: false, fx: true,
  skin: "medium", figstyle: "3d", sex: "auto"
});

// ----- Проверка сохранённых значений -----
const isObj = v => v !== null && typeof v === "object" && !Array.isArray(v);
const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const bool = (v, def) => (typeof v === "boolean" ? v : def);
const intIn = (v, min, max, def) => (Number.isInteger(v) && v >= min && v <= max ? v : def);
export const isHex = v => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

export function sanitizeLook(raw) {
  const d = defaultLook();
  if (!isObj(raw)) return d;
  d.preset = oneOf(raw.preset, [...PRESET_IDS, "custom"], d.preset);
  d.custom = isHex(raw.custom) ? raw.custom.toLowerCase() : "";
  d.accent = raw.accent === "custom" && d.custom ? "custom" : oneOf(raw.accent, PALETTE_IDS, d.accent);
  d.bg = oneOf(raw.bg, BG_IDS, d.bg);
  d.blur = intIn(raw.blur, 0, 24, d.blur);
  d.dim = intIn(raw.dim, 20, 85, d.dim);
  d.font = oneOf(raw.font, FONT_IDS, d.font);
  d.head = oneOf(raw.head, HEAD_IDS, d.head);
  d.scale = intIn(raw.scale, 85, 130, d.scale);
  d.bold = bool(raw.bold, d.bold);
  d.reading = bool(raw.reading, d.reading);
  d.radius = oneOf(raw.radius, RADII.map(x => x.value), d.radius);
  d.density = oneOf(raw.density, DENSITY.map(x => x.value), d.density);
  d.glass = bool(raw.glass, d.glass);
  // Вкладки: перестановка всех пяти, без повторов и пропусков
  if (Array.isArray(raw.tabs) && raw.tabs.length === TAB_IDS.length && TAB_IDS.every(t => raw.tabs.includes(t))) d.tabs = [...raw.tabs];
  d.labels = bool(raw.labels, d.labels);
  d.start = oneOf(raw.start, TAB_IDS, d.start);
  // Блоки главного экрана: известные блоки в сохранённом порядке, недостающие — в конец
  if (Array.isArray(raw.home)) {
    const seen = new Set();
    const list = [];
    for (const x of raw.home) {
      if (!Array.isArray(x) || x.length !== 2 || !HOME_IDS.includes(x[0]) || seen.has(x[0]) || typeof x[1] !== "boolean") continue;
      seen.add(x[0]);
      list.push([x[0], x[1]]);
    }
    for (const id of HOME_IDS) if (!seen.has(id)) list.push([id, true]);
    d.home = list;
  }
  d.avatar = oneOf(raw.avatar, ["letter", "emoji", "photo"], d.avatar);
  d.emoji = oneOf(raw.emoji, EMOJI, d.emoji);
  d.figure = oneOf(raw.figure, FIGURES.map(f => f.id), d.figure);
  d.muscles = bool(raw.muscles, d.muscles);
  d.speed = oneOf(raw.speed, SPEEDS, d.speed);
  d.body = oneOf(raw.body, BODIES.map(b => b.id), d.body);
  d.still = bool(raw.still, d.still);
  d.fx = bool(raw.fx, d.fx);
  d.skin = oneOf(raw.skin, SKINS.map(x => x.id), d.skin);
  d.figstyle = oneOf(raw.figstyle, FIG_STYLES.map(x => x.value), d.figstyle);
  // до версии 2 «Детальная» была видом по умолчанию — теперь по умолчанию объёмная фигура
  if (!(Number(raw.v) >= 2) && raw.figstyle === "detail") d.figstyle = "3d";
  d.sex = oneOf(raw.sex, SEXES.map(x => x.value), d.sex);
  return d;
}

export function loadLook() {
  try { return sanitizeLook(JSON.parse(localStorage.getItem(LOOK_KEY))); } catch (e) { return defaultLook(); }
}
export function saveLook(look) {
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
    return true;
  } catch (e) {
    return false;
  }
}
// ----- Цвет и контраст -----
const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = c => `#${c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
const lin = v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const lum = c => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export const contrast = (a, b) => {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
function rgbToHsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const dd = max - min;
  const s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
  let h;
  if (max === R) h = (G - B) / dd + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / dd + 2;
  else h = (R - G) / dd + 4;
  return [h / 6, s, l];
}
function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = t => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
// Затемняет (dir = −1) или осветляет (dir = +1) цвет, пока контраст с фоном не станет достаточным
function fit(rgb, against, ratio, dir) {
  const [h, s, l0] = rgbToHsl(rgb);
  let l = l0;
  for (let i = 0; i < 101; i++) {
    const c = hslToRgb([h, s, l]).map(Math.round);
    if (contrast(c, against) >= ratio) return c;
    l = Math.max(0, Math.min(1, l + dir * 0.01));
  }
  return dir < 0 ? [0, 0, 0] : [255, 255, 255];
}
const rgba = (c, a) => `rgba(${c.map(Math.round).join(", ")}, ${a})`;
const mixRgb = (a, b, w) => a.map((v, i) => v + (b[i] - v) * w);

const WHITE = [255, 255, 255];
const LIGHT_BG = [233, 239, 249]; // самый тёмный из светлых фонов — проверка с запасом
const DARK_BG = [10, 17, 14];
const DARK_GLASS = [27, 37, 33];

// Оттенки акцента для светлой и тёмной темы
export function accentSet(seedHex) {
  const seed = hexToRgb(seedHex);
  const accent = fit(seed, WHITE, 4.8, -1); // кнопка с белой надписью
  const text = fit(accent, LIGHT_BG, 6, -1); // ссылки и подписи на светлом фоне
  const accentDk = fit(fit(seed, DARK_BG, 7.5, 1), DARK_GLASS, 6, 1); // яркий цвет на тёмном фоне
  const [h, s] = rgbToHsl(accentDk);
  let inkDk = hslToRgb([h, Math.min(s, 0.7), 0.1]).map(Math.round);
  if (contrast(inkDk, accentDk) < 4.5) inkDk = [0, 0, 0];
  return {
    accent: toHex(accent), text: toHex(text), ink: "#ffffff", soft: rgba(accent, 0.12), blob: rgba(seed, 0.28),
    accentDk: toHex(accentDk), textDk: toHex(accentDk), inkDk: toHex(inkDk), softDk: rgba(accentDk, 0.14), blobDk: rgba(seed, 0.2),
    rim: accent.map(v => v / 255), rimDk: accentDk.map(v => v / 255)
  };
}
// Исходный цвет текущего акцента
export function seedOf(look) {
  if (look.accent === "custom" && isHex(look.custom)) return look.custom;
  return (PALETTES.find(p => p.id === look.accent) || PALETTES[0]).seed;
}

// ----- Применение -----
const VARS = ["accent", "accent-text", "accent-ink", "accent-soft", "bg", "bg2", "blob-a", "blob-b", "blob-c", "demo-body", "demo-far", "demo-shorts", "demo-skin", "demo-hair"];
const ROOT_CLASSES = ["less-glass", "bg-photo", "r-calm", "r-sharp", "d-airy", "d-compact", "bold-text", "read-ease", "head-hand", "tabs-icons", "no-muscles", "no-fx", "still", "demo-flat"];

// photoUrl — адрес blob: картинки фона, если она есть
export function applyLook(look, { photoUrl = "" } = {}) {
  const root = document.documentElement;
  const st = root.style;
  for (const v of VARS) { st.removeProperty(`--u-${v}`); st.removeProperty(`--u-${v}-dk`); }
  const set = (name, light, dark) => {
    if (light) st.setProperty(`--u-${name}`, light);
    if (dark) st.setProperty(`--u-${name}-dk`, dark);
  };
  // «Лес» — фирменный цвет: значения по умолчанию из таблицы стилей
  const colors = look.accent === "forest" ? null : accentSet(seedOf(look));
  if (colors) {
    set("accent", colors.accent, colors.accentDk);
    set("accent-text", colors.text, colors.textDk);
    set("accent-ink", colors.ink, colors.inkDk);
    set("accent-soft", colors.soft, colors.softDk);
    set("blob-a", colors.blob, colors.blobDk);
  }
  const bg = BACKGROUNDS.find(b => b.id === look.bg);
  if (bg && bg.l) {
    set("bg", bg.l[0], bg.d[0]);
    set("bg2", bg.l[1], bg.d[1]);
    set("blob-a", bg.id === "paper" || bg.id === "plain" ? "transparent" : bg.l[2], bg.id === "paper" || bg.id === "plain" ? "transparent" : bg.d[2]);
    set("blob-b", bg.l[3], bg.d[3]);
    set("blob-c", bg.l[4], bg.d[4]);
  }
  // Цвет фигуры (в детальном виде — цвет одежды; шорты темнее футболки)
  const fig = FIGURES.find(f => f.id === look.figure);
  let shirt = null;
  if (fig && fig.l) {
    shirt = [fig.l[0], fig.d[0]];
    set("demo-far", fig.l[1], fig.d[1]);
  } else if (look.figure === "accent") {
    const c = accentSet(seedOf(look));
    const a = hexToRgb(c.accent), ad = hexToRgb(c.accentDk);
    shirt = [toHex(mixRgb(a, [0, 0, 0], 0.15)), toHex(mixRgb(ad, WHITE, 0.15))];
    set("demo-far", toHex(mixRgb(a, WHITE, 0.6)), toHex(mixRgb(ad, DARK_BG, 0.55)));
  }
  if (shirt) {
    set("demo-body", shirt[0], shirt[1]);
    set("demo-shorts", toHex(mixRgb(hexToRgb(shirt[0]), [0, 0, 0], 0.42)), toHex(mixRgb(hexToRgb(shirt[1]), DARK_BG, 0.35)));
  }
  const skin = SKINS.find(x => x.id === look.skin);
  if (skin && skin.id !== "medium") {
    set("demo-skin", skin.c, skin.c);
    set("demo-hair", skin.hair, skin.hair);
  }
  // Шрифты и размер текста
  const font = FONTS.find(f => f.id === look.font) || FONTS[0];
  const head = look.head === "same" ? null : HEAD_FONTS.find(f => f.id === look.head);
  if (look.font === "system") st.removeProperty("--font-body"); else st.setProperty("--font-body", font.stack);
  if (head && head.stack) st.setProperty("--font-head", head.stack); else st.removeProperty("--font-head");
  if (look.scale === 100) st.removeProperty("--u-scale"); else st.setProperty("--u-scale", `${look.scale}%`);
  // Фото фона
  const photo = look.bg === "photo" && photoUrl;
  if (photo) {
    st.setProperty("--u-photo", `url("${photoUrl}")`);
    st.setProperty("--u-blur", `${look.blur}px`);
    st.setProperty("--u-dim", String(look.dim / 100));
  } else {
    st.removeProperty("--u-photo");
    st.removeProperty("--u-blur");
    st.removeProperty("--u-dim");
  }
  const want = new Set();
  if (!look.glass) want.add("less-glass");
  if (photo) want.add("bg-photo");
  if (look.radius !== "soft") want.add(`r-${look.radius}`);
  if (look.density !== "normal") want.add(`d-${look.density}`);
  if (look.bold) want.add("bold-text");
  if (look.reading) want.add("read-ease");
  if (look.head === "hand") want.add("head-hand");
  if (!look.labels) want.add("tabs-icons");
  if (!look.muscles) want.add("no-muscles");
  if (!look.fx) want.add("no-fx");
  if (look.still) want.add("still");
  if (look.figstyle === "flat") want.add("demo-flat");
  for (const c of ROOT_CLASSES) root.classList.toggle(c, want.has(c));
  // Цвет строки состояния телефона — в тон фону
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (metas.length === 2) {
    metas[0].setAttribute("content", bg && bg.l ? bg.l[0] : "#eef5f1");
    metas[1].setAttribute("content", bg && bg.d ? bg.d[0] : "#0b120f");
  }
}

// Цвет 3D-манекена и подсветки контура
export function bodyColors(look, dark) {
  const b = BODIES.find(x => x.id === look.body) || BODIES[0];
  const base = dark ? b.d : b.l;
  if (look.accent === "forest") return { base, rim: null };
  const c = accentSet(seedOf(look));
  return { base, rim: dark ? c.rimDk : c.rim };
}

// ----- Код стиля: можно передать другу или перенести на другой телефон -----
// В код попадает только оформление — без фото, имени и сведений о здоровье
export function lookCode(look) {
  // В код идут только отличия от оформления по умолчанию — так он короче
  const def = defaultLook();
  const src = { ...look, avatar: look.avatar === "photo" ? "letter" : look.avatar, bg: look.bg === "photo" ? "soft" : look.bg };
  const diff = {};
  for (const k of Object.keys(def)) if (k !== "v" && k !== "preset" && JSON.stringify(src[k]) !== JSON.stringify(def[k])) diff[k] = src[k];
  const json = JSON.stringify(diff);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `LP1-${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
export function parseLookCode(code) {
  const m = /^LP1-([A-Za-z0-9_-]{2,4000})$/.exec(String(code || "").trim());
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)));
    const raw = JSON.parse(json);
    return isObj(raw) ? sanitizeLook(raw) : null;
  } catch (e) {
    return null;
  }
}

// Превью фона для плиток выбора: тот же градиент, что и на экране
export function bgPreview(id, dark) {
  const bg = BACKGROUNDS.find(b => b.id === id);
  if (!bg || !bg.l) {
    const def = dark ? ["#0a110e", "#0b1120", "rgba(34, 197, 94, .20)", "rgba(56, 189, 248, .15)"] : ["#f1f7f3", "#e9eff9", "rgba(34, 197, 94, .30)", "rgba(56, 189, 248, .24)"];
    return `radial-gradient(60% 50% at 20% 15%, ${def[2]}, transparent 70%), radial-gradient(55% 45% at 85% 70%, ${def[3]}, transparent 70%), linear-gradient(160deg, ${def[0]}, ${def[1]})`;
  }
  const v = dark ? bg.d : bg.l;
  return `radial-gradient(60% 50% at 20% 15%, ${v[2]}, transparent 70%), radial-gradient(55% 45% at 85% 70%, ${v[3]}, transparent 70%), linear-gradient(160deg, ${v[0]}, ${v[1]})`;
}

// ----- Картинки: уменьшение и пересжатие на устройстве -----
// Пересжатие убирает метаданные (в том числе геометку из фото) и ограничивает размер.
// square — обрезать по центру в квадрат (для аватара)
export async function processImage(file, { max = 1440, square = false, quality = 0.8 } = {}) {
  if (!file || !/^image\//.test(file.type || "image/") || file.size > 25 * 1024 * 1024) throw new Error("Выберите картинку до 25 МБ");
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch (e) {
    throw new Error("Не удалось открыть картинку");
  }
  let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
  if (square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2;
    sy = (sh - side) / 2;
    sw = sh = side;
  }
  const k = Math.min(1, max / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), hgt = Math.max(1, Math.round(sh * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, hgt);
  if (bmp.close) bmp.close();
  const toBlob = type => new Promise(resolve => canvas.toBlob(resolve, type, quality));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
  if (!blob) throw new Error("Не удалось обработать картинку");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Не удалось обработать картинку"));
    reader.readAsDataURL(blob);
  });
}
// data:-строка из хранилища → адрес blob: для показа (CSP разрешает только свои blob:)
export function dataUrlToBlobUrl(dataUrl) {
  const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl || "");
  if (!m) return "";
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: m[1] }));
  } catch (e) {
    return "";
  }
}
