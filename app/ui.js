// ===== Листопульс: помощники интерфейса =====
// Элементы создаются только через createElement/textContent — никакого innerHTML.

const SVG_NS = "http://www.w3.org/2000/svg";

// h("button", { class: "btn", onClick: fn, "aria-label": "…" }, "Текст", childNode)
export function h(tag, props, ...children) {
  const node = document.createElement(tag);
  setProps(node, props);
  append(node, children);
  return node;
}

export function s(tag, props, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  setProps(node, props);
  append(node, children);
  return node;
}

function setProps(node, props) {
  if (!props) return;
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.setAttribute("class", value);
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style") Object.assign(node.style, value); // CSSOM: разрешено политикой безопасности
    else if (key.startsWith("on")) {
      if (typeof value !== "function") throw new TypeError(`Обработчик ${key} должен быть функцией`);
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "value" || key === "checked" || key === "disabled" || key === "hidden" || key === "selected") {
      node[key] = value;
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
}

function append(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
}

// ----- Иконки (контурные, 24×24) -----
const ICONS = {
  today: ["M12 3v2", "M12 19v2", "M4.2 4.2l1.4 1.4", "M18.4 18.4l1.4 1.4", "M3 12h2", "M19 12h2", "M4.2 19.8l1.4-1.4", "M18.4 5.6l1.4-1.4", "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"],
  workout: ["M6 7v10", "M18 7v10", "M3 9.5v5", "M21 9.5v5", "M6 12h12"],
  body: ["M12 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z", "M5 10l7 1 7-1", "M12 11v5", "M12 16l-3 6", "M12 16l3 6"],
  journal: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  lock: ["M7 11V8a5 5 0 0 1 10 0v3", "M5 11h14v10H5z"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  pause: ["M9 5v14", "M15 5v14"],
  play: ["M7 4l13 8-13 8z"],
  next: ["M5 5l9 7-9 7z", "M19 5v14"],
  info: ["M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z", "M12 16v-4", "M12 8h.01"],
  back: ["M15 18l-6-6 6-6"],
  chevron: ["M9 18l6-6-6-6"],
  check: ["M5 12l5 5L20 7"],
  sound: ["M11 5L6 9H3v6h3l5 4z", "M15.5 8.5a5 5 0 0 1 0 7", "M18.5 5.5a9 9 0 0 1 0 13"],
  mute: ["M11 5L6 9H3v6h3l5 4z", "M17 9l5 6", "M22 9l-5 6"],
  voice: ["M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z", "M19 11a7 7 0 0 1-14 0", "M12 18v3"],
  bolt: ["M13 2L4 14h7l-1 8 9-12h-7z"],
  shield: ["M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"],
  leaf: ["M5 19C5 10 11 5 20 4c0 9-5 15-14 15z", "M5 19l7-7"],
  timer: ["M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M12 10v4l2 2", "M9 2h6"],
  wind: ["M3 8h11a3 3 0 1 0-3-3", "M3 12h16a3 3 0 1 1-3 3", "M3 16h8"],
  book: ["M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z", "M20 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"],
  calendar: ["M4 6h16v15H4z", "M4 10h16", "M9 3v4", "M15 3v4"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4 21a8 8 0 0 1 16 0"],
  sliders: ["M4 6h10", "M18 6h2", "M4 12h4", "M12 12h8", "M4 18h12", "M20 18h0", "M16 4v4", "M10 10v4", "M18 16v4"],
  database: ["M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z", "M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6", "M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"],
  download: ["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"],
  phone: ["M7 2h10v20H7z", "M11 18h2"],
  doc: ["M6 2h9l5 5v15H6z", "M14 2v6h6", "M9 13h6", "M9 17h6"],
  drop: ["M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"],
  heart: ["M20.8 5.6a5 5 0 0 0-7.6 0L12 6.9l-1.2-1.3a5 5 0 0 0-7.6 6.6L12 21l8.8-8.8a5 5 0 0 0 0-6.6z"],
  refresh: ["M3 12a9 9 0 0 1 15.5-6.2L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15.5 6.2L3 16", "M3 21v-5h5"],
  alert: ["M12 3l10 18H2z", "M12 10v5", "M12 18h.01"],
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  aid: ["M4 7h16v13H4z", "M9 7V4h6v3", "M12 10.5v6", "M9 13.5h6"],
  trophy: ["M8 21h8", "M12 17v4", "M7 4h10v5a5 5 0 0 1-10 0z", "M7 6H4a3 3 0 0 0 3 4", "M17 6h3a3 3 0 0 1-3 4"],
  share: ["M12 3v12", "M7 8l5-5 5 5", "M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"],
  up: ["M12 19V5", "M5 12l7-7 7 7"],
  down: ["M12 5v14", "M19 12l-7 7-7-7"],
  chart: ["M4 19h16", "M5 15l4-4 4 3 6-7", "M15 7h4v4"],
  puzzle: ["M9 3h6v3a2 2 0 1 0 4 0h0V3h2v6h-3a2 2 0 1 0 0 4h3v8h-6v-3a2 2 0 1 0-4 0v3H3v-8h3a2 2 0 1 0 0-4H3V3h6z"],
  flag: ["M5 21V4", "M5 4h12l-2.5 4L17 12H5"],
  swap: ["M7 4L3 8l4 4", "M3 8h14", "M17 12l4 4-4 4", "M21 16H7"],
  calc: ["M6 3h12v18H6z", "M9 7h6", "M9 12h.01", "M12 12h.01", "M15 12h.01", "M9 16h.01", "M12 16h.01", "M15 16h.01"],
  print: ["M7 8V3h10v5", "M7 17H4V8h16v9h-3", "M7 14h10v7H7z"],
  scale: ["M4 4h16v16H4z", "M8 10a4 4 0 0 1 8 0", "M12 10l1.6-2.4"]
};

export function icon(name, size = 22) {
  const paths = ICONS[name] || ICONS.info;
  return s("svg", { class: "icon", width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
    paths.map(d => s("path", { d })));
}

// ----- Всплывающие сообщения -----
let toastTimer = null;
// action: { label, onClick } — кнопка в сообщении, например «Вернуть» после удаления
export function toast(message, { action = null } = {}) {
  let node = document.querySelector(".toast");
  if (!node) {
    node = h("div", { class: "toast glass", role: "status" });
    document.body.append(node);
  }
  const hide = () => node.classList.remove("is-visible");
  const parts = [h("span", { text: message })];
  if (action) parts.push(h("button", { class: "toast-btn", type: "button", text: action.label, onClick: () => { clearTimeout(toastTimer); hide(); action.onClick(); } }));
  node.replaceChildren(...parts);
  node.classList.toggle("has-action", !!action);
  requestAnimationFrame(() => node.classList.add("is-visible"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 7000 : 3000);
}

// ----- Нижняя панель-«шторка» -----
let openSheets = 0;
// Переход по ссылке внутри окна (например, к статье справочника) закрывает открытые окна
const openClosers = new Set();
export function closeSheets() {
  for (const close of [...openClosers]) close();
}
window.addEventListener("hashchange", closeSheets);
export function sheet({ title, body, actions = [], onClose, wide = false }) {
  const previousFocus = document.activeElement;
  const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;
  const panel = h("div", { class: `sheet glass${wide ? " sheet-wide" : ""}`, role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, tabindex: "-1" },
    h("div", { class: "sheet-handle", "aria-hidden": "true" }),
    h("div", { class: "sheet-head" },
      h("h2", { id: titleId, text: title }),
      h("button", { class: "icon-btn", type: "button", "aria-label": "Закрыть", onClick: () => close() }, icon("close"))
    ),
    h("div", { class: "sheet-body" }, body),
    actions.length ? h("div", { class: "sheet-actions" }, actions) : null
  );
  const backdrop = h("div", { class: "backdrop", onClick: e => { if (e.target === backdrop) close(); } }, panel);
  const onKey = e => {
    if (e.key === "Escape") close();
    if (e.key === "Tab") trapFocus(e, panel);
  };
  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    openClosers.delete(close);
    document.removeEventListener("keydown", onKey);
    backdrop.classList.add("is-closing");
    openSheets = Math.max(0, openSheets - 1);
    if (!openSheets) document.documentElement.classList.remove("no-scroll");
    setTimeout(() => backdrop.remove(), 180);
    if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true });
    if (onClose) onClose(result);
  }
  document.addEventListener("keydown", onKey);
  document.body.append(backdrop);
  openClosers.add(close);
  openSheets += 1;
  document.documentElement.classList.add("no-scroll");
  requestAnimationFrame(() => {
    backdrop.classList.add("is-open");
    panel.focus({ preventScroll: true });
  });
  return close;
}

function trapFocus(e, root) {
  const items = [...root.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(el => !el.disabled && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function confirmSheet({ title, message, ok = "Да", cancel = "Отмена", danger = false }) {
  return new Promise(resolve => {
    let result = false;
    const close = sheet({
      title,
      body: h("p", { class: "muted", text: message }),
      actions: [
        h("button", { class: "btn ghost", type: "button", text: cancel, onClick: () => close() }),
        h("button", { class: `btn ${danger ? "danger" : "primary"}`, type: "button", text: ok, onClick: () => { result = true; close(); } })
      ],
      onClose: () => resolve(result)
    });
  });
}

// ----- Выбор из вариантов (сегменты и чипы) -----
// options: [{ value, label }]; multiple — множественный выбор
export function choice({ options, value, onChange, multiple = false, label, className = "chips" }) {
  const current = new Set(multiple ? value : [value]);
  const group = h("div", { class: className, role: "group", "aria-label": label });
  const buttons = options.map(opt => {
    const b = h("button", { class: "chip", type: "button", "aria-pressed": current.has(opt.value) ? "true" : "false", "aria-label": opt.aria || null }, opt.icon || null, opt.label);
    b.addEventListener("click", () => {
      if (multiple) {
        if (current.has(opt.value)) current.delete(opt.value); else current.add(opt.value);
      } else {
        current.clear();
        current.add(opt.value);
      }
      buttons.forEach((btn, i) => btn.setAttribute("aria-pressed", current.has(options[i].value) ? "true" : "false"));
      onChange(multiple ? options.filter(o => current.has(o.value)).map(o => o.value) : opt.value);
    });
    return b;
  });
  group.append(...buttons);
  return group;
}

export function toggle({ label, desc, checked, onChange }) {
  const input = h("input", { type: "checkbox", class: "switch", checked, onChange: () => onChange(input.checked) });
  return h("label", { class: "row toggle-row" },
    h("span", { class: "row-text" }, h("b", { text: label }), desc ? h("span", { class: "muted small", text: desc }) : null),
    input
  );
}

// ----- Кольцо прогресса -----
export function ring(value, max, { size = 120, stroke = 12, label, sub } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const part = Math.max(0, Math.min(1, max ? value / max : 0));
  return h("div", { class: "ring", style: { width: `${size}px`, height: `${size}px` } },
    s("svg", { width: size, height: size, viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true" },
      s("circle", { class: "ring-track", cx: size / 2, cy: size / 2, r, "stroke-width": stroke, fill: "none" }),
      part > 0 ? s("circle", { class: "ring-value", cx: size / 2, cy: size / 2, r, "stroke-width": stroke, fill: "none", "stroke-linecap": "round", "stroke-dasharray": `${c * part} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }) : null
    ),
    h("div", { class: "ring-label" }, h("b", { text: label }), sub ? h("span", { text: sub }) : null)
  );
}

// ----- Звук, вибрация, голос -----
let audioCtx = null;
export function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) {
    audioCtx = null;
  }
}
export function beep(freq = 660, length = 0.25) {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + length);
}
export function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* не поддерживается */ }
}
export function speak(textValue) {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(textValue);
    u.lang = "ru-RU";
    u.rate = 1.02;
    const ru = window.speechSynthesis.getVoices().find(v => v.lang && v.lang.toLowerCase().startsWith("ru"));
    if (ru) u.voice = ru;
    window.speechSynthesis.speak(u);
  } catch (e) { /* голос недоступен */ }
}

// ----- Экран не гаснет во время тренировки -----
let wakeLock = null;
export async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) {
    wakeLock = null;
  }
}

// ----- Конфетти -----
export function confetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = h("canvas", { class: "fx-canvas", "aria-hidden": "true" });
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = window.innerWidth, hgt = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr;
  canvas.height = hgt * dpr;
  ctx.scale(dpr, dpr);
  document.body.append(canvas);
  const colors = ["#22c55e", "#facc15", "#38bdf8", "#f472b6", "#fb923c", "#a78bfa"];
  const parts = Array.from({ length: 150 }, () => {
    const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 8;
    return { x: w / 2, y: hgt / 3, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, size: 5 + Math.random() * 6, rot: Math.random() * 3, spin: (Math.random() - 0.5) * 0.3, color: colors[Math.floor(Math.random() * colors.length)] };
  });
  const life = 1800, start = performance.now();
  const frame = now => {
    const t = now - start;
    ctx.clearRect(0, 0, w, hgt);
    ctx.globalAlpha = Math.max(0, 1 - t / life);
    for (const p of parts) {
      p.vy += 0.25; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t < life) requestAnimationFrame(frame); else canvas.remove();
  };
  requestAnimationFrame(frame);
  setTimeout(() => canvas.remove(), life + 600);
}

// ----- Скачивание файла, созданного на устройстве -----
export function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h("a", { href: url, download: filename, class: "visually-hidden" });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}

export const mmss = sec => {
  const v = Math.max(0, Math.ceil(sec));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};
export const fmtDate = (key, opts = { day: "numeric", month: "long" }) => new Date(`${key}T12:00:00`).toLocaleDateString("ru-RU", opts);
