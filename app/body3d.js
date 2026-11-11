// ===== Листопульс: 3D-модель человека =====
// WebGL 1 без сторонних библиотек. Фигура строится процедурно из гладких поверхностей вращения,
// каждая вершина знает свою зону тела и сторону. Касание и обводка определяют зону по «карте
// идентификаторов» — отдельному кадру, где каждая зона закрашена своим кодом.

const SELECT = [0.18, 0.72, 0.86]; // цвет выделения при обводке

// ----- Векторы -----
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ----- Матрицы (по столбцам, как в WebGL) -----
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = v;
    }
  }
  return o;
}
const rotX = t => { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const rotY = t => { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
const trans = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);

// ----- Геометрия -----
// Фигура собирается из гладких «трубок»: туловище и голова — из колец по высоте, руки, ноги, пальцы
// и стопы — протяжкой сечения вдоль сплайна. Мышечный рельеф задаётся смещениями сечения.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

// Сплайн Катмулла — Рома по строкам чисел; t от 0 до rows.length - 1
function catmull(rows, t) {
  const n = rows.length - 1;
  const i = Math.min(Math.max(Math.floor(t), 0), n - 1), f = t - i;
  const p0 = rows[Math.max(i - 1, 0)], p1 = rows[i], p2 = rows[i + 1], p3 = rows[Math.min(i + 2, n)];
  const f2 = f * f, f3 = f2 * f;
  return p1.map((_, k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * f3));
}
// Таблица значений на равномерной сетке от 0 до 1 — гладкая интерполяция
const table = (rows, v) => catmull(rows, Math.min(1, Math.max(0, v)) * (rows.length - 1));

// Трубка из rings колец по segs точек; point(i, j) → { p, c, u }; classify(p, dir, u) → [зона, сторона]
function tube(mesh, rings, segs, point, classify) {
  const row = segs + 1;
  const base = mesh.count;
  const P = new Array(rings * row), C = new Array(rings), U = new Array(rings);
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const q = point(i, j);
      P[i * row + j] = q.p;
      if (j === 0) { C[i] = q.c; U[i] = q.u; }
    }
    P[i * row + segs] = P[i * row];
  }
  for (let i = 0; i < rings; i++) {
    const endDir = i < rings / 2 ? sub(C[0], C[Math.min(1, rings - 1)]) : sub(C[rings - 1], C[Math.max(rings - 2, 0)]);
    for (let j = 0; j <= segs; j++) {
      const p = P[i * row + j], jj = j % segs;
      const pR = P[i * row + (jj + 1) % segs], pL = P[i * row + (jj - 1 + segs) % segs];
      const pU = P[Math.min(i + 1, rings - 1) * row + j], pD = P[Math.max(i - 1, 0) * row + j];
      const radial = sub(p, C[i]);
      const flat = len(radial) < 1e-5;
      let n = cross(sub(pR, pL), sub(pU, pD));
      if (flat || len(n) < 1e-12) n = flat ? endDir : radial;
      else if (dot(n, radial) < 0) n = scale(n, -1);
      n = norm(n);
      const [region, side] = classify(p, flat ? n : norm(radial), U[i]);
      mesh.push(p, n, region, side);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const v = base + i * row + j, w = v + row;
      mesh.idx.push(v, w, v + 1, v + 1, w, w + 1);
    }
  }
}

// «Лофт» по высоте: rows — [y, полуширина, глубина спереди, глубина сзади, сдвиг центра по z];
// bump(x, y, z, dir) добавляет рельеф вдоль направления от оси
// warp(f) — угол сечения для доли f обхода (по умолчанию равномерно): позволяет сгустить сетку спереди
function loft(mesh, { rows, step, segs, power, bump, classify, warp }) {
  const samples = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const n = Math.max(1, Math.round((rows[i + 1][0] - rows[i][0]) / step));
    for (let k = 0; k < n; k++) samples.push(catmull(rows, i + k / n));
  }
  samples.push(rows[rows.length - 1]);
  const y0 = rows[0][0], y1 = rows[rows.length - 1][0];
  tube(mesh, samples.length, segs, (i, j) => {
    const [y, W0, Df0, Db0, zc] = samples[i];
    const W = Math.max(0, W0), Df = Math.max(0, Df0), Db = Math.max(0, Db0);
    const th = warp ? warp(j / segs) : (j / segs) * Math.PI * 2;
    const ct = Math.cos(th), st = Math.sin(th);
    const x = W * spow(st, 2 / power);
    const z = (ct >= 0 ? Df : Db) * spow(ct, 2 / power);
    const pole = Math.hypot(x, z) < 1e-6;
    const dir = pole ? [0, 0, 1] : norm([x, 0, z]);
    const extra = bump && !pole ? bump(x, y, z, dir) : 0;
    return { p: [x + dir[0] * extra, y, zc + z + dir[2] * extra], c: [0, y, zc], u: (y - y0) / (y1 - y0) };
  }, classify);
}

// Протяжка сечения вдоль сплайна через точки pts. shape(u, ct, st, K) → [вдоль e1, вдоль e2];
// e1 — проекция ref на плоскость сечения (обычно «вперёд»), e2 = T × e1;
// K — доли длины дуги в контрольных точках (где локоть, колено), u — доля длины от начала
function sweep(mesh, { pts, rings, segs, ref = [0, 0, 1], shape, classify, capStart = true, capEnd = true, capRings = 6 }) {
  const N = 240, samples = [];
  let L = 0, prev = catmull(pts, 0);
  samples.push({ s: 0, p: prev });
  for (let k = 1; k <= N; k++) {
    const p = catmull(pts, (k / N) * (pts.length - 1));
    L += len(sub(p, prev));
    samples.push({ s: L, p });
    prev = p;
  }
  const K = pts.map((_, i) => samples[Math.round((i / (pts.length - 1)) * N)].s / L);
  const at = u => {
    const target = Math.min(1, Math.max(0, u)) * L;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].s < target) lo = mid; else hi = mid; }
    const a = samples[lo], b = samples[hi];
    const f = b.s > a.s ? (target - a.s) / (b.s - a.s) : 0;
    return add(a.p, scale(sub(b.p, a.p), f));
  };
  const frame = u => {
    const c = at(u);
    const T = norm(sub(at(u + 0.004), at(u - 0.004)));
    const e1 = norm(sub(ref, scale(T, dot(ref, T))));
    return { c, T, e1, e2: cross(T, e1) };
  };
  const avgR = u => {
    let s = 0;
    for (let k = 0; k < 8; k++) {
      const th = (k / 8) * Math.PI * 2;
      const q = shape(u, Math.cos(th), Math.sin(th), K);
      s += Math.hypot(q[0], q[1]);
    }
    return s / 8;
  };
  const rowsDef = [];
  if (capStart) {
    const f = frame(0), r = avgR(0);
    for (let k = 0; k < capRings; k++) {
      const phi = (k / capRings) * Math.PI / 2;
      rowsDef.push({ f, u: 0, k: Math.sin(phi), shift: -Math.cos(phi) * r });
    }
  }
  for (let i = 0; i < rings; i++) rowsDef.push({ f: frame(i / (rings - 1)), u: i / (rings - 1), k: 1, shift: 0 });
  if (capEnd) {
    const f = frame(1), r = avgR(1);
    for (let k = capRings - 1; k >= 0; k--) {
      const phi = (k / capRings) * Math.PI / 2;
      rowsDef.push({ f, u: 1, k: Math.sin(phi), shift: Math.cos(phi) * r });
    }
  }
  tube(mesh, rowsDef.length, segs, (i, j) => {
    const R = rowsDef[i], f = R.f;
    const th = (j / segs) * Math.PI * 2;
    const q = shape(R.u, Math.cos(th), Math.sin(th), K);
    const c = add(f.c, scale(f.T, R.shift));
    return { p: add(c, add(scale(f.e1, q[0] * R.k), scale(f.e2, q[1] * R.k))), c, u: R.u };
  }, (p, d, u) => classify(p, d, u, K));
}

// Эллипсоид — для мелких деталей: надколенник, косточки лодыжки, уши, нос
function ellipsoid(mesh, c, rx, ry, rz, classify, rings = 10, segs = 14) {
  const rows = [];
  for (let k = 0; k <= rings; k++) {
    const phi = -Math.PI / 2 + (k / rings) * Math.PI;
    rows.push([c[1] + ry * Math.sin(phi), rx * Math.cos(phi), rz * Math.cos(phi), rz * Math.cos(phi), c[2]]);
  }
  tube(mesh, rows.length, segs, (i, j) => {
    const [y, W, D, , zc] = rows[i];
    const th = (j / segs) * Math.PI * 2;
    return { p: [c[0] + W * Math.sin(th), y, zc + D * Math.cos(th)], c: [c[0], y, zc], u: i / rings };
  }, classify);
}

// Эллиптическое сечение с мышечным рельефом: a — полуось вперёд-назад, b — в стороны
const ellipse = (a, b, ct, st, extra = 0) => {
  const r = 1 / Math.sqrt((ct / a) ** 2 + (st / b) ** 2) + extra;
  return [r * ct, r * st];
};

// Шапочка волос: от линии роста волос (высота по углу вокруг головы, 0° — лоб, 180° — затылок)
// до макушки. Каждая «колонка» начинается ровно на линии роста, поэтому край волос плавный, без
// ступенек; слой волос откладывается по нормали к голове, поэтому макушка — ровный купол без «шишки».
// У края слой сходит на нет, а groove — бороздки прядей, зачёсанных назад
function hairShell(mesh, headRows, edge, thick, classify, { rings = 30, segs = 112, back = 1.3, groove = 0, strands = 26, part = 0 } = {}) {
  // Поверхность головы как таблица по высоте (по тому же сплайну, что и сама голова)
  const prof = [];
  for (let t = 0; t <= headRows.length - 1; t += 0.02) prof.push(catmull(headRows, t));
  const at = y => {
    let lo = 0, hi = prof.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (prof[mid][0] < y) lo = mid; else hi = mid; }
    const a = prof[lo], b = prof[hi], f = b[0] > a[0] ? Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0]))) : 0;
    return a.map((v, k) => v + (b[k] - v) * f);
  };
  // Высота линии роста по углу — периодический сплайн по контрольным точкам (левая и правая сторона одинаковы)
  const pts = [...edge, ...edge.slice(1, -1).reverse().map(([a, y]) => [360 - a, y])];
  const edgeY = deg => {
    const a = ((deg % 360) + 360) % 360;
    let i = 0;
    while (i < pts.length - 1 && pts[i + 1][0] <= a) i += 1;
    const n = pts.length;
    const p0 = pts[(i - 1 + n) % n][1], p1 = pts[i][1], p2 = pts[(i + 1) % n][1], p3 = pts[(i + 2) % n][1];
    const a1 = pts[i][0], a2 = i + 1 < n ? pts[i + 1][0] : 360;
    const f = (a - a1) / (a2 - a1 || 1), f2 = f * f, f3 = f2 * f;
    return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
  };
  const top = headRows[headRows.length - 1][0];
  const surf = (y, th) => {
    const [, W, Df, Db, zc] = at(Math.min(y, top));
    const st = Math.sin(th), ct = Math.cos(th);
    return [W * spow(st, 2 / 2.1), y, zc + (ct >= 0 ? Df : Db) * spow(ct, 2 / 2.1)];
  };
  tube(mesh, rings, segs, (i, j) => {
    const th = (j / segs) * Math.PI * 2, deg = (j / segs) * 360;
    const y0 = edgeY(deg), t = i / (rings - 1);
    // кольца гуще у края и на макушке
    const y = Math.min(top, y0 + (top - y0) * (1 - Math.cos(t * Math.PI / 2) ** 1.2));
    const p = surf(y, th);
    let n = [0, 1, 0];
    if (y < top - 0.002) {
      const e = 0.0015;
      n = cross(sub(surf(y, th + 0.02), surf(y, th - 0.02)), sub(surf(y + e, th), surf(y - e, th)));
      const out = [p[0], 0.4 * (y - 1.66), p[2] - at(y)[4]];
      if (dot(n, out) < 0) n = scale(n, -1);
      n = norm(n);
    }
    const ct = Math.cos(th), crown = 1 - smooth(0.72, 0.97, t);
    // бороздки прядей и пробор посередине сходят на нет к макушке, а затылок толще только ниже неё —
    // иначе точки полюса разъезжаются и на макушке вырастает «шишка»
    const g = groove * Math.cos(th * strands) * smooth(0.03, 0.2, t) * crown;
    const sep = part * bell(Math.sin(th / 2), 0, 0.035) * (1 - smooth(0.45, 0.8, t));
    const thickBack = ct >= 0 ? 1 : 1 + (back - 1) * Math.min(1, -ct * 1.6) * crown;
    const k = thick * thickBack * (0.12 + 0.88 * smooth(0, 0.2, t)) * (1 + g) * (1 - sep);
    return { p: add(p, scale(n, k)), c: [0, y, at(y)[4]], u: t };
  }, classify);
}

// Пропорции тел. Мужское и женское строятся одним кодом: меняются сечения туловища, толщина
// рук и ног, ширина плеч и таза, выраженность мышц и причёска. Высоты зон одинаковые, поэтому
// одни и те же границы зон и отметки боли подходят обоим телам.
const BODY = {
  m: {
    torso: [
      [0.812, 0, 0, 0, -0.012], [0.818, 0.045, 0.034, 0.045, -0.012], [0.835, 0.075, 0.050, 0.065, -0.012],
      [0.865, 0.112, 0.068, 0.085, -0.012], [0.905, 0.148, 0.082, 0.096, -0.010], [0.950, 0.160, 0.088, 0.097, -0.008],
      [1.000, 0.155, 0.092, 0.090, -0.002], [1.050, 0.142, 0.094, 0.082, 0.002], [1.090, 0.137, 0.096, 0.080, 0.004], [1.130, 0.141, 0.098, 0.082, 0.006],
      [1.182, 0.151, 0.104, 0.088, 0.008], [1.242, 0.163, 0.110, 0.093, 0.010], [1.302, 0.173, 0.112, 0.097, 0.010],
      [1.356, 0.181, 0.106, 0.098, 0.008], [1.400, 0.186, 0.093, 0.093, 0.004], [1.432, 0.168, 0.075, 0.080, 0.000],
      [1.458, 0.122, 0.061, 0.066, -0.004], [1.478, 0.074, 0.053, 0.056, -0.006], [1.492, 0.040, 0.040, 0.040, -0.006],
      [1.500, 0, 0, 0, -0.006]
    ],
    // Масштаб ширины для границ зон: плечи и грудь, талия, таз
    kx: { top: 1, mid: 1, low: 1 },
    muscle: 1, bust: 0, glute: 0.026,
    arm: [[0.176, 1.4, -0.006], [0.205, 1.30, -0.012], [0.226, 1.17, -0.016], [0.233, 1.105, -0.012], [0.242, 0.99, 0.01], [0.252, 0.872, 0.03]],
    armK: 1, handK: 1,
    leg: [[0.086, 0.965, -0.01], [0.094, 0.8, 0.006], [0.097, 0.62, 0.012], [0.099, 0.5, 0.012], [0.1, 0.3, -0.006], [0.1, 0.095, -0.01]],
    thigh: [[0.064, 0.066], [0.088, 0.090], [0.078, 0.076], [0.067, 0.063], [0.056, 0.054], [0.050, 0.051]],
    shank: [[0.050, 0.051], [0.048, 0.049], [0.050, 0.047], [0.043, 0.042], [0.035, 0.034], [0.031, 0.031], [0.030, 0.033]],
    footX: 0.1, footK: 1, neck: [0.058, 0.062], jaw: 1, hair: "short",
    // Черты лица: нос, надбровья, губы, скулы, подбородок
    face: { nose: 1, brow: 1, lips: 1, cheek: 1, chin: 1 }
  },
  f: {
    torso: [
      [0.812, 0, 0, 0, -0.016], [0.818, 0.048, 0.034, 0.050, -0.016], [0.835, 0.082, 0.050, 0.072, -0.016],
      [0.865, 0.124, 0.068, 0.094, -0.016], [0.905, 0.160, 0.080, 0.104, -0.014], [0.950, 0.171, 0.084, 0.103, -0.012],
      [1.000, 0.160, 0.086, 0.092, -0.006], [1.050, 0.136, 0.084, 0.080, -0.002], [1.090, 0.121, 0.082, 0.074, 0.000], [1.130, 0.123, 0.084, 0.074, 0.002],
      [1.182, 0.131, 0.090, 0.078, 0.004], [1.242, 0.141, 0.096, 0.082, 0.006], [1.302, 0.149, 0.098, 0.085, 0.006],
      [1.356, 0.157, 0.092, 0.086, 0.004], [1.400, 0.165, 0.082, 0.082, 0.002], [1.432, 0.150, 0.068, 0.072, 0.000],
      [1.458, 0.110, 0.056, 0.060, -0.004], [1.478, 0.066, 0.048, 0.050, -0.006], [1.492, 0.036, 0.036, 0.036, -0.006],
      [1.500, 0, 0, 0, -0.006]
    ],
    kx: { top: 0.885, mid: 0.88, low: 1.06 },
    muscle: 0.22, bust: 1, glute: 0.034,
    arm: [[0.157, 1.396, -0.006], [0.183, 1.30, -0.012], [0.201, 1.17, -0.016], [0.207, 1.105, -0.012], [0.216, 0.99, 0.01], [0.225, 0.874, 0.03]],
    armK: 0.86, handK: 0.9,
    leg: [[0.093, 0.965, -0.014], [0.101, 0.8, 0.004], [0.099, 0.62, 0.01], [0.097, 0.5, 0.01], [0.096, 0.3, -0.006], [0.095, 0.095, -0.01]],
    thigh: [[0.066, 0.070], [0.090, 0.094], [0.079, 0.078], [0.066, 0.062], [0.053, 0.051], [0.047, 0.048]],
    shank: [[0.047, 0.048], [0.045, 0.046], [0.046, 0.044], [0.040, 0.039], [0.032, 0.031], [0.028, 0.028], [0.027, 0.030]],
    footX: 0.095, footK: 0.9, neck: [0.05, 0.053], jaw: 0.9, hair: "long",
    face: { nose: 0.84, brow: 0.45, lips: 1.35, cheek: 1.15, chin: 0.75 }
  }
};

// Сборка фигуры. regionIndex(id) → номер зоны (1…), сторона: 0 — центр, 1 — правая (x < 0), 2 — левая.
// sex: "m" — мужское тело, "f" — женское. mat: 0 — кожа, 1 — волосы, 2 — резинка для волос
function buildFigure(regionIndex, sex = "m") {
  const B = BODY[sex] || BODY.m;
  const pos = [], nor = [], reg = [], sid = [], mat = [], prt = [], idx = [];
  // part — часть тела для скелета схем упражнений (PART): какая кость двигает вершину
  const mesh = {
    idx, material: 0, part: PART.torso,
    get count() { return pos.length / 3; },
    push(p, n, region, side) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      reg.push(regionIndex(region));
      sid.push(side);
      mat.push(this.material);
      prt.push(this.part);
    }
  };
  const sideOf = x => (x < -0.012 ? 1 : x > 0.012 ? 2 : 0);
  const R = (id, p) => [id, sideOf(p[0])];
  const C = id => [id, 0];
  const mu = B.muscle;
  // Ширина по высоте для границ зон: у женского тела уже плечи и талия, шире таз
  const kx = y => (y > 1.17 ? B.kx.top : y > 0.99 ? B.kx.mid : B.kx.low);

  // ----- Туловище -----
  loft(mesh, {
    step: 0.0085, segs: 64, power: 2.4,
    rows: B.torso,
    bump: (x, y, z) => {
      const ax = Math.abs(x) / kx(y);
      let e = 0;
      if (z > 0) {
        // грудные мышцы, складка под ними и граница с дельтой
        e += mu * 0.015 * smooth(1.19, 1.26, y) * (1 - smooth(1.33, 1.40, y)) * bell(ax, 0.078, 0.06);
        e -= mu * 0.0042 * bell(y, 1.188, 0.011) * bell(ax, 0.085, 0.05);
        e -= 0.003 * bell(ax, 0.152, 0.012) * smooth(1.24, 1.3, y) * (1 - smooth(1.38, 1.42, y));
        // грудь: две мягкие округлые формы и складка под ними
        if (B.bust) {
          e += 0.036 * bell(y, 1.262, 0.04) * bell(ax, 0.07, 0.04);
          e -= 0.003 * bell(y, 1.218, 0.009) * bell(ax, 0.07, 0.045);
        }
        // ключицы и ямка между ними
        e += 0.0032 * bell(y, 1.426 + 0.11 * (ax - 0.02), 0.008) * smooth(0.02, 0.04, ax) * (1 - smooth(0.12, 0.15, ax));
        e -= 0.003 * bell(ax, 0, 0.012) * bell(y, 1.435, 0.01);
        // пресс: белая линия, три поперечные перемычки и пупок
        const abs = smooth(0.96, 1.0, y) * (1 - smooth(1.16, 1.2, y)) * (1 - smooth(0.06, 0.078, ax));
        e -= mu * 0.0035 * bell(ax, 0, 0.009) * smooth(0.97, 1.02, y) * (1 - smooth(1.18, 1.24, y));
        e += mu * 0.0035 * abs * bell(ax, 0.033, 0.022);
        e -= mu * 0.0026 * abs * (bell(y, 1.035, 0.007) + bell(y, 1.09, 0.007) + 0.8 * bell(y, 1.142, 0.007));
        e -= 0.004 * bell(ax, 0, 0.007) * bell(y, 0.995, 0.007);
        // зубчатые мышцы на боках
        e += mu * 0.0016 * bell(ax, 0.128, 0.014) * (bell(y, 1.13, 0.009) + bell(y, 1.165, 0.009) + bell(y, 1.2, 0.009));
        // мягкий низ живота
        e += 0.004 * (1 - mu) * bell(y, 0.97, 0.03) * bell(ax, 0, 0.07);
      } else {
        // лопатки, ложбинка позвоночника, ягодицы и их разделение
        e += (0.005 + 0.006 * mu) * smooth(1.21, 1.27, y) * (1 - smooth(1.36, 1.41, y)) * bell(ax, 0.088, 0.045);
        e -= 0.006 * bell(ax, 0, 0.011) * smooth(0.99, 1.04, y) * (1 - smooth(1.40, 1.44, y));
        e += B.glute * bell(y, 0.885, 0.048) * bell(ax, 0.072, 0.058);
        e -= 0.006 * bell(ax, 0, 0.01) * (1 - smooth(0.9, 0.95, y));
        // мышцы-разгибатели вдоль позвоночника, широчайшие и трапеция
        e += mu * 0.0042 * bell(ax, 0.03, 0.012) * smooth(0.97, 1.02, y) * (1 - smooth(1.2, 1.28, y));
        e += mu * 0.006 * bell(ax, 0.128, 0.03) * smooth(1.1, 1.16, y) * (1 - smooth(1.28, 1.33, y));
        e += 0.004 * bell(ax, 0.05, 0.03) * smooth(1.33, 1.38, y);
        // ямочки над крестцом и ягодичная складка
        e -= 0.0025 * bell(y, 0.985, 0.012) * bell(ax, 0.035, 0.012);
        e -= 0.004 * bell(y, 0.832, 0.01) * bell(ax, 0.075, 0.04);
      }
      return e;
    },
    classify: (p, d) => {
      const ax = Math.abs(p[0]) / kx(p[1]), y = p[1], fr = d[2];
      if (y > 1.445) return ax > 0.115 ? R("shoulder", p) : R("trapezius", p);
      if (y > 1.39) {
        if (ax > 0.155) return R("shoulder", p);
        if (fr > 0.2) return R("collarbone", p);
        return fr < -0.2 ? R("trapezius", p) : R("shoulder", p);
      }
      if (fr < -0.3) {
        if (y > 1.22) return ax < 0.045 ? C("upperBack") : R("shoulderBlade", p);
        if (y > 1.12) return C("upperBack");
        if (y > 0.99) return C("lowerBack");
        return ax < 0.04 ? C("pelvis") : R("glute", p);
      }
      if (fr > 0.3) {
        if (y > 1.17) return ax > 0.16 ? R("shoulder", p) : C("chest");
        if (y > 0.925) return ax > 0.115 ? R("obliques", p) : C("abdomen");
        return ax > 0.035 ? R("groin", p) : C("abdomen");
      }
      if (y > 1.12) return R("ribs", p);
      if (y > 0.99) return R("obliques", p);
      return R("hip", p);
    }
  });

  // ----- Шея и голова -----
  mesh.part = PART.neck;
  sweep(mesh, {
    pts: [[0, 1.452, -0.012], [0, 1.53, -0.004], [0, 1.6, 0.008]], rings: 12, segs: 32, capStart: false, capEnd: false,
    shape: (u, ct, st) => ellipse(B.neck[0] - 0.004 * u, B.neck[1] - 0.006 * u, ct, st,
      // кивательные мышцы спереди и мягкая выемка гортани
      0.003 * bell(u, 0.45, 0.3) * Math.max(0, ct * 0.7 + Math.abs(st) * 0.6) ** 6),
    classify: () => C("neck")
  });
  const J = B.jaw;
  mesh.part = PART.head;
  const headRows = [
    [1.545, 0, 0, 0, 0.055], [1.549, 0.02 * J, 0.016, 0.014, 0.052], [1.556, 0.034 * J, 0.028, 0.022, 0.050], [1.565, 0.048 * J, 0.040, 0.040, 0.040],
    [1.585, 0.060 * J, 0.052, 0.062, 0.025], [1.610, 0.068, 0.062, 0.080, 0.014], [1.640, 0.074, 0.074, 0.090, 0.006],
    [1.670, 0.078, 0.082, 0.096, 0.002], [1.700, 0.077, 0.080, 0.098, -0.002], [1.728, 0.069, 0.068, 0.090, -0.006],
    [1.750, 0.052, 0.050, 0.070, -0.010], [1.764, 0.028, 0.026, 0.040, -0.012], [1.770, 0, 0, 0, -0.012]
  ];
  const F = B.face;
  // Нос — часть поверхности головы, а не приклеенные шарики: спинка от переносицы к кончику,
  // округлый кончик, крылья по бокам и плавный переход в верхнюю губу
  const NB = 1.677, NT = 1.637, NS = 1.625;
  const nose = (ax, y) => {
    const t = Math.min(1, Math.max(0, (NB - y) / (NB - NT)));
    const w = (0.0052 + 0.0058 * t) * (0.92 + 0.08 * F.nose);
    const h = (0.0025 + 0.0165 * t ** 1.2) * (1 - smooth(NB - 0.004, NB + 0.007, y)) * smooth(NS, NT + 0.0015, y);
    return F.nose * (h * bell(ax, 0, w) + 0.0068 * bell(y, 1.6315, 0.0055) * bell(ax, 0.0118, 0.0056));
  };
  loft(mesh, {
    step: 0.003, segs: 96, power: 2.1,
    // сетка гуще спереди: на лице в 2,2 раза больше вершин по кругу, чем на затылке
    warp: f => { const a = f * Math.PI * 2; return a - 0.55 * Math.sin(a); },
    rows: headRows,
    bump: (x, y, z) => {
      if (z <= 0) return 0;
      const ax = Math.abs(x);
      const L = F.lips, mouth = bell(ax, 0, 0.017), q = (ax / 0.02) ** 2;
      return nose(ax, y)
        - 0.0042 * bell(ax, 0.031, 0.016) * bell(y, 1.668, 0.012) // глазницы
        + 0.0016 * bell(ax, 0.031, 0.0095) * bell(y, 1.6672, 0.0052) // глазные яблоки
        + 0.0015 * bell(ax, 0.031, 0.012) * bell(y, 1.672, 0.004) // веки
        + 0.004 * F.brow * bell(y, 1.689, 0.007) * (1 - smooth(0.05, 0.07, ax)) // надбровья
        + 0.004 * F.cheek * bell(y, 1.645, 0.012) * bell(ax, 0.056, 0.014) // скулы
        - 0.0008 * bell(ax, 0, 0.0035) * bell(y, 1.616, 0.005) // желобок над губой
        + 0.0028 * L * bell(y, 1.6068 - 0.0012 * q + 0.0008 * bell(ax, 0.004, 0.004), 0.0042) * bell(ax, 0, 0.019) // верхняя губа с «луком Купидона»
        - 0.0018 * bell(y, 1.601 - 0.0006 * q, 0.0026) * mouth // линия губ
        - 0.0012 * bell(ax, 0.021, 0.004) * bell(y, 1.6, 0.004) // уголки рта
        + 0.0026 * L * bell(y, 1.5952 + 0.0008 * q, 0.0042) * mouth // нижняя губа
        + 0.0035 * F.chin * bell(y, 1.574, 0.009) * (1 - smooth(0.018, 0.032, ax)); // подбородок
    },
    classify: () => C("head")
  });
  for (const s of [-1, 1]) ellipsoid(mesh, [s * 0.078, 1.656, -0.006], 0.009, 0.029, 0.019, () => C("head"), 10, 14); // уши
  // ----- Волосы: шапочка по форме головы от линии роста волос; у женского тела — зачёсанные
  // назад пряди и хвост на резинке -----
  mesh.material = 1;
  mesh.part = PART.hair;
  const long = B.hair === "long";
  hairShell(mesh, headRows, long
    ? [[0, 1.711], [25, 1.708], [45, 1.699], [62, 1.684], [78, 1.666], [93, 1.676], [112, 1.634], [140, 1.606], [180, 1.598]]
    : [[0, 1.709], [30, 1.707], [60, 1.697], [80, 1.672], [95, 1.69], [110, 1.658], [140, 1.625], [180, 1.615]],
  long ? 0.012 : 0.007, () => C("head"), long ? { back: 1.35, part: 0.6 } : {});
  if (long) {
    mesh.part = PART.pony;
    sweep(mesh, {
      pts: [[0, 1.714, -0.096], [0, 1.702, -0.122], [0, 1.66, -0.138], [0, 1.6, -0.137], [0, 1.545, -0.124]], rings: 34, segs: 40,
      shape: (u, ct, st) => {
        // пряди по кругу, пышнее сразу за резинкой и тоньше к концу
        const r = 1 + 0.09 * Math.cos(Math.atan2(st, ct) * 8) * smooth(0.08, 0.25, u);
        const k = (1 + 0.55 * bell(u, 0.24, 0.16)) * (1 - 0.62 * u ** 1.4);
        return ellipse(0.016 * k * r, 0.018 * k * r, ct, st);
      },
      classify: () => C("head")
    });
    mesh.material = 2; // резинка
    mesh.part = PART.tie;
    sweep(mesh, {
      pts: [[0, 1.7085, -0.108], [0, 1.705, -0.1155]], rings: 4, segs: 32, capRings: 3,
      shape: (u, ct, st) => ellipse(0.0185, 0.0205, ct, st),
      classify: () => C("head")
    });
  }
  mesh.material = 0;

  for (const s of [-1, 1]) {
    const si = s < 0 ? 0 : 1; // 0 — правая сторона (x < 0), 1 — левая
    mesh.part = PART.arm[si];
    // ----- Рука: плечо → локоть → запястье -----
    const armPts = B.arm.map(([x, y, z]) => [s * x, y, z]);
    const ak = B.armK;
    const upper = [[0.054, 0.058], [0.051, 0.054], [0.046, 0.046], [0.041, 0.042], [0.036, 0.041]].map(([a, b]) => [a * ak, b * ak]);
    const lower = [[0.036, 0.041], [0.042, 0.046], [0.037, 0.039], [0.033, 0.030], [0.030, 0.021]].map(([a, b]) => [a * (0.15 + 0.85 * ak), b * (0.15 + 0.85 * ak)]);
    sweep(mesh, {
      pts: armPts, rings: 56, segs: 32,
      shape: (u, ct, st, K) => {
        const ue = K[3], out = -s * st;
        if (u <= ue) {
          const v = u / ue, [a, b] = table(upper, v);
          const extra = (0.4 + 0.6 * mu) * (0.009 * bell(v, 0.56, 0.2) * Math.max(0, ct) ** 2 + 0.007 * bell(v, 0.45, 0.22) * Math.max(0, -ct) ** 2)
            + 0.009 * ak * bell(v, 0.12, 0.12) * Math.max(0, out) ** 1.5;
          return ellipse(a, b, ct, st, extra);
        }
        const v = (u - ue) / (1 - ue), [a, b] = table(lower, v);
        const extra = (0.4 + 0.6 * mu) * 0.006 * bell(v, 0.22, 0.18) * Math.max(0, 0.6 * ct + 0.8 * out) ** 2
          + 0.003 * bell(v, 0.02, 0.05) * Math.max(0, -ct) ** 3; // локоть сзади
        return ellipse(a, b, ct, st, extra);
      },
      classify: (p, d, u, K) => {
        const ue = K[3];
        if (u <= ue) {
          const v = u / ue;
          if (v < 0.24) return R("shoulder", p);
          if (v < 0.86) return d[2] >= -0.15 ? R("upperArm", p) : R("triceps", p);
          return R("elbow", p);
        }
        const v = (u - ue) / (1 - ue);
        if (v < 0.14) return R("elbow", p);
        return v < 0.88 ? R("forearm", p) : R("wrist", p);
      }
    });

    // ----- Кисть: ладонь, четыре пальца и большой палец (от запястья) -----
    mesh.part = PART.hand[si];
    const [wx, wy, wz] = armPts[armPts.length - 1], hk = B.handK;
    const at = (dx, dy, dz) => [wx + s * dx * hk, wy + dy * hk, wz + dz * hk];
    sweep(mesh, {
      pts: [at(0.001, -0.004, 0.001), at(0.005, -0.054, 0.006), at(0.008, -0.096, 0.01)], rings: 14, segs: 24, capStart: false, capRings: 4,
      shape: (u, ct, st) => {
        const [a, b] = table([[0.030, 0.017], [0.040, 0.0155], [0.042, 0.013]], u);
        const inn = s * st;
        const pad = 0.006 * bell(u, 0.4, 0.22) * Math.max(0, 0.6 * ct + 0.8 * inn) ** 2;
        return [(a * spow(ct, 2 / 2.8) + pad * ct) * hk, (b * spow(st, 2 / 2.8) + pad * st) * hk];
      },
      classify: (p, d, u) => (u < 0.18 ? R("wrist", p) : R("hand", p))
    });
    const fingers = [[0.027, 0.072, 0.0095], [0.009, 0.080, 0.0102], [-0.009, 0.075, 0.0096], [-0.026, 0.060, 0.0086]];
    mesh.part = PART.finger[si];
    for (const [dz, Lf, rf] of fingers) {
      const p0 = at(0.006, -0.086, 0.01 + dz);
      sweep(mesh, {
        pts: [p0, [p0[0] - s * 0.003 * hk, p0[1] - Lf * 0.5 * hk, p0[2] + dz * 0.05 * hk], [p0[0] - s * 0.011 * hk, p0[1] - Lf * hk, p0[2] + dz * 0.1 * hk]],
        rings: 10, segs: 12, capRings: 4,
        // суставы пальцев чуть толще
        shape: (u, ct, st) => ellipse(rf * hk * (1 - 0.22 * u + 0.06 * bell(u, 0.45, 0.08)), rf * hk * (1 - 0.18 * u + 0.06 * bell(u, 0.45, 0.08)), ct, st),
        classify: p => R("fingers", p)
      });
    }
    mesh.part = PART.thumb[si];
    sweep(mesh, {
      pts: [at(0.002, -0.026, 0.028), at(-0.003, -0.058, 0.04), at(-0.007, -0.083, 0.043)], rings: 10, segs: 12, capRings: 4,
      shape: (u, ct, st) => ellipse(0.0118 * hk * (1 - 0.2 * u), 0.0112 * hk * (1 - 0.18 * u), ct, st),
      classify: p => R("thumb", p)
    });

    // ----- Нога: тазобедренный сустав → колено → лодыжка -----
    mesh.part = PART.leg[si];
    const legPts = B.leg.map(([x, y, z]) => [s * x, y, z]);
    const thigh = B.thigh, shank = B.shank;
    sweep(mesh, {
      pts: legPts, rings: 84, segs: 36,
      shape: (u, ct, st, K) => {
        const uk = K[3], out = -s * st, inn = -out;
        if (u <= uk) {
          const v = u / uk, [a, b] = table(thigh, v);
          const extra = (0.3 + 0.7 * mu) * 0.010 * bell(v, 0.38, 0.25) * Math.max(0, ct) ** 2
            + (0.3 + 0.7 * mu) * 0.011 * bell(v, 0.83, 0.08) * Math.max(0, 0.6 * ct + 0.8 * inn) ** 2
            + 0.008 * bell(v, 0.42, 0.25) * Math.max(0, -ct) ** 2
            + 0.012 * bell(v, 0.97, 0.05) * Math.max(0, ct) ** 3
            - 0.004 * bell(v, 0.5, 0.3) * Math.max(0, out) ** 4
            + (1 - mu) * 0.006 * bell(v, 0.12, 0.1) * Math.max(0, out) ** 2; // мягкий изгиб бедра
          return ellipse(a, b, ct, st, extra);
        }
        const v = (u - uk) / (1 - uk), [a, b] = table(shank, v);
        const extra = (0.55 + 0.45 * mu) * 0.024 * bell(v, 0.3, 0.16) * Math.max(0, -ct) ** 1.6 * (1 + 0.25 * inn)
          - 0.006 * bell(v, 0.86, 0.08) * Math.max(0, -ct) ** 2
          + 0.010 * bell(v, 0.02, 0.05) * Math.max(0, ct) ** 3
          + 0.003 * bell(v, 0.35, 0.3) * Math.max(0, ct) ** 8 // гребень большеберцовой кости
          + 0.008 * bell(v, 0.95, 0.045) * Math.max(0, inn) ** 4 + 0.008 * bell(v, 0.985, 0.045) * Math.max(0, out) ** 4;
        return ellipse(a, b, ct, st, extra);
      },
      classify: (p, d, u, K) => {
        const uk = K[3], fr = d[2], out = d[0] * s;
        if (u <= uk) {
          const v = u / uk;
          if (v < 0.16) return fr < -0.3 ? R("glute", p) : out < -0.3 ? R("groin", p) : R("hip", p);
          if (v < 0.8) {
            if (fr > 0.35) return R("thighFront", p);
            if (fr < -0.35) return R("hamstring", p);
            return out > 0 ? R("thighOuter", p) : R("thighInner", p);
          }
          return fr < -0.3 ? R("kneeBack", p) : R("knee", p);
        }
        const v = (u - uk) / (1 - uk);
        if (v < 0.16) return fr < -0.3 ? R("kneeBack", p) : R("knee", p);
        if (v < 0.8) return fr < -0.15 ? R("calf", p) : R("shin", p);
        return fr < -0.3 ? R("achilles", p) : R("ankle", p);
      }
    });
    // Надколенник и косточки лодыжки
    const knee = legPts[3];
    mesh.part = PART.kneecap[si];
    ellipsoid(mesh, [knee[0], knee[1] + 0.006, knee[2] + (sex === "f" ? 0.04 : 0.043)], 0.024, 0.03, 0.012, p => R("knee", p), 10, 14);
    mesh.part = PART.malleolus[si];
    const ank = legPts[5];
    ellipsoid(mesh, [ank[0] + s * 0.024, ank[1] + 0.004, ank[2] - 0.004], 0.009, 0.013, 0.012, p => R("ankle", p), 8, 10);
    ellipsoid(mesh, [ank[0] - s * 0.027, ank[1] - 0.004, ank[2] - 0.008], 0.009, 0.013, 0.012, p => R("ankle", p), 8, 10);

    // ----- Стопа: пятка → свод → пальцы -----
    mesh.part = PART.foot[si];
    const fx = B.footX, fk = B.footK;
    sweep(mesh, {
      pts: [[s * fx, 0.04, -0.062 * fk], [s * fx, 0.05, -0.02 * fk], [s * (fx + 0.002), 0.042, 0.04 * fk], [s * (fx + 0.004), 0.028, 0.11 * fk], [s * (fx + 0.006), 0.018, 0.15 * fk]],
      rings: 26, segs: 28, ref: [0, 1, 0], capRings: 5,
      shape: (u, ct, st) => {
        const [top, bottom, w] = table([[0.030, 0.030, 0.030], [0.040, 0.032, 0.033], [0.044, 0.030, 0.038], [0.030, 0.022, 0.044], [0.020, 0.016, 0.044], [0.014, 0.012, 0.038]], u);
        const inn = s * st;
        // сухожилия на тыле стопы
        const tend = 0.0015 * bell(u, 0.6, 0.2) * Math.max(0, ct) ** 6;
        return [((ct >= 0 ? top : bottom) * spow(ct, 2 / (ct >= 0 ? 2.4 : 3)) + tend) * fk, w * spow(st, 2 / 2.4) * fk];
      },
      classify: (p, d, u) => {
        if (u < 0.24) return R("heel", p);
        if (u > 0.74) return R("toes", p);
        return d[1] < -0.6 ? R("heel", p) : R("foot", p);
      }
    });
    // Пять пальцев ног: от большого (внутри) к мизинцу (снаружи)
    const toes = [[-0.026, 0.0125, 0.020], [-0.008, 0.0095, 0.016], [0.006, 0.0088, 0.014], [0.018, 0.008, 0.012], [0.029, 0.0072, 0.01]];
    toes.forEach(([dx, r, Lt], k) => {
      const x = s * (fx + 0.006 + dx * fk), z0 = (0.142 - k * 0.006 - (k > 2 ? (k - 2) * 0.006 : 0)) * fk;
      sweep(mesh, {
        pts: [[x, 0.017, z0], [x + s * dx * 0.08, 0.014, z0 + Lt * 0.6 * fk], [x + s * dx * 0.12, 0.011, z0 + Lt * fk]],
        rings: 6, segs: 10, capRings: 3,
        shape: (u, ct, st) => ellipse(r * fk * (1 - 0.15 * u), r * fk * 1.05 * (1 - 0.1 * u), ct, st),
        classify: p => R("toes", p)
      });
    });
  }

  const geo = {
    pos: new Float32Array(pos), nor: new Float32Array(nor),
    reg: new Uint8Array(reg), sid: new Uint8Array(sid), mat: new Uint8Array(mat), part: new Uint8Array(prt), idx: new Uint16Array(idx)
  };
  geo.shade = bakeShade(geo);
  geo.bind = bindJoints(B);
  return geo;
}

// Части тела для скелета: у парных — [правая, левая]
export const PART = {
  torso: 0, neck: 1, head: 2, hair: 3, tie: 4, pony: 17,
  arm: [5, 11], hand: [6, 12], leg: [7, 13], kneecap: [8, 14], malleolus: [9, 15], foot: [10, 16],
  finger: [18, 20], thumb: [19, 21]
};

// Суставы тела в исходной позе (стоя, руки вдоль тела) — кости скелета для схем упражнений.
// У парных суставов — [правый (x < 0), левый]
function bindJoints(B) {
  const side = f => [-1, 1].map(f);
  const a0 = B.arm[0], el = B.arm[3], wr = B.arm[5], hk = B.handK;
  const l0 = B.leg[0], kn = B.leg[3], an = B.leg[5], fk = B.footK;
  return {
    pelvis: [0, 0.93, -0.008], spine: [0, 1.03, -0.006], chest: [0, 1.2, 0.004], neck: [0, 1.45, -0.012],
    head: [0, 1.585, -0.004], top: [0, 1.77, -0.012],
    clav: side(s => [s * 0.022, 1.432, 0.012]),
    shoulder: side(s => [s * (a0[0] - 0.006), a0[1] - 0.014, a0[2] - 0.004]),
    elbow: side(s => [s * el[0], el[1], el[2]]),
    wrist: side(s => [s * wr[0], wr[1], wr[2]]),
    knuckle: side(s => [s * (wr[0] + 0.008 * hk), wr[1] - 0.096 * hk, wr[2] + 0.01 * hk]),
    finger: side(s => [s * (wr[0] + 0.004 * hk), wr[1] - 0.17 * hk, wr[2] + 0.012 * hk]),
    // суставы пальцев: основание (линия костяшек), середина пальца; большой палец — основание и кончик
    mcp: side(s => [s * (wr[0] + 0.006 * hk), wr[1] - 0.086 * hk, wr[2] + 0.01 * hk]),
    pip: side(s => [s * (wr[0] + 0.005 * hk), wr[1] - 0.122 * hk, wr[2] + 0.011 * hk]),
    thumb0: side(s => [s * (wr[0] + 0.002 * hk), wr[1] - 0.026 * hk, wr[2] + 0.028 * hk]),
    thumbTip: side(s => [s * (wr[0] - 0.007 * hk), wr[1] - 0.083 * hk, wr[2] + 0.043 * hk]),
    hip: side(s => [s * l0[0], l0[1] - 0.045, l0[2] + 0.004]),
    knee: side(s => [s * kn[0], kn[1], kn[2]]),
    ankle: side(s => [s * an[0], an[1] - 0.005, an[2]]),
    ball: side(s => [s * (B.footX + 0.004), 0.02, 0.112 * fk]),
    toe: side(s => [s * (B.footX + 0.006), 0.012, 0.17 * fk]),
    heel: side(s => [s * B.footX, 0.0, -0.07 * fk]),
    pony: [0, 1.706, -0.114], ponyTip: [0, 1.545, -0.124]
  };
}

// Модель тела для схем упражнений: та же геометрия, что на вкладке «Тело», плюс части и суставы
export function buildBody(regions, sex = "m") {
  return buildFigure(id => regions.indexOf(id) + 1, sex);
}

// Запечённое затенение: впадины и складки темнее, выпуклости светлее, плюс тонкие швы между зонами —
// модель выглядит объёмнее, а зоны тела читаются как на анатомическом атласе
function bakeShade(geo) {
  const n = geo.pos.length / 3;
  const shade = new Float32Array(n).fill(1);
  // Вершины с одинаковыми координатами (шов развёртки) считаем одной точкой
  const key = v => `${Math.round(geo.pos[v * 3] * 2e4)},${Math.round(geo.pos[v * 3 + 1] * 2e4)},${Math.round(geo.pos[v * 3 + 2] * 2e4)}`;
  const group = new Int32Array(n), ids = new Map();
  for (let v = 0; v < n; v++) {
    const k = key(v);
    if (!ids.has(k)) ids.set(k, ids.size);
    group[v] = ids.get(k);
  }
  const G = ids.size;
  const sum = new Float32Array(G * 3), cnt = new Float32Array(G), dist = new Float32Array(G);
  const seam = new Uint8Array(G);
  const idx = geo.idx;
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    const mixed = geo.reg[tri[0]] !== geo.reg[tri[1]] || geo.reg[tri[0]] !== geo.reg[tri[2]];
    for (let i = 0; i < 3; i++) {
      const a = tri[i], ga = group[a];
      if (mixed) seam[ga] = 1;
      for (let j = 1; j < 3; j++) {
        const b = tri[(i + j) % 3];
        sum[ga * 3] += geo.pos[b * 3];
        sum[ga * 3 + 1] += geo.pos[b * 3 + 1];
        sum[ga * 3 + 2] += geo.pos[b * 3 + 2];
        dist[ga] += Math.hypot(geo.pos[b * 3] - geo.pos[a * 3], geo.pos[b * 3 + 1] - geo.pos[a * 3 + 1], geo.pos[b * 3 + 2] - geo.pos[a * 3 + 2]);
        cnt[ga] += 1;
      }
    }
  }
  for (let v = 0; v < n; v++) {
    const g = group[v];
    if (!cnt[g]) continue;
    const px = geo.pos[v * 3], py = geo.pos[v * 3 + 1], pz = geo.pos[v * 3 + 2];
    const nx = geo.nor[v * 3], ny = geo.nor[v * 3 + 1], nz = geo.nor[v * 3 + 2];
    // Кривизна: насколько соседи «выше» вершины вдоль нормали (впадина) или ниже (выпуклость)
    const ax = sum[g * 3] / cnt[g] - px, ay = sum[g * 3 + 1] / cnt[g] - py, az = sum[g * 3 + 2] / cnt[g] - pz;
    const mean = dist[g] / cnt[g] || 1;
    const curv = (ax * nx + ay * ny + az * nz) / mean;
    let s = 1 - Math.max(py > 1.6 && py < 1.72 && pz > 0.03 ? -0.015 : -0.05, Math.min(0.16, curv * 1.6));
    // Мягкая тень в складках: подмышки, пах и внутренняя сторона бёдер, под подбородком, подошвы
    const sx = Math.sign(px) || 1, inward = -nx * sx;
    const axp = Math.abs(px);
    s -= 0.16 * smooth(0.2, 0.7, inward) * bell(py, 1.33, 0.07) * bell(axp, 0.185, 0.03);
    s -= 0.14 * smooth(0.2, 0.7, inward) * bell(py, 0.86, 0.09) * (1 - smooth(0.1, 0.14, axp));
    s -= 0.1 * (pz > 0 ? 1 : 0) * bell(py, 1.545, 0.018) * (1 - smooth(0.05, 0.07, axp));
    s -= 0.12 * smooth(0.4, 0.9, -ny) * (1 - smooth(0.06, 0.12, py));
    // лоб смотрит прямо на основной свет — чуть приглушаем, иначе издали он читается как светлая повязка
    if (!geo.mat[v]) s -= 0.05 * (pz > 0.04 ? 1 : 0) * bell(py, 1.698, 0.012) * (1 - smooth(0.05, 0.075, axp));
    if (seam[g] && !geo.mat[v]) s *= 0.95;
    shade[v] = Math.max(0.6, Math.min(1.06, s));
  }
  return shade;
}

// ----- Шейдеры -----
const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uMVP; uniform mat3 uNM;
varying vec3 vN; varying vec3 vC;
void main() { vN = uNM * aNor; vC = aCol; gl_Position = uMVP * vec4(aPos, 1.0); }`;
const FS = `
precision mediump float;
varying vec3 vN; varying vec3 vC;
uniform vec3 uRim; uniform float uAmb;
void main() {
  vec3 n = normalize(vN);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L1 = normalize(vec3(0.5, 0.8, 0.75));
  vec3 L2 = normalize(vec3(-0.75, 0.2, 0.45));
  // мягкий «обволакивающий» свет: тени не обрываются резко, как на коже
  float w1 = max((dot(n, L1) + 0.3) / 1.3, 0.0);
  float w2 = max((dot(n, L2) + 0.35) / 1.35, 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  float facing = max(dot(n, V), 0.0);
  float rim = pow(1.0 - facing, 2.6);
  vec3 h = normalize(L1 + V);
  float spec = pow(max(dot(n, h), 0.0), 36.0) * 0.11;
  vec3 key = vec3(1.0, 0.97, 0.93), fill = vec3(0.84, 0.9, 1.0);
  vec3 amb = mix(vec3(0.78, 0.8, 0.86), vec3(1.0), hemi);
  // тёплый оттенок на границе света и тени — объём читается мягче
  float term = w1 * (1.0 - w1) * 4.0;
  vec3 col = vC * (uAmb * amb + 0.6 * w1 * key + 0.2 * w2 * fill) + vC * vec3(0.05, 0.02, 0.0) * term + uRim * rim * 0.32 + spec * key;
  gl_FragColor = vec4(col, 1.0);
}`;
const PVS = `
attribute vec3 aPos; attribute vec2 aId;
uniform mat4 uMVP;
varying vec2 vId;
void main() { vId = aId; gl_Position = uMVP * vec4(aPos, 1.0); }`;
const PFS = `
precision mediump float;
varying vec2 vId;
void main() { gl_FragColor = vec4(floor(vId + 0.5) / 255.0, 0.0, 1.0); }`;

function compile(gl, vs, fs) {
  const make = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader");
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
  return prog;
}

export function webglSupported() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (e) {
    return false;
  }
}

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const easeOut = t => 1 - Math.pow(1 - t, 3);

// ----- Сцена -----
// regions — список id зон по порядку; onTap(regionId, side); onLasso(result | null)
export function createFigure({ regions, onTap, onLasso, label, sex = "m" }) {
  const regionIndex = id => regions.indexOf(id) + 1;
  let bodySex = sex === "f" ? "f" : "m";
  let geo = buildFigure(regionIndex, bodySex);
  let vertexCount = geo.pos.length / 3;
  let colors = new Float32Array(vertexCount * 3);
  // Для выбора зоны каждый треугольник получает один код: иначе на границе двух зон
  // интерполяция дала бы «чужие» номера посередине
  let triCount = 0, pickPos = null, pickIds = null;
  function buildPick() {
    triCount = geo.idx.length / 3;
    pickPos = new Float32Array(triCount * 9);
    pickIds = new Float32Array(triCount * 6);
    for (let t = 0; t < triCount; t++) {
      const a = geo.idx[t * 3], b = geo.idx[t * 3 + 1], c = geo.idx[t * 3 + 2];
      const ra = geo.reg[a], rb = geo.reg[b], rc = geo.reg[c];
      const main = ra === rb || ra === rc ? a : rb === rc ? b : a;
      [a, b, c].forEach((v, k) => {
        pickPos.set(geo.pos.subarray(v * 3, v * 3 + 3), t * 9 + k * 3);
        pickIds[t * 6 + k * 2] = geo.reg[main];
        pickIds[t * 6 + k * 2 + 1] = geo.sid[main];
      });
    }
  }
  buildPick();

  const el = document.createElement("div");
  el.className = "stage3d";
  const canvas = document.createElement("canvas");
  canvas.className = "gl";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label || "3D-модель человека");
  const overlay = document.createElement("canvas");
  overlay.className = "overlay";
  overlay.setAttribute("aria-hidden", "true");
  el.append(canvas, overlay);

  const view = { yaw: 0, pitch: 0.06, zoom: 1, target: null };
  let mode = "rotate";
  let colorizer = () => [0.85, 0.9, 0.88];
  let theme = { rim: [0.13, 0.64, 0.29], amb: 0.38 };
  let hairColor = [0.3, 0.25, 0.22];
  let selection = null;
  let gl = null, glState = null, lost = false;
  let cssW = 0, cssH = 0, dpr = 1;
  let frame = 0;

  // --- WebGL ---
  function initGL() {
    gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true }) || canvas.getContext("experimental-webgl");
    if (!gl) throw new Error("WebGL недоступен");
    const prog = compile(gl, VS, FS);
    const pick = compile(gl, PVS, PFS);
    const buffer = (data, target = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) => {
      const b = gl.createBuffer();
      gl.bindBuffer(target, b);
      gl.bufferData(target, data, usage);
      return b;
    };
    glState = {
      prog, pick,
      pos: buffer(geo.pos), nor: buffer(geo.nor), col: buffer(colors, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW),
      pickPos: buffer(pickPos), pickIds: buffer(pickIds),
      idx: buffer(geo.idx, gl.ELEMENT_ARRAY_BUFFER),
      loc: {
        aPos: gl.getAttribLocation(prog, "aPos"), aNor: gl.getAttribLocation(prog, "aNor"), aCol: gl.getAttribLocation(prog, "aCol"),
        uMVP: gl.getUniformLocation(prog, "uMVP"), uNM: gl.getUniformLocation(prog, "uNM"),
        uRim: gl.getUniformLocation(prog, "uRim"), uAmb: gl.getUniformLocation(prog, "uAmb"),
        pPos: gl.getAttribLocation(pick, "aPos"), pId: gl.getAttribLocation(pick, "aId"), pMVP: gl.getUniformLocation(pick, "uMVP")
      },
      fbo: null, fboTex: null, fboDepth: null, fboW: 0, fboH: 0
    };
    gl.enable(gl.DEPTH_TEST);
  }

  function matrices() {
    const aspect = cssW / Math.max(cssH, 1);
    const halfH = 1.0;
    const fov = 0.52;
    let dist = halfH / Math.tan(fov / 2) / view.zoom;
    if (aspect < 0.62) dist *= 0.62 / aspect; // узкий экран — отодвигаем камеру, чтобы фигура помещалась по ширине
    const rot = mul(rotX(view.pitch), rotY(view.yaw));
    const mv = mul(trans(0, 0, -dist), mul(rot, trans(0, -0.93, 0)));
    const mvp = mul(perspective(fov, aspect, 0.1, 20), mv);
    const nm = new Float32Array([rot[0], rot[1], rot[2], rot[4], rot[5], rot[6], rot[8], rot[9], rot[10]]);
    return { mvp, nm };
  }

  function bindAttr(buf, loc, size) {
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  function draw() {
    frame = 0;
    if (!gl || lost || !cssW || !cssH) return;
    const { mvp, nm } = matrices();
    const L = glState.loc;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(glState.prog);
    bindAttr(glState.pos, L.aPos, 3);
    bindAttr(glState.nor, L.aNor, 3);
    bindAttr(glState.col, L.aCol, 3);
    gl.uniformMatrix4fv(L.uMVP, false, mvp);
    gl.uniformMatrix3fv(L.uNM, false, nm);
    gl.uniform3fv(L.uRim, theme.rim);
    gl.uniform1f(L.uAmb, theme.amb);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glState.idx);
    gl.drawElements(gl.TRIANGLES, geo.idx.length, gl.UNSIGNED_SHORT, 0);
    for (const loc of [L.aPos, L.aNor, L.aCol]) if (loc >= 0) gl.disableVertexAttribArray(loc);
  }
  const requestDraw = () => { if (!frame) frame = requestAnimationFrame(draw); };

  // Кадр с кодами зон: R — номер зоны, G — сторона
  function renderPick() {
    const w = canvas.width, h = canvas.height;
    if (!glState.fbo || glState.fboW !== w || glState.fboH !== h) {
      if (glState.fbo) {
        gl.deleteFramebuffer(glState.fbo);
        gl.deleteTexture(glState.fboTex);
        gl.deleteRenderbuffer(glState.fboDepth);
      }
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      Object.assign(glState, { fbo, fboTex: tex, fboDepth: depth, fboW: w, fboH: h });
    }
    const { mvp } = matrices();
    const L = glState.loc;
    gl.bindFramebuffer(gl.FRAMEBUFFER, glState.fbo);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(glState.pick);
    bindAttr(glState.pickPos, L.pPos, 3);
    bindAttr(glState.pickIds, L.pId, 2);
    gl.uniformMatrix4fv(L.pMVP, false, mvp);
    gl.drawArrays(gl.TRIANGLES, 0, triCount * 3);
    for (const loc of [L.pPos, L.pId]) if (loc >= 0) gl.disableVertexAttribArray(loc);
    return { w, h };
  }

  function pickAt(x, y) {
    if (!gl || lost) return null;
    const { h } = renderPick();
    const px = new Uint8Array(4);
    gl.readPixels(Math.round(x * dpr), Math.round(h - 1 - y * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!px[0]) return null;
    return { region: regions[px[0] - 1], side: px[1] === 1 ? "R" : px[1] === 2 ? "L" : "" };
  }

  // Какие зоны сейчас видны и сколько пикселей занимают (для проверки модели)
  function visibleRegions() {
    if (!gl || lost) return [];
    const { w, h } = renderPick();
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const counts = new Map();
    for (let o = 0; o < buf.length; o += 4) {
      if (!buf[o]) continue;
      const key = `${regions[buf[o] - 1]}${buf[o + 1] === 1 ? ":R" : buf[o + 1] === 2 ? ":L" : ""}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].map(([key, px]) => ({ key, px }));
  }

  // Обводка: какие зоны видны внутри контура и где центр выделенной области
  function analyzeLasso(poly) {
    if (!gl || lost) return null;
    const { w, h } = renderPick();
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    const step = Math.max(1, Math.round(dpr));
    const counts = new Map();
    let total = 0;
    for (let py = Math.max(0, Math.floor(minY * dpr)); py <= Math.min(h - 1, Math.ceil(maxY * dpr)); py += step) {
      for (let px = Math.max(0, Math.floor(minX * dpr)); px <= Math.min(w - 1, Math.ceil(maxX * dpr)); px += step) {
        if (!pointInPolygon(px / dpr, py / dpr, poly)) continue;
        const o = ((h - 1 - py) * w + px) * 4;
        const r = buf[o];
        if (!r) continue;
        const key = r * 4 + buf[o + 1];
        counts.set(key, (counts.get(key) || 0) + 1);
        total += 1;
      }
    }
    if (!total) return null;
    const picked = [...counts.entries()]
      .filter(([, c]) => c / total >= 0.05 && c >= 6)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, c]) => ({ region: regions[Math.floor(key / 4) - 1], side: key % 4 === 1 ? "R" : key % 4 === 2 ? "L" : "", share: c / total }));
    if (!picked.length) return null;
    // Центр области — по видимым вершинам внутри контура
    const keys = new Set(picked.map(p => regionIndex(p.region) * 4 + (p.side === "R" ? 1 : p.side === "L" ? 2 : 0)));
    const { mvp, nm } = matrices();
    const inside = [];
    for (let v = 0; v < vertexCount; v++) {
      if (!keys.has(geo.reg[v] * 4 + geo.sid[v])) continue;
      const x = geo.pos[v * 3], y = geo.pos[v * 3 + 1], z = geo.pos[v * 3 + 2];
      const nz = nm[2] * geo.nor[v * 3] + nm[5] * geo.nor[v * 3 + 1] + nm[8] * geo.nor[v * 3 + 2];
      if (nz < 0.05) continue;
      const cw = mvp[3] * x + mvp[7] * y + mvp[11] * z + mvp[15];
      const sx = ((mvp[0] * x + mvp[4] * y + mvp[8] * z + mvp[12]) / cw * 0.5 + 0.5) * cssW;
      const sy = (1 - ((mvp[1] * x + mvp[5] * y + mvp[9] * z + mvp[13]) / cw * 0.5 + 0.5)) * cssH;
      if (pointInPolygon(sx, sy, poly)) inside.push(v);
    }
    if (!inside.length) return null;
    let c = [0, 0, 0], n = [0, 0, 0];
    for (const v of inside) {
      c = add(c, [geo.pos[v * 3], geo.pos[v * 3 + 1], geo.pos[v * 3 + 2]]);
      n = add(n, [geo.nor[v * 3], geo.nor[v * 3 + 1], geo.nor[v * 3 + 2]]);
    }
    c = scale(c, 1 / inside.length);
    n = norm(n);
    const dists = inside.map(v => len(sub([geo.pos[v * 3], geo.pos[v * 3 + 1], geo.pos[v * 3 + 2]], c))).sort((a, b) => a - b);
    const radius = Math.min(0.3, Math.max(0.03, dists[Math.floor(dists.length * 0.9)] || 0.05));
    const round = a => a.map(x => Math.round(x * 10000) / 10000);
    return { regions: picked, center: round(c), normal: round(n), radius: Math.round(radius * 10000) / 10000 };
  }

  // --- Цвета ---
  function repaint() {
    for (let v = 0; v < vertexCount; v++) {
      const p = [geo.pos[v * 3], geo.pos[v * 3 + 1], geo.pos[v * 3 + 2]];
      const n = [geo.nor[v * 3], geo.nor[v * 3 + 1], geo.nor[v * 3 + 2]];
      const m = geo.mat[v];
      let col = m === 2 ? theme.rim : m ? hairColor : colorizer(regions[geo.reg[v] - 1], geo.sid[v] === 1 ? "R" : geo.sid[v] === 2 ? "L" : "", p, n);
      if (selection) {
        const d = len(sub(p, selection.c));
        if (d < selection.r && dot(n, selection.n) > -0.25) {
          const w = 0.45 + 0.5 * (1 - (d / selection.r) ** 2);
          col = [col[0] + (SELECT[0] - col[0]) * w, col[1] + (SELECT[1] - col[1]) * w, col[2] + (SELECT[2] - col[2]) * w];
        }
      }
      const k = geo.shade[v];
      colors[v * 3] = col[0] * k;
      colors[v * 3 + 1] = col[1] * k;
      colors[v * 3 + 2] = col[2] * k;
    }
    if (gl && !lost) {
      gl.bindBuffer(gl.ARRAY_BUFFER, glState.col);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, colors);
    }
    requestDraw();
  }

  // --- Размер ---
  function resize() {
    const rect = el.getBoundingClientRect();
    const w = Math.round(rect.width), h = Math.round(rect.height);
    if (!w || !h) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = w;
    cssH = h;
    canvas.width = overlay.width = Math.round(w * dpr);
    canvas.height = overlay.height = Math.round(h * dpr);
    requestDraw();
  }
  const ro = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(el);

  // --- Анимация вида ---
  let anim = null;
  function animateTo(yaw, pitch = view.pitch, ms = 450) {
    let dy = ((yaw - view.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    const from = { yaw: view.yaw, pitch: view.pitch }, start = performance.now();
    if (anim) cancelAnimationFrame(anim);
    const stepFn = now => {
      const t = Math.min(1, (now - start) / ms), k = easeOut(t);
      view.yaw = from.yaw + dy * k;
      view.pitch = from.pitch + (pitch - from.pitch) * k;
      draw();
      anim = t < 1 ? requestAnimationFrame(stepFn) : null;
    };
    anim = requestAnimationFrame(stepFn);
  }

  // --- Ввод ---
  const pointers = new Map();
  let drag = null, lasso = null, pinch = null;
  const ctx2d = overlay.getContext("2d");
  const local = e => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  function drawLasso() {
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, cssW, cssH);
    if (!lasso || lasso.length < 2) return;
    ctx2d.beginPath();
    ctx2d.moveTo(lasso[0][0], lasso[0][1]);
    for (const [x, y] of lasso) ctx2d.lineTo(x, y);
    ctx2d.closePath();
    ctx2d.fillStyle = "rgba(46, 184, 219, 0.16)";
    ctx2d.fill();
    ctx2d.lineWidth = 3;
    ctx2d.lineJoin = "round";
    ctx2d.lineCap = "round";
    ctx2d.strokeStyle = "rgba(14, 150, 190, 0.95)";
    ctx2d.setLineDash([8, 6]);
    ctx2d.stroke();
  }
  const clearOverlay = () => { lasso = null; drawLasso(); };

  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId);
    const pt = local(e);
    pointers.set(e.pointerId, pt);
    if (anim) { cancelAnimationFrame(anim); anim = null; }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: view.zoom };
      drag = null;
      lasso = null;
      drawLasso();
      return;
    }
    if (mode === "lasso") {
      lasso = [pt];
      drawLasso();
    } else {
      drag = { x: pt[0], y: pt[1], sx: pt[0], sy: pt[1], t: performance.now(), moved: 0 };
    }
  });
  canvas.addEventListener("pointermove", e => {
    if (!pointers.has(e.pointerId)) return;
    const pt = local(e);
    pointers.set(e.pointerId, pt);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      view.zoom = Math.min(2.6, Math.max(0.8, pinch.zoom * (d / Math.max(pinch.d, 1))));
      requestDraw();
      return;
    }
    if (lasso) {
      const last = lasso[lasso.length - 1];
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 3) {
        lasso.push(pt);
        drawLasso();
      }
      return;
    }
    if (drag) {
      const dx = pt[0] - drag.x, dy = pt[1] - drag.y;
      drag.x = pt[0];
      drag.y = pt[1];
      drag.moved += Math.abs(dx) + Math.abs(dy);
      view.yaw += dx * 0.012;
      view.pitch = Math.min(0.6, Math.max(-0.45, view.pitch + dy * 0.006));
      requestDraw();
    }
  });
  const finish = e => {
    if (!pointers.has(e.pointerId)) return;
    const pt = local(e);
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      return;
    }
    if (lasso) {
      const poly = lasso;
      lasso = null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of poly) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
      if (poly.length < 6 || maxX - minX < 14 || maxY - minY < 14) {
        drawLasso();
        const hit = pickAt(pt[0], pt[1]);
        if (hit && onTap) onTap(hit.region, hit.side);
        return;
      }
      lasso = poly;
      drawLasso();
      const result = analyzeLasso(poly);
      setTimeout(clearOverlay, 350);
      if (result) {
        selection = { c: result.center, n: result.normal, r: result.radius };
        repaint();
      }
      if (onLasso) onLasso(result);
      return;
    }
    if (drag) {
      const tap = drag.moved < 8 && performance.now() - drag.t < 450;
      drag = null;
      if (tap) {
        const hit = pickAt(pt[0], pt[1]);
        if (hit && onTap) onTap(hit.region, hit.side);
      }
    }
  };
  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", e => {
    pointers.delete(e.pointerId);
    drag = null;
    pinch = null;
    lasso = null;
    drawLasso();
  });
  canvas.addEventListener("keydown", e => {
    const keys = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, -0.1], ArrowDown: [0, 0.1] };
    if (keys[e.key]) {
      e.preventDefault();
      view.yaw += keys[e.key][0];
      view.pitch = Math.min(0.6, Math.max(-0.45, view.pitch + keys[e.key][1]));
      requestDraw();
    } else if (e.key === "+" || e.key === "=") {
      view.zoom = Math.min(2.6, view.zoom * 1.15);
      requestDraw();
    } else if (e.key === "-") {
      view.zoom = Math.max(0.8, view.zoom / 1.15);
      requestDraw();
    }
  });
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); lost = true; });
  canvas.addEventListener("webglcontextrestored", () => {
    lost = false;
    initGL();
    repaint();
  });

  initGL();
  let introDone = false;

  return {
    el,
    setColorizer(fn) { colorizer = fn; },
    setTheme(t) { theme = { ...theme, ...t }; if (t.hair) hairColor = t.hair; requestDraw(); },
    // Мужское или женское тело: геометрия пересобирается, вид и выделение сохраняются
    setSex(next) {
      const want = next === "f" ? "f" : "m";
      if (want === bodySex) return;
      bodySex = want;
      geo = buildFigure(regionIndex, bodySex);
      vertexCount = geo.pos.length / 3;
      colors = new Float32Array(vertexCount * 3);
      buildPick();
      if (gl && !lost) {
        const upload = (buf, data, target = gl.ARRAY_BUFFER, usage = gl.STATIC_DRAW) => { gl.bindBuffer(target, buf); gl.bufferData(target, data, usage); };
        upload(glState.pos, geo.pos);
        upload(glState.nor, geo.nor);
        upload(glState.col, colors, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW);
        upload(glState.pickPos, pickPos);
        upload(glState.pickIds, pickIds);
        upload(glState.idx, geo.idx, gl.ELEMENT_ARRAY_BUFFER);
      }
      repaint();
    },
    get sex() { return bodySex; },
    repaint,
    resize,
    setMode(m) {
      mode = m;
      el.classList.toggle("is-lasso", m === "lasso");
      canvas.style.touchAction = m === "lasso" ? "none" : "pan-y";
    },
    setView(name) {
      const yaw = name === "back" ? Math.PI : name === "side" ? Math.PI / 2 : name === "otherSide" ? -Math.PI / 2 : 0;
      animateTo(yaw, 0.06);
    },
    zoomBy(k) {
      view.zoom = Math.min(2.6, Math.max(0.8, view.zoom * k));
      requestDraw();
    },
    reset() {
      view.zoom = 1;
      animateTo(0, 0.06);
    },
    intro() {
      if (introDone) return;
      introDone = true;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      view.yaw = -0.9;
      animateTo(0, 0.06, 1100);
    },
    clearSelection() {
      selection = null;
      clearOverlay();
      repaint();
    },
    get mode() { return mode; },
    pickAt,
    analyzeLasso,
    visibleRegions,
    get vertexCount() { return vertexCount; }
  };
}
