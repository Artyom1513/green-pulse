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
function loft(mesh, { rows, step, segs, power, bump, classify }) {
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
    const th = (j / segs) * Math.PI * 2;
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

// Сборка фигуры. regionIndex(id) → номер зоны (1…), сторона: 0 — центр, 1 — правая (x < 0), 2 — левая
function buildFigure(regionIndex) {
  const pos = [], nor = [], reg = [], sid = [], idx = [];
  const mesh = {
    idx,
    get count() { return pos.length / 3; },
    push(p, n, region, side) {
      pos.push(p[0], p[1], p[2]);
      nor.push(n[0], n[1], n[2]);
      reg.push(regionIndex(region));
      sid.push(side);
    }
  };
  const sideOf = x => (x < -0.012 ? 1 : x > 0.012 ? 2 : 0);
  const R = (id, p) => [id, sideOf(p[0])];
  const C = id => [id, 0];

  // ----- Туловище -----
  loft(mesh, {
    step: 0.011, segs: 48, power: 2.4,
    rows: [
      [0.812, 0, 0, 0, -0.012], [0.818, 0.045, 0.034, 0.045, -0.012], [0.835, 0.075, 0.050, 0.065, -0.012],
      [0.865, 0.112, 0.068, 0.085, -0.012], [0.905, 0.148, 0.082, 0.096, -0.010], [0.950, 0.160, 0.088, 0.097, -0.008],
      [1.000, 0.155, 0.092, 0.090, -0.002], [1.050, 0.142, 0.094, 0.082, 0.002], [1.090, 0.137, 0.096, 0.080, 0.004], [1.130, 0.141, 0.098, 0.082, 0.006],
      [1.182, 0.151, 0.104, 0.088, 0.008], [1.242, 0.163, 0.110, 0.093, 0.010], [1.302, 0.173, 0.112, 0.097, 0.010],
      [1.356, 0.181, 0.106, 0.098, 0.008], [1.400, 0.186, 0.093, 0.093, 0.004], [1.432, 0.168, 0.075, 0.080, 0.000],
      [1.458, 0.122, 0.061, 0.066, -0.004], [1.478, 0.074, 0.053, 0.056, -0.006], [1.492, 0.040, 0.040, 0.040, -0.006],
      [1.500, 0, 0, 0, -0.006]
    ],
    bump: (x, y, z) => {
      const ax = Math.abs(x);
      let e = 0;
      if (z > 0) {
        // грудные мышцы и лёгкая линия пресса
        e += 0.015 * smooth(1.19, 1.26, y) * (1 - smooth(1.33, 1.40, y)) * bell(ax, 0.078, 0.06);
        e -= 0.0035 * bell(ax, 0, 0.009) * smooth(0.97, 1.02, y) * (1 - smooth(1.18, 1.24, y));
      } else {
        // лопатки, ложбинка позвоночника, ягодицы и их разделение
        e += 0.011 * smooth(1.21, 1.27, y) * (1 - smooth(1.36, 1.41, y)) * bell(ax, 0.088, 0.045);
        e -= 0.006 * bell(ax, 0, 0.011) * smooth(0.99, 1.04, y) * (1 - smooth(1.40, 1.44, y));
        e += 0.026 * bell(y, 0.885, 0.048) * bell(ax, 0.072, 0.058);
        e -= 0.006 * bell(ax, 0, 0.01) * (1 - smooth(0.9, 0.95, y));
      }
      return e;
    },
    classify: (p, d) => {
      const ax = Math.abs(p[0]), y = p[1], fr = d[2];
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
  sweep(mesh, {
    pts: [[0, 1.452, -0.012], [0, 1.53, -0.004], [0, 1.6, 0.008]], rings: 10, segs: 28, capStart: false, capEnd: false,
    shape: (u, ct, st) => ellipse(0.058 - 0.004 * u, 0.062 - 0.006 * u, ct, st),
    classify: () => C("neck")
  });
  loft(mesh, {
    step: 0.006, segs: 40, power: 2.1,
    rows: [
      [1.545, 0, 0, 0, 0.055], [1.549, 0.02, 0.016, 0.014, 0.052], [1.556, 0.034, 0.028, 0.022, 0.050], [1.565, 0.048, 0.040, 0.040, 0.040],
      [1.585, 0.060, 0.052, 0.062, 0.025], [1.610, 0.068, 0.062, 0.080, 0.014], [1.640, 0.074, 0.074, 0.090, 0.006],
      [1.670, 0.078, 0.082, 0.096, 0.002], [1.700, 0.077, 0.080, 0.098, -0.002], [1.728, 0.069, 0.068, 0.090, -0.006],
      [1.750, 0.052, 0.050, 0.070, -0.010], [1.764, 0.028, 0.026, 0.040, -0.012], [1.770, 0, 0, 0, -0.012]
    ],
    bump: (x, y, z) => {
      if (z <= 0) return 0;
      const ax = Math.abs(x);
      return -0.005 * bell(ax, 0.031, 0.015) * bell(y, 1.668, 0.011) // глазницы
        + 0.004 * bell(y, 1.689, 0.007) * (1 - smooth(0.05, 0.07, ax)) // надбровья
        + 0.004 * bell(y, 1.645, 0.012) * bell(ax, 0.056, 0.014); // скулы
    },
    classify: () => C("head")
  });
  ellipsoid(mesh, [0, 1.647, 0.087], 0.012, 0.023, 0.018, () => C("head"), 8, 12);
  for (const s of [-1, 1]) ellipsoid(mesh, [s * 0.078, 1.656, -0.006], 0.009, 0.029, 0.019, () => C("head"), 8, 12);

  for (const s of [-1, 1]) {
    // ----- Рука: плечо → локоть → запястье -----
    const armPts = [[s * 0.176, 1.4, -0.006], [s * 0.205, 1.30, -0.012], [s * 0.226, 1.17, -0.016], [s * 0.233, 1.105, -0.012], [s * 0.242, 0.99, 0.01], [s * 0.252, 0.872, 0.03]];
    const upper = [[0.054, 0.058], [0.051, 0.054], [0.046, 0.046], [0.041, 0.042], [0.036, 0.041]];
    const lower = [[0.036, 0.041], [0.042, 0.046], [0.037, 0.039], [0.033, 0.030], [0.030, 0.021]];
    sweep(mesh, {
      pts: armPts, rings: 46, segs: 28,
      shape: (u, ct, st, K) => {
        const ue = K[3], out = -s * st;
        if (u <= ue) {
          const v = u / ue, [a, b] = table(upper, v);
          const extra = 0.009 * bell(v, 0.56, 0.2) * Math.max(0, ct) ** 2 + 0.007 * bell(v, 0.45, 0.22) * Math.max(0, -ct) ** 2
            + 0.009 * bell(v, 0.12, 0.12) * Math.max(0, out) ** 1.5;
          return ellipse(a, b, ct, st, extra);
        }
        const v = (u - ue) / (1 - ue), [a, b] = table(lower, v);
        const extra = 0.006 * bell(v, 0.22, 0.18) * Math.max(0, 0.6 * ct + 0.8 * out) ** 2;
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

    // ----- Кисть: ладонь, четыре пальца и большой палец -----
    sweep(mesh, {
      pts: [[s * 0.253, 0.868, 0.031], [s * 0.257, 0.818, 0.036], [s * 0.26, 0.776, 0.04]], rings: 12, segs: 24, capStart: false, capRings: 4,
      shape: (u, ct, st) => {
        const [a, b] = table([[0.030, 0.017], [0.040, 0.0155], [0.042, 0.013]], u);
        const inn = s * st;
        const pad = 0.006 * bell(u, 0.4, 0.22) * Math.max(0, 0.6 * ct + 0.8 * inn) ** 2;
        return [a * spow(ct, 2 / 2.8) + pad * ct, b * spow(st, 2 / 2.8) + pad * st];
      },
      classify: (p, d, u) => (u < 0.18 ? R("wrist", p) : R("hand", p))
    });
    const fingers = [[0.027, 0.072, 0.0095], [0.009, 0.080, 0.0102], [-0.009, 0.075, 0.0096], [-0.026, 0.060, 0.0086]];
    for (const [dz, Lf, rf] of fingers) {
      const x0 = s * 0.258, z0 = 0.04 + dz, y0 = 0.786;
      sweep(mesh, {
        pts: [[x0, y0, z0], [x0 - s * 0.003, y0 - Lf * 0.5, z0 + dz * 0.05], [x0 - s * 0.011, y0 - Lf, z0 + dz * 0.1]],
        rings: 9, segs: 12, capRings: 4,
        shape: (u, ct, st) => ellipse(rf * (1 - 0.22 * u), rf * (1 - 0.18 * u), ct, st),
        classify: p => R("fingers", p)
      });
    }
    sweep(mesh, {
      pts: [[s * 0.254, 0.846, 0.058], [s * 0.249, 0.814, 0.07], [s * 0.245, 0.789, 0.073]], rings: 9, segs: 12, capRings: 4,
      shape: (u, ct, st) => ellipse(0.0118 * (1 - 0.2 * u), 0.0112 * (1 - 0.18 * u), ct, st),
      classify: p => R("thumb", p)
    });

    // ----- Нога: тазобедренный сустав → колено → лодыжка -----
    const thigh = [[0.064, 0.066], [0.088, 0.090], [0.078, 0.076], [0.067, 0.063], [0.056, 0.054], [0.050, 0.051]];
    const shank = [[0.050, 0.051], [0.048, 0.049], [0.050, 0.047], [0.043, 0.042], [0.035, 0.034], [0.031, 0.031], [0.030, 0.033]];
    sweep(mesh, {
      pts: [[s * 0.086, 0.965, -0.01], [s * 0.094, 0.8, 0.006], [s * 0.097, 0.62, 0.012], [s * 0.099, 0.5, 0.012], [s * 0.1, 0.3, -0.006], [s * 0.1, 0.095, -0.01]],
      rings: 72, segs: 32,
      shape: (u, ct, st, K) => {
        const uk = K[3], out = -s * st, inn = -out;
        if (u <= uk) {
          const v = u / uk, [a, b] = table(thigh, v);
          const extra = 0.010 * bell(v, 0.38, 0.25) * Math.max(0, ct) ** 2
            + 0.011 * bell(v, 0.83, 0.08) * Math.max(0, 0.6 * ct + 0.8 * inn) ** 2
            + 0.008 * bell(v, 0.42, 0.25) * Math.max(0, -ct) ** 2
            + 0.012 * bell(v, 0.97, 0.05) * Math.max(0, ct) ** 3
            - 0.004 * bell(v, 0.5, 0.3) * Math.max(0, out) ** 4;
          return ellipse(a, b, ct, st, extra);
        }
        const v = (u - uk) / (1 - uk), [a, b] = table(shank, v);
        const extra = 0.024 * bell(v, 0.3, 0.16) * Math.max(0, -ct) ** 1.6 * (1 + 0.25 * inn)
          - 0.006 * bell(v, 0.86, 0.08) * Math.max(0, -ct) ** 2
          + 0.010 * bell(v, 0.02, 0.05) * Math.max(0, ct) ** 3
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

    // ----- Стопа: пятка → свод → пальцы -----
    sweep(mesh, {
      pts: [[s * 0.1, 0.04, -0.062], [s * 0.1, 0.05, -0.02], [s * 0.102, 0.042, 0.04], [s * 0.104, 0.028, 0.11], [s * 0.106, 0.018, 0.16]],
      rings: 24, segs: 28, ref: [0, 1, 0], capRings: 5,
      shape: (u, ct, st) => {
        const [top, bottom, w] = table([[0.030, 0.030, 0.030], [0.040, 0.032, 0.033], [0.044, 0.030, 0.038], [0.030, 0.022, 0.044], [0.020, 0.016, 0.044], [0.014, 0.012, 0.038]], u);
        const inn = s * st;
        const toe = 0.004 * bell(u, 0.9, 0.08) * Math.max(0, inn) * Math.max(0, ct);
        return [(ct >= 0 ? top : bottom) * spow(ct, 2 / (ct >= 0 ? 2.4 : 3)) + toe, w * spow(st, 2 / 2.4)];
      },
      classify: (p, d, u) => {
        if (u < 0.24) return R("heel", p);
        if (u > 0.74) return R("toes", p);
        return d[1] < -0.6 ? R("heel", p) : R("foot", p);
      }
    });
  }

  return {
    pos: new Float32Array(pos), nor: new Float32Array(nor),
    reg: new Uint8Array(reg), sid: new Uint8Array(sid), idx: new Uint16Array(idx)
  };
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
  vec3 L1 = normalize(vec3(0.45, 0.75, 0.9));
  vec3 L2 = normalize(vec3(-0.7, 0.15, 0.45));
  float d1 = max(dot(n, L1), 0.0);
  float d2 = max(dot(n, L2), 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
  vec3 h = normalize(L1 + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, h), 0.0), 48.0) * 0.16;
  vec3 col = vC * (uAmb + 0.22 * hemi + 0.55 * d1 + 0.18 * d2) + uRim * rim * 0.5 + spec;
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
export function createFigure({ regions, onTap, onLasso, label }) {
  const regionIndex = id => regions.indexOf(id) + 1;
  const geo = buildFigure(regionIndex);
  const vertexCount = geo.pos.length / 3;
  const colors = new Float32Array(vertexCount * 3);
  // Для выбора зоны каждый треугольник получает один код: иначе на границе двух зон
  // интерполяция дала бы «чужие» номера посередине
  const triCount = geo.idx.length / 3;
  const pickPos = new Float32Array(triCount * 9);
  const pickIds = new Float32Array(triCount * 6);
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
      let col = colorizer(regions[geo.reg[v] - 1], geo.sid[v] === 1 ? "R" : geo.sid[v] === 2 ? "L" : "", p, n);
      if (selection) {
        const d = len(sub(p, selection.c));
        if (d < selection.r && dot(n, selection.n) > -0.25) {
          const w = 0.45 + 0.5 * (1 - (d / selection.r) ** 2);
          col = [col[0] + (SELECT[0] - col[0]) * w, col[1] + (SELECT[1] - col[1]) * w, col[2] + (SELECT[2] - col[2]) * w];
        }
      }
      colors[v * 3] = col[0];
      colors[v * 3 + 1] = col[1];
      colors[v * 3 + 2] = col[2];
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
    setTheme(t) { theme = { ...theme, ...t }; requestDraw(); },
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
    vertexCount
  };
}
