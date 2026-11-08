// ===== Листопульс: объёмные схемы упражнений =====
// Фигура — та же 3D-модель, что на вкладке «Тело» (мужская или женская), только с костями
// и спортивной одеждой. Движение берётся из узоров anim.js: суставы в каждый момент считаются
// так же, как для рисунка, и переводятся в 3D. Рисуем в WebGL в три четверти — как в
// профессиональных библиотеках упражнений: мягкий свет, тень на полу, снаряды и подсветка
// мышц, которые работают. Фигуру можно повернуть пальцем, движение — остановить.
// Один WebGL-контекст на все схемы: кадр рисуется в общий холст и копируется в холст схемы.

import { buildBody, PART } from "./body3d.js";
import { REGIONS, EX } from "./data.js";
import { motionOf } from "./anim.js";

const D = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const madd = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const perp = (v, d) => sub(v, mul(d, dot(v, d))); // составляющая v, перпендикулярная d
// Поворот вектора v вокруг оси k (единичной) на угол a (Родриг)
const rot = (v, k, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
};

// ----- Матрицы 4×4 (по столбцам, как в WebGL) -----
const m4 = {
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  // базис x, y, z и начало o → мировые координаты
  frame(x, y, z, o) { return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1]); },
  invFrame(x, y, z, o) { return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, o), -dot(y, o), -dot(z, o), 1]); },
  persp(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  },
  lookAt(eye, at, up) {
    const z = norm(sub(eye, at)), x = norm(cross(up, z)), y = cross(z, x);
    return m4.invFrame(x, y, z, eye);
  },
  apply(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]]; }
};

// ----- Скелет -----
// 0 таз, 1 поясница, 2 грудная клетка, 3 шея, 4 голова; руки: ключица, плечо, предплечье (две
// половины — поворот кисти ладонью вниз распределяется по предплечью), кисть; ноги: бедро, голень, стопа
const BONES = ["pelvis", "spine", "chest", "neck", "head",
  "clavR", "upperR", "foreR", "fore2R", "handR", "clavL", "upperL", "foreL", "fore2L", "handL",
  "thighR", "shinR", "footR", "thighL", "shinL", "footL", "pony"];
const BI = Object.fromEntries(BONES.map((b, i) => [b, i]));
const NB = BONES.length;
const SIDE = ["R", "L"];
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

// Опорная рамка кости: y — вдоль кости, x — ось сгиба (ref без составляющей вдоль кости)
function boneFrame(head, tail, ref) {
  const y = norm(sub(tail, head));
  let x = perp(ref, y);
  if (len(x) < 1e-4) x = perp(Math.abs(y[0]) < 0.9 ? X : Z, y);
  x = norm(x);
  return { x, y, z: cross(x, y), o: head, L: len(sub(tail, head)) };
}

// Исходная поза: кости из суставов модели
function bindSkeleton(j) {
  const b = {};
  const set = (name, head, tail, ref) => { b[name] = boneFrame(head, tail, ref); };
  set("pelvis", j.pelvis, j.spine, X);
  set("spine", j.spine, j.chest, X);
  set("chest", j.chest, j.neck, X);
  set("neck", j.neck, j.head, X);
  set("head", j.head, j.top, X);
  set("pony", j.pony, j.ponyTip, X);
  for (let i = 0; i < 2; i++) {
    const S = SIDE[i];
    set("clav" + S, j.clav[i], j.shoulder[i], Y);
    // ось локтя: сгиб вперёд у обеих рук — вокруг −x; ось колена — вокруг +x
    set("upper" + S, j.shoulder[i], j.elbow[i], [-1, 0, 0]);
    set("fore" + S, j.elbow[i], j.wrist[i], [-1, 0, 0]);
    set("fore2" + S, j.elbow[i], j.wrist[i], [-1, 0, 0]);
    set("hand" + S, j.wrist[i], j.knuckle[i], [-1, 0, 0]);
    set("thigh" + S, j.hip[i], j.knee[i], X);
    set("shin" + S, j.knee[i], j.ankle[i], X);
    set("foot" + S, j.ankle[i], j.toe[i], X);
  }
  const inv = BONES.map(n => { const f = b[n]; return m4.invFrame(f.x, f.y, f.z, f.o); });
  return { frames: b, inv, j };
}

// ----- Веса костей для каждой вершины -----
// Каждую вершину двигают до четырёх костей; у суставов вес плавно переходит от одной кости
// к другой — так локти, колени и плечи сгибаются без изломов
function projSeg(p, a, b) {
  const ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / dot(ab, ab), 0, 1);
  return { t, d: len(sub(p, madd(a, ab, t))), L: len(ab) };
}
function skinWeights(geo, j) {
  const n = geo.pos.length / 3;
  const bi = new Float32Array(n * 4), bw = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const p = [geo.pos[v * 3], geo.pos[v * 3 + 1], geo.pos[v * 3 + 2]];
    const part = geo.part[v], y = p[1], ax = Math.abs(p[0]);
    const si = p[0] < 0 ? 0 : 1, S = SIDE[si];
    const w = {};
    const put = (name, k) => { if (k > 1e-4) w[name] = (w[name] || 0) + k; };
    // по длине руки или ноги: t — путь от начала, tj — где средний сустав, te — где конец
    const along = (a, m, e) => {
      const s1 = projSeg(p, a, m), s2 = projSeg(p, m, e);
      return { t: s1.d <= s2.d ? s1.t * s1.L : s1.L + s2.t * s2.L, tj: s1.L, te: s1.L + s2.L };
    };
    if (part === PART.torso) {
      const pel = 1 - smooth(0.95, 1.07, y), ch = smooth(1.12, 1.26, y);
      let wp = pel, ws = Math.max(0, 1 - pel - ch), wc = ch;
      // таз у тазобедренных суставов идёт за бедром: складка спереди, ягодица сзади
      const th = smooth(0.97, 0.84, y) * smooth(0.025, 0.075, ax) * (p[2] < 0 ? 0.62 : 0.5);
      // дельта и надплечье идут за плечом и ключицей
      const arm = smooth(0.122, 0.178, ax) * smooth(1.26, 1.36, y) * 0.72;
      const clav = smooth(1.33, 1.42, y) * smooth(0.035, 0.1, ax) * (1 - arm) * 0.75;
      wp *= 1 - th;
      wc *= 1 - arm - clav;
      put("pelvis", wp); put("spine", ws); put("chest", wc);
      put("thigh" + S, th * pel); put("upper" + S, arm * ch); put("clav" + S, clav * ch);
    } else if (part === PART.neck) {
      const c = 1 - smooth(1.45, 1.53, y), hd = smooth(1.53, 1.6, y);
      put("chest", c); put("head", hd); put("neck", Math.max(0, 1 - c - hd));
    } else if (part === PART.head || part === PART.hair || part === PART.tie) {
      put("head", 1);
    } else if (part === PART.pony) {
      // хвост: у резинки держится за голову, дальше висит сам
      const r = projSeg(p, j.pony, j.ponyTip);
      const k = smooth(0.02, 0.12, r.t * r.L);
      put("head", 1 - k); put("pony", k);
    } else if (part === PART.arm[si]) {
      const r = along(j.shoulder[si], j.elbow[si], j.wrist[si]);
      const fore = smooth(r.tj - 0.035, r.tj + 0.035, r.t);
      const top = (1 - smooth(0, 0.075, r.t)) * 0.45;
      const hand = smooth(r.te - 0.012, r.te + 0.02, r.t);
      const mid = smooth(r.tj + 0.03, r.te - 0.04, r.t); // вторая половина предплечья
      put("chest", top);
      put("upper" + S, (1 - fore) * (1 - top));
      put("fore" + S, fore * (1 - hand) * (1 - mid));
      put("fore2" + S, fore * (1 - hand) * mid);
      put("hand" + S, fore * hand);
    } else if (part === PART.hand[si]) {
      const d = len(sub(p, j.wrist[si]));
      const f = (1 - smooth(0.0, 0.03, d)) * 0.45;
      put("fore2" + S, f); put("hand" + S, 1 - f);
    } else if (part === PART.leg[si]) {
      const r = along(j.hip[si], j.knee[si], j.ankle[si]);
      const shin = smooth(r.tj - 0.045, r.tj + 0.045, r.t);
      const top = (1 - smooth(0, 0.085, r.t)) * 0.4;
      const foot = smooth(r.te - 0.03, r.te + 0.012, r.t);
      put("pelvis", top);
      put("thigh" + S, (1 - shin) * (1 - top));
      put("shin" + S, shin * (1 - foot));
      put("foot" + S, shin * foot);
    } else if (part === PART.kneecap[si]) {
      put("thigh" + S, 0.42); put("shin" + S, 0.58);
    } else if (part === PART.malleolus[si]) {
      put("shin" + S, 0.7); put("foot" + S, 0.3);
    } else if (part === PART.foot[si]) {
      const sh = smooth(0.065, 0.115, y) * 0.6;
      put("shin" + S, sh); put("foot" + S, 1 - sh);
    } else put("pelvis", 1);
    const list = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = list.reduce((s, [, k]) => s + k, 0) || 1;
    list.forEach(([name, k], i) => { bi[v * 4 + i] = BI[name]; bw[v * 4 + i] = k / sum; });
  }
  return { bi, bw };
}

// ----- Одежда -----
// Материалы: 0 кожа, 1 майка или футболка, 2 шорты или леггинсы, 3 кроссовки, 4 подошва,
// 5 волосы, 6 акцент (резинка для волос), 7 носки
function materials(geo, j, sex) {
  const n = geo.pos.length / 3;
  const look = new Float32Array(n * 2);
  const f = sex === "f";
  for (let v = 0; v < n; v++) {
    const p = [geo.pos[v * 3], geo.pos[v * 3 + 1], geo.pos[v * 3 + 2]];
    const part = geo.part[v], y = p[1], ax = Math.abs(p[0]), si = p[0] < 0 ? 0 : 1;
    let m = 0;
    if (part === PART.hair) m = 5;
    else if (part === PART.tie) m = 6;
    else if (part === PART.torso) {
      if (y < 0.985) m = 2;
      else if (!f) {
        m = 1;
        // круглый вырез ворота: спереди ниже, сзади у самой шеи
        const edge = p[2] > 0 ? 1.395 + 0.04 * (ax / 0.085) ** 2 : 1.445;
        if (ax < 0.085 && y > edge) m = 0;
      } else {
        m = 1;
        const strap = ax > 0.068 && ax < 0.1;
        if (y > 1.34 && !strap) m = 0; // открытые плечи, лямки майки
        if (y > 1.3 && ax < 0.07 && p[2] > 0.02) m = 0; // вырез спереди
        if (y > 1.36 && ax > 0.1) m = 0;
      }
    } else if (part === PART.arm[si]) {
      const r = projSeg(p, j.shoulder[si], j.elbow[si]);
      if (!f && r.t < 0.42 && r.d < 0.09) m = 1; // рукав футболки
    } else if (part === PART.leg[si] || part === PART.kneecap[si]) {
      const thigh = projSeg(p, j.hip[si], j.knee[si]), shin = projSeg(p, j.knee[si], j.ankle[si]);
      const onThigh = thigh.d <= shin.d;
      if (f) { if (onThigh || shin.t < 0.72) m = 2; } // леггинсы до середины голени
      else if (onThigh && thigh.t < 0.48) m = 2; // шорты
      if (y < 0.135) m = 7; // носки
    } else if (part === PART.malleolus[si]) m = 7;
    else if (part === PART.foot[si]) m = y < 0.024 ? 4 : y > 0.098 ? 7 : 3;
    look[v * 2] = m;
    look[v * 2 + 1] = geo.shade[v];
  }
  return look;
}

// ----- Подсветка работающих мышц -----
// Нагрузка упражнения (data.js, load) → зоны модели: те же соответствия, что у слоя «Нагрузка мышц»
const MUSCLE_KEYS = {
  neck: ["neck"], trapezius: ["upperBack", "neck"], shoulder: ["shoulder"], upperArm: ["elbow"], triceps: ["elbow"], forearm: ["wrist"],
  chest: ["chest"], abdomen: ["abdomen"], obliques: ["abdomen"], shoulderBlade: ["upperBack"], upperBack: ["upperBack"], lowerBack: ["lowerBack"],
  glute: ["hip"], hip: ["hip"], thighFront: ["knee"], thighOuter: ["hip"], thighInner: ["groin"], groin: ["groin"], hamstring: ["hamstring"],
  calf: ["ankle"], shin: ["ankle"]
};
const REG_IDS = REGIONS.map(r => r.id);
function workOf(id, geo) {
  const load = (EX[id] || {}).load || {};
  const lvl = { 1: 0, 2: 0.72, 3: 1 };
  const byReg = REG_IDS.map(rid => Math.max(0, ...(MUSCLE_KEYS[rid] || []).map(k => lvl[load[k]] || 0)));
  const n = geo.pos.length / 3, out = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const r = geo.reg[v] - 1;
    if (geo.mat[v] || r < 0) continue;
    out[v] = byReg[r] || 0;
  }
  // мягкая граница подсветки: соседние вершины чуть подсвечиваются
  return out;
}

// ----- Модель для схем (по полу), строится один раз -----
const CHARS = {};
function character(sex) {
  const key = sex === "f" ? "f" : "m";
  if (CHARS[key]) return CHARS[key];
  const geo = buildBody(REG_IDS, key);
  const skel = bindSkeleton(geo.bind);
  const { bi, bw } = skinWeights(geo, geo.bind);
  const look = materials(geo, geo.bind, key);
  CHARS[key] = { key, geo, skel, bi, bw, look, n: geo.pos.length / 3, gpu: null };
  return CHARS[key];
}

// ===== Перевод суставов рисунка в 3D =====
// Рисунок: фигура в профиль (x — вперёд, y — вверх; ближняя к зрителю рука и нога — нулевые)
// или анфас (x — вбок, y — вверх, глубина — из ракурса). 3D: y — вверх, лицо смотрит в +z,
// правая сторона тела — x < 0. Масштаб рисунка близок к метрам; K подгоняет его к модели
const K = 0.94;
const FOOT_SLANT = Math.atan2(0.078, 0.163); // стопа модели от лодыжки к носку идёт вниз

function liftSide(J, j, grip, Pz, frontal) {
  const P3 = q => [0, q[1] * K, q[0] * K];
  const V3 = (a, b) => [0, (b[1] - a[1]) * K, (b[0] - a[0]) * K];
  const hipC = P3(J.hip);
  const tv = V3(J.hip, J.sh);
  // пожимание плечами (sh) поднимает плечи, а не удлиняет корпус
  const shrug = ((Pz && Pz.sh) || 0) * K;
  const u = norm(tv), fT = (len(tv) - shrug) / (j.shoulder[0][1] - j.hip[0][1]);
  // frontal: плоскость рисунка — фронтальная плоскость тела (лёжа на боку, боковая планка):
  // бока тела — в плоскости рисунка, живот смотрит на зрителя
  const lat = frontal ? norm(cross(u, X)) : X, fwd = cross(lat, u); // fwd — сторона живота
  const along = h => madd(hipC, u, h * fT);
  const curve = J.curve || 0;
  const out = { lat, latC: lat, latH: lat, up: u, fwd };
  out.pelvis = along(j.pelvis[1] - j.hip[0][1]);
  out.spine = madd(along(j.spine[1] - j.hip[0][1]), fwd, -curve * 2.4);
  out.chest = madd(along(j.chest[1] - j.hip[0][1]), fwd, -curve * 2.0);
  out.neck = along(j.neck[1] - j.hip[0][1]);
  // голова: направление шея → центр головы из рисунка
  const hdir = norm(V3(J.neck, J.head));
  out.head = madd(out.neck, norm(add(u, hdir)), j.head[1] - j.neck[1]);
  out.top = madd(out.head, hdir, j.top[1] - j.head[1]);
  out.hdir = hdir;
  const S0 = madd(along(j.shoulder[0][1] - j.hip[0][1]), u, shrug);
  const roll = V3(J.sh, J.shArm || J.sh);
  out.clav = [0, 1].map(i => madd(madd(along(j.clav[i][1] - j.hip[0][1]), lat, j.clav[i][0]), fwd, 0.015));
  out.shoulder = [0, 1].map(i => add(madd(madd(S0, lat, j.shoulder[i][0]), fwd, -0.006), roll));
  const shArm = J.shArm || J.sh;
  out.elbow = []; out.wrist = []; out.knuckle = [];
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1, A = J.arms[i];
    const ev = V3(shArm, A.elbow), wv = V3(A.elbow, A.wrist), hv = V3(A.wrist, A.hand);
    // рука, опущенная вдоль тела, отведена чуть в сторону, чтобы не проходить сквозь корпус
    const hang = smooth(0.15, 0.75, dot(norm(ev), mul(u, -1)));
    let e = madd(add(out.shoulder[i], ev), lat, s * (0.046 * hang + 0.006));
    let w = madd(add(e, wv), lat, s * (0.018 * hang + 0.002));
    if (grip === "together") {
      // гантель или гиря в обеих руках: кисти сходятся к середине
      const wl = s * 0.055, el = s * 0.125;
      w = [wl, w[1], w[2]];
      e = [el, e[1], e[2]];
    }
    out.elbow.push(e);
    out.wrist.push(w);
    out.knuckle.push(madd(w, flatHand(A, hv, fwdFlat(u)), 0.09));
  }
  out.hip = [0, 1].map(i => madd(hipC, lat, j.hip[i][0]));
  out.knee = []; out.ankle = []; out.toe = [];
  for (let i = 0; i < 2; i++) {
    const L = J.legs[i];
    const k = add(out.hip[i], V3(J.hip, L.knee));
    const a = add(out.hip[i], V3(J.hip, L.ankle));
    out.knee.push(madd(k, lat, (i ? 1 : -1) * 0.004));
    out.ankle.push(madd(a, lat, (i ? 1 : -1) * 0.002));
    // стопа: направление из рисунка, наклон «пятка — носок» как у модели
    const fd = norm(V3(L.ankle, L.toe));
    out.toe.push(madd(out.ankle[i], rot(fd, lat, FOOT_SLANT), len(sub(j.toe[i], j.ankle[i]))));
  }
  return out;
}

function liftFront(J, j, grip, Pz) {
  const P3 = q => [q[0] * K, q[1] * K, 0];
  const hipC = P3(J.hip);
  const lb = (J.lb || 0) * D, tw = (J.tw || 0) * D, hd = (J.hd || 0) * D;
  const v2 = [(J.sh[0] - J.hip[0]) * K, (J.sh[1] - J.hip[1]) * K, -0.46 * K * Math.sin(lb)];
  const u = norm(v2), fT = len(v2) / (j.shoulder[0][1] - j.hip[0][1]);
  const hips2 = J.hips || [[J.hip[0] - 0.09, J.hip[1]], [J.hip[0] + 0.09, J.hip[1]]];
  const lat = norm(perp([hips2[1][0] - hips2[0][0], hips2[1][1] - hips2[0][1], 0], u));
  const latC = norm(rot(lat, u, tw));
  const fwd = cross(lat, u), fwdC = cross(latC, u);
  const along = h => madd(hipC, u, h * fT);
  const out = { lat, latC, up: u, fwd: fwdC };
  out.pelvis = along(j.pelvis[1] - j.hip[0][1]);
  out.spine = along(j.spine[1] - j.hip[0][1]);
  out.chest = along(j.chest[1] - j.hip[0][1]);
  out.neck = along(j.neck[1] - j.hip[0][1]);
  // голова: наклон к плечу — как на рисунке (угол между корпусом и шеей), кивок (nd) — к груди,
  // поворот (hd) — вокруг шеи
  const a2 = Math.atan2(J.sh[0] - J.hip[0], J.sh[1] - J.hip[1]);
  const b2 = Math.atan2(J.head[0] - J.neck[0], J.head[1] - J.neck[1]);
  // при наклоне корпуса назад голова остаётся почти вертикальной — взгляд вперёд
  const nod = clamp((J.nd || 0) * 0.42 + lb * 0.75, -0.6, 1.2);
  let hdir = rot(u, fwdC, -(b2 - a2));
  hdir = norm(rot(hdir, latC, nod));
  out.head = madd(out.neck, norm(add(u, hdir)), j.head[1] - j.neck[1]);
  out.top = madd(out.head, hdir, j.top[1] - j.head[1]);
  out.hdir = hdir;
  out.latH = norm(rot(perp(lat, hdir), hdir, hd));
  const S0 = along(j.shoulder[0][1] - j.hip[0][1]);
  out.clav = [0, 1].map(i => madd(madd(along(j.clav[i][1] - j.hip[0][1]), latC, j.clav[i][0]), fwdC, 0.015));
  out.shoulder = [0, 1].map(i => madd(madd(S0, latC, j.shoulder[i][0]), fwdC, -0.006));
  out.elbow = []; out.wrist = []; out.knuckle = [];
  for (let i = 0; i < 2; i++) {
    const A = J.arms[i], z = A.z3 || [0, 0, 0, 0], sh2 = J.shs ? J.shs[i] : J.sh;
    const vec = (q, zq) => [(q[0] - sh2[0]) * K, (q[1] - sh2[1]) * K, (zq - z[0]) * K];
    // рука крепится к плечу модели; кисти приходят туда же, что на рисунке (сходятся у снаряда)
    const corr = sh2[0] * K - out.shoulder[i][0];
    const e = madd(add(out.shoulder[i], vec(A.elbow, z[1])), X, corr * 0.5);
    let w = madd(add(out.shoulder[i], vec(A.wrist, z[2])), X, corr);
    const h = madd(add(out.shoulder[i], vec(A.hand, z[3])), X, corr);
    out.elbow.push(e);
    out.wrist.push(w);
    out.knuckle.push(madd(w, flatHand(A, sub(h, w), fwdFlat(u)), 0.09));
  }
  out.hip = [0, 1].map(i => madd(hipC, lat, j.hip[i][0]));
  out.knee = []; out.ankle = []; out.toe = [];
  for (let i = 0; i < 2; i++) {
    const L = J.legs[i], z = L.z3 || [0, 0, 0], h2 = hips2[i];
    const k = add(out.hip[i], [(L.knee[0] - h2[0]) * K, (L.knee[1] - h2[1]) * K, z[1] * K]);
    const a = add(out.hip[i], [(L.ankle[0] - h2[0]) * K, (L.ankle[1] - h2[1]) * K, z[2] * K]);
    out.knee.push(k);
    out.ankle.push(a);
    // стопа смотрит вперёд, носки чуть врозь
    const s = i === 0 ? -1 : 1;
    const fd = norm([s * 0.16, 0, 1]);
    out.toe.push(madd(a, rot(fd, norm([1, 0, -s * 0.16]), FOOT_SLANT), len(sub(j.toe[i], j.ankle[i]))));
  }
  return out;
}

// Ладонь на полу лежит плашмя, пальцами вперёд (по направлению корпуса); иначе кисть
// продолжает предплечье, как на рисунке
const fwdFlat = u => { const f = [u[0], 0, u[2]]; return len(f) > 0.2 ? norm(f) : Z; };
function flatHand(A, hv, fwd) {
  const d = norm(hv);
  const onFloor = A.hand[1] < 0.075 && A.wrist[1] < 0.12;
  if (!onFloor) return d;
  // плавно: чем ближе кисть к полу, тем горизонтальнее
  const k = smooth(0.12, 0.06, A.wrist[1]);
  return norm(lerp3(d, fwd, k));
}

// ----- Поправки отдельных упражнений для объёма -----
// Рисунок в профиль не передаёт движения вбок: здесь колени уходят в стороны («бабочка», «дерево»),
// руки разводятся в стороны (разведение в наклоне), «раскрытая книга» выполняется лёжа на боку
const isPt = v => Array.isArray(v) && v.length === 3 && typeof v[0] === "number";
const DIRS = ["lat", "latC", "latH", "up", "fwd", "hdir", "lag"];
// повернуть точки цепочки вокруг оси через точку o
function turnChain(P, keys, i, o, axis, ang) {
  for (const k of keys) P[k][i] = add(o, rot(sub(P[k][i], o), axis, ang));
}
function rollBody(P, axis, o, ang) {
  for (const [k, v] of Object.entries(P)) {
    if (DIRS.includes(k)) P[k] = rot(v, axis, ang);
    else if (isPt(v)) P[k] = add(o, rot(sub(v, o), axis, ang));
    else if (Array.isArray(v) && isPt(v[0])) P[k] = v.map(q => add(o, rot(sub(q, o), axis, ang)));
  }
}
const LEG = ["knee", "ankle", "toe"], ARM = ["elbow", "wrist", "knuckle"];
// Расстояние от точки o до отрезка AB
const segDist = (A, B, o) => { const ab = sub(B, A), t = clamp(dot(sub(o, A), ab) / Math.max(dot(ab, ab), 1e-9), 0, 1); return len(sub(o, madd(A, ab, t))); };
// Локоть для заданных плеча и кисти: из всех положений на окружности возможных локтей выбираем
// естественное — в сторону prefer, и чтобы плечо и предплечье не проходили сквозь голову и шею
function elbowFor(S, W, l1, l2, prefer, avoid) {
  const v = sub(W, S), d = clamp(len(v), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const ax = norm(v);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const c = madd(S, ax, a);
  let e1 = perp(prefer, ax);
  if (len(e1) < 1e-3) e1 = perp(Math.abs(ax[1]) < 0.9 ? Y : X, ax);
  e1 = norm(e1);
  const e2 = cross(ax, e1);
  let best = null, bestCost = Infinity;
  for (let k = 0; k < 48; k++) {
    const t = (k / 48) * Math.PI * 2;
    const E = add(c, add(mul(e1, Math.cos(t) * h), mul(e2, Math.sin(t) * h)));
    let cost = (1 - Math.cos(t)) * 0.5;
    for (const [o, r] of avoid) cost += 12 * Math.max(0, r - segDist(S, E, o)) + 12 * Math.max(0, r - segDist(E, W, o));
    if (cost < bestCost) { bestCost = cost; best = E; }
  }
  return { elbow: best, wrist: madd(S, ax, d) };
}
const HOOKS = {
  butterfly(P) {
    for (const i of [0, 1]) turnChain(P, LEG, i, P.hip[i], norm([P.fwd[0], 0, P.fwd[2]]), (i ? -1 : 1) * 62 * D);
  },
  tree(P) {
    turnChain(P, LEG, 1, P.hip[1], Y, 64 * D);
  },
  reverseFly(P) {
    for (const i of [0, 1]) {
      const s = i ? 1 : -1;
      const d0 = norm(sub(P.elbow[i], P.shoulder[i]));
      const phi = Math.acos(clamp(dot(d0, [0, -1, 0]), -1, 1));
      const d1 = rot([0, -1, 0], P.up, s * phi);
      const k = cross(d0, d1), sn = len(k);
      if (sn < 1e-4) continue;
      turnChain(P, ARM, i, P.shoulder[i], mul(k, 1 / sn), Math.atan2(sn, dot(d0, d1)));
    }
  },
  openBook(P, f) {
    // лёжа на боку, колени согнуты; верхняя рука уходит дугой от пола впереди назад, грудь
    // раскрывается, голова следует за рукой
    const o = P.pelvis, axis = norm(sub(P.neck, P.pelvis));
    rollBody(P, axis, o, 90 * D);
    const A = f.Pz.arms[0];
    const t = clamp((A.s - 178) / 92, 0, 1);
    const phi = -t * 165 * D;
    turnChain(P, ARM, 0, P.shoulder[0], axis, phi);
    P.latC = rot(P.latC, axis, phi * 0.35);
    P.latH = rot(P.latH, axis, phi * 0.5);
  }
};
// боковая планка: предплечье опорной руки лежит поперёк тела, впереди груди
function supportForearm(P) {
  const L = len(sub(P.wrist[0], P.elbow[0]));
  const fwd = norm([P.fwd[0], 0, P.fwd[2]]);
  P.wrist[0] = madd(P.elbow[0], fwd, L);
  P.knuckle[0] = madd(P.wrist[0], fwd, 0.09);
}
HOOKS.sidePlank = P => supportForearm(P);
HOOKS.sidePlankKnee = P => {
  supportForearm(P);
  // колени согнуты назад, голени лежат на полу одна на другой
  for (const i of [0, 1]) {
    const L = len(sub(P.ankle[i], P.knee[i])), F = len(sub(P.toe[i], P.ankle[i]));
    const th = norm(sub(P.knee[i], P.hip[i]));
    const d = norm(add(mul(P.fwd, -1), mul(th, 0.15)));
    P.ankle[i] = madd(P.knee[i], d, L);
    P.toe[i] = madd(P.ankle[i], norm(add(d, mul(th, 0.2))), F);
  }
};
// «Гало» с гирей: гиря за «рога» дном вверх, по кругу вокруг головы — перед подбородком, у уха,
// за головой на уровне основания черепа, у другого уха. Корпус и голова неподвижны, локти согнуты:
// спереди смотрят вниз, за головой — вперёд и вверх, руки обходят голову, а не проходят сквозь неё
HOOKS.halo = (P, f) => {
  const U = P.up, Lt = P.latC, Fw = P.fwd;
  const head = madd(P.head, P.hdir, 0.085);
  const ph = (f.phase || 0) * Math.PI * 2;
  const cf = Math.cos(ph), sf = Math.sin(ph);
  const front = Math.max(0, cf) ** 2, back = Math.max(0, -cf) ** 2, side = sf * sf;
  const R = 0.24 * front + 0.2 * side + 0.19 * back;
  const radial = norm(add(mul(Fw, cf), mul(Lt, sf)));
  const grip = add(madd(head, radial, R), mul(U, -0.2 * front - 0.08 * side - 0.12 * back));
  // линия между кистями: спереди и сзади — поперёк тела, у уха — вдоль (одна рука впереди)
  const v = norm(add(mul(Lt, Math.abs(cf)), mul(Fw, -sf)));
  const hand = [madd(grip, v, -0.055), madd(grip, v, 0.055)];
  const hdir = norm(add(mul(U, 0.85), mul(radial, 0.15)));
  const neck = lerp3(P.neck, P.head, 0.5);
  const avoid = [[head, 0.15], [neck, 0.1], [P.chest, 0.1]];
  for (const i of [0, 1]) {
    const s = i ? 1 : -1;
    const l1 = len(sub(P.elbow[i], P.shoulder[i])), l2 = len(sub(P.wrist[i], P.elbow[i]));
    const out = mul(Lt, s);
    const prefer = norm(add(add(mul(Fw, 0.45 + 0.35 * back), mul(U, -0.8 * front + 0.55 * back - 0.1 * side)), mul(out, 0.45)));
    const r = elbowFor(P.shoulder[i], madd(hand[i], hdir, -0.055), l1, l2, prefer, avoid);
    P.elbow[i] = r.elbow;
    P.wrist[i] = r.wrist;
    P.knuckle[i] = madd(r.wrist, hdir, 0.09);
  }
  // гиря дном вверх: шар над кистями, ручка внизу
  P.kb = { c: madd(grip, U, 0.12), y: mul(U, -1), x: v };
};
// ----- Касания: кисть приходит в нужную точку (на стопу, на локоть, в замок за спиной) -----
// palm — где должна быть середина ладони, dir — куда смотрят пальцы, prefer — куда естественно
// смотрит локоть; голова, шея и корпус — препятствия, сквозь которые рука не проходит
function bodyAvoid(P) {
  const head = madd(P.head, P.hdir, 0.085);
  return [[head, 0.14], [lerp3(P.neck, P.head, 0.5), 0.09], [P.chest, 0.16], [P.spine, 0.15], [madd(P.pelvis, P.up, 0.02), 0.16]];
}
function reachHand(P, i, palm, dir, prefer, avoid) {
  const l1 = len(sub(P.elbow[i], P.shoulder[i])), l2 = len(sub(P.wrist[i], P.elbow[i]));
  const d = norm(dir);
  const r = elbowFor(P.shoulder[i], madd(palm, d, -0.055), l1, l2, norm(prefer), avoid || bodyAvoid(P));
  P.elbow[i] = r.elbow;
  P.wrist[i] = r.wrist;
  P.knuckle[i] = madd(r.wrist, d, 0.09);
}
const outward = (P, i) => mul(P.latC, i ? 1 : -1);
// Передача гири вокруг пояса: гиря идёт по кругу у пояса, переходит из руки в руку спереди и за
// спиной. Рука с гирей несёт её по своей стороне, свободная зеркально идёт по другой стороне
// навстречу следующей передаче — корпус и таз неподвижны
HOOKS.around = (P, f) => {
  const U = P.up, Lt = P.latC, Fw = P.fwd;
  const ph = ((f.phase || 0) % 1) * Math.PI * 2;
  const at = psi => add(add(madd(P.pelvis, U, 0.1), mul(Lt, 0.31 * Math.sin(psi))), mul(Fw, 0.25 * Math.cos(psi)));
  const first = ph <= Math.PI; // пока гиря идёт слева, её несёт левая рука
  const psiL = first ? ph : 2 * Math.PI - ph, psiR = first ? -ph : ph;
  // у передачи (спереди и за спиной) обе руки на ручке
  const pass = Math.max(bellAt(ph, 0), bellAt(ph, Math.PI), bellAt(ph, 2 * Math.PI));
  const grip = at(ph);
  const tang = norm(add(mul(Lt, Math.cos(ph)), mul(Fw, -Math.sin(ph))));
  const handL = lerp3(at(psiL), madd(grip, tang, 0.035), pass), handR = lerp3(at(psiR), madd(grip, tang, -0.035), pass);
  const avoid = bodyAvoid(P);
  for (const i of [0, 1]) {
    const h = i ? handL : handR;
    const prefer = add(add(outward(P, i), mul(Fw, -0.4)), mul(U, -0.3));
    reachHand(P, i, h, mul(U, -1), prefer, avoid);
  }
  P.kb = { c: madd(grip, U, -0.115), y: U, x: tang };
};
const bellAt = (x, c) => Math.exp(-(((x - c) / 0.32) ** 2));
// Растяжка трицепса: ладонь за головой тянется к лопатке, локоть смотрит вверх; другая рука
// поверх головы мягко тянет локоть
HOOKS.tricepsStretch = P => {
  const U = P.up, Fw = P.fwd, avoid = bodyAvoid(P);
  const back = madd(madd(lerp3(P.neck, P.chest, 0.35), Fw, -0.13), outward(P, 1), 0.02);
  reachHand(P, 0, back, add(mul(U, -1), mul(Fw, -0.3)), add(U, mul(Fw, 0.15)), avoid);
  const el = P.elbow[0];
  reachHand(P, 1, madd(madd(el, U, 0.03), Fw, 0.03), add(outward(P, 0), mul(U, 0.2)), add(add(Fw, mul(U, 0.2)), outward(P, 1)), avoid.slice(0, 2));
};
// Растяжка груди с руками за спиной: пальцы в замке за спиной, руки отведены назад
HOOKS.handsBehind = (P, f) => {
  const U = P.up, Fw = P.fwd, avoid = bodyAvoid(P);
  const k = typeof f.k === "number" ? f.k : 0;
  const c = add(add(madd(P.pelvis, Fw, -0.2 - 0.12 * k), mul(U, -0.02 + 0.1 * k)), [0, 0, 0]);
  for (const i of [0, 1]) reachHand(P, i, madd(c, outward(P, i), 0.03), add(mul(U, -0.6), outward(P, 1 - i)), add(add(outward(P, i), mul(Fw, -0.6)), mul(U, -0.2)), avoid);
};
// Растяжка передней поверхности бедра: рука держит стопу у ягодицы, колени рядом, другая рука —
// на стене для равновесия
HOOKS.quadStretch = P => {
  const U = P.up, Fw = P.fwd;
  const instep = madd(lerp3(P.ankle[0], P.toe[0], 0.35), U, 0.01);
  reachHand(P, 0, madd(instep, outward(P, 0), 0.04), add(mul(U, -0.3), Fw), add(add(outward(P, 0), mul(Fw, -0.5)), mul(U, -0.3)));
  // ладонь на стене сбоку (стена — в опорах схемы, на том же расстоянии)
  const wall = madd(madd(P.shoulder[1], outward(P, 1), WALL_SIDE - 0.03), U, -0.22);
  reachHand(P, 1, wall, add(U, mul(Fw, 0.2)), add(outward(P, 1), mul(U, -0.5)));
};
// «Счастливый ребёнок»: колени широко к подмышкам, стопы смотрят в потолок, руки держат стопы
HOOKS.happyBaby = P => {
  for (const i of [0, 1]) turnChain(P, LEG, i, P.hip[i], norm([P.up[0], 0, P.up[2]]).map(x => x * (i ? 1 : -1)), 30 * D);
  for (const i of [0, 1]) {
    const sole = lerp3(P.ankle[i], P.toe[i], 0.45);
    reachHand(P, i, madd(sole, outward(P, i), 0.035), add(P.fwd, mul(outward(P, i), -0.3)), add(outward(P, i), mul(P.fwd, 0.4)));
  }
};
const WALL_SIDE = 0.4;
// Колени к груди: руки обхватывают голени под коленями; «четвёрка»: лодыжка на колене другой ноги
HOOKS.kneesToChest = (P, f, M) => {
  if (M && M.id === "figure4") {
    // опорная нога (левая): бедро к груди, голень горизонтально; правая лодыжка — на её колене
    const kn = P.knee[1], shinOut = norm(sub(P.ankle[1], P.knee[1]));
    const target = madd(madd(kn, shinOut, 0.05), P.fwd, 0.06);
    const l1 = len(sub(P.knee[0], P.hip[0])), l2 = len(sub(P.ankle[0], P.knee[0]));
    const r = elbowFor(P.hip[0], target, l1, l2, add(outward(P, 0), mul(P.fwd, 0.6)), []);
    const fv = sub(P.toe[0], P.ankle[0]);
    P.knee[0] = r.elbow; P.ankle[0] = r.wrist; P.toe[0] = madd(r.wrist, norm(add(outward(P, 1), mul(norm(fv), 0.4))), len(fv));
    // руки держат опорное бедро сзади (со стороны голени)
    const th = lerp3(P.hip[1], P.knee[1], 0.7), td = norm(sub(P.knee[1], P.hip[1]));
    const back = norm(perp(sub(P.ankle[1], P.knee[1]), td));
    for (const i of [0, 1]) reachHand(P, i, madd(madd(th, back, 0.075), outward(P, i), 0.02), add(outward(P, 1 - i), mul(td, -0.3)), add(outward(P, i), mul(P.fwd, 0.5)));
    return;
  }
  for (const i of [0, 1]) {
    const shin = lerp3(P.knee[i], P.ankle[i], 0.28);
    reachHand(P, i, madd(madd(shin, P.fwd, 0.05), outward(P, i), 0.01), add(outward(P, 1 - i), mul(P.fwd, -0.2)), add(outward(P, i), mul(P.fwd, 0.5)));
  }
};
// «Бабочка»: руки держат стопы
{
  const knees = HOOKS.butterfly;
  HOOKS.butterfly = (P, f) => {
    knees(P, f);
    const feet = lerp3(lerp3(P.ankle[0], P.toe[0], 0.5), lerp3(P.ankle[1], P.toe[1], 0.5), 0.5);
    for (const i of [0, 1]) reachHand(P, i, madd(madd(feet, outward(P, i), 0.05), P.up, 0.03), add(mul(P.up, -0.4), P.fwd), add(outward(P, i), mul(P.up, -0.3)));
  };
}
// Растяжка груди в дверном проёме: плечи отведены в стороны, локти чуть ниже плеч, предплечья
// вертикально на косяках
HOOKS.chestStretch = (P, f) => {
  const U = P.up, Fw = P.fwd;
  const k = typeof f.k === "number" ? f.k : 0;
  P._door = [];
  for (const i of [0, 1]) {
    const l1 = len(sub(P.elbow[i], P.shoulder[i])), l2 = len(sub(P.wrist[i], P.elbow[i]));
    const up1 = norm(add(add(outward(P, i), mul(U, -0.18)), mul(Fw, -0.22 - 0.15 * k)));
    P.elbow[i] = madd(P.shoulder[i], up1, l1);
    P.wrist[i] = madd(P.elbow[i], norm(add(U, mul(Fw, -0.1))), l2);
    P.knuckle[i] = madd(P.wrist[i], U, 0.09);
    P._door.push(P.elbow[i]);
  }
};
// «Прокрутка» с лентой: широкий хват, прямые руки идут от бёдер через голову за спину
HOOKS.dislocate = P => {
  for (const i of [0, 1]) {
    const L = len(sub(P.knuckle[i], P.shoulder[i]));
    const d = norm(sub(P.wrist[i], P.shoulder[i]));
    const spread = norm(add(mul(d, Math.cos(42 * D)), mul(outward(P, i), Math.sin(42 * D))));
    const l1 = len(sub(P.elbow[i], P.shoulder[i])), l2 = len(sub(P.wrist[i], P.elbow[i]));
    P.elbow[i] = madd(P.shoulder[i], spread, l1);
    P.wrist[i] = madd(P.elbow[i], spread, l2);
    P.knuckle[i] = madd(P.wrist[i], spread, 0.09);
    void L;
  }
};
const FRONTAL = new Set(["sideLying", "sidePlank", "sidePlankKnee"]);

// ----- Позы костей -----
// Ось сгиба локтя и колена — из самих суставов; у прямой руки или ноги — из исходной позы,
// повёрнутой вслед за костью (без лишнего скручивания)
function swingRef(d0, d1, r0) {
  const c = dot(d0, d1);
  if (c > 0.9999) return r0;
  if (c < -0.9999) return mul(r0, -1);
  const k = norm(cross(d0, d1));
  return rot(r0, k, Math.acos(clamp(c, -1, 1)));
}
function hingeRef(a, b, c, bindDir, bindRef, fallback) {
  const d1 = norm(sub(b, a)), d2 = norm(sub(c, b));
  const n = cross(d1, d2), ln = len(n);
  const fb = norm(perp(fallback || swingRef(bindDir, d1, bindRef), d1));
  const w = smooth(0.03, 0.16, ln);
  if (w <= 0) return fb;
  const nn = mul(n, 1 / ln);
  return norm(add(mul(nn, w), mul(fb, 1 - w)));
}

function poseBones(C, P, palmDown, breath = 0) {
  const F = C.skel.frames, j = C.skel.j;
  const mats = new Float32Array(NB * 16);
  const frames = {};
  const put = (name, head, tail, ref) => {
    const b = F[name];
    const y = norm(sub(tail, head));
    let x = perp(ref, y);
    if (len(x) < 1e-4) x = perp(Math.abs(y[0]) < 0.9 ? X : Z, y);
    x = norm(x);
    const z = cross(x, y);
    const sc = len(sub(tail, head)) / b.L;
    frames[name] = { x, y, z, o: head };
    // M = рамка позы · растяжение вдоль кости · обратная исходная рамка; грудная клетка чуть
    // расширяется на вдохе
    const br = name === "chest" ? 1 + breath : 1;
    const Mpose = m4.frame(mul(x, br), mul(y, sc), mul(z, br), head);
    mats.set(m4.mul(Mpose, C.skel.inv[BI[name]]), BI[name] * 16);
  };
  put("pelvis", P.pelvis, P.spine, P.lat);
  put("spine", P.spine, P.chest, lerp3(P.lat, P.latC, 0.5));
  put("chest", P.chest, P.neck, P.latC);
  put("neck", P.neck, P.head, lerp3(P.latC, P.latH, 0.5));
  put("head", P.head, P.top, P.latH);
  // Хвост волос висит под тяжестью и чуть отстаёт от движения головы (доводка движения)
  {
    const hf = frames.head, hb = F.head, pb = F.pony;
    const toPose = q => { const l = sub(q, hb.o); return add(hf.o, add(add(mul(hf.x, dot(l, hb.x)), mul(hf.y, dot(l, hb.y))), mul(hf.z, dot(l, hb.z)))); };
    const root = toPose(C.skel.j.pony), restTip = toPose(C.skel.j.ponyTip);
    const rest = norm(sub(restTip, root));
    const lag = P.lag ? mul(P.lag, -1) : [0, 0, 0];
    const dir = norm(add(add(mul(rest, 0.45), mul([0, -1, 0], 0.55)), lag));
    put("pony", root, madd(root, dir, pb.L), hf.x);
  }
  for (let i = 0; i < 2; i++) {
    const S = SIDE[i];
    put("clav" + S, P.clav[i], P.shoulder[i], P.up);
    const armFb = (() => {
      // прямая рука: ось сгиба — поперёк корпуса (−x), а у руки, отведённой в сторону, — вверх или вниз
      const d = norm(sub(P.elbow[i], P.shoulder[i]));
      const a = perp(mul(P.latC, -1), d);
      const s = i === 0 ? -1 : 1;
      const b = perp(mul(P.up, -s), d);
      return add(a, mul(b, 1 - smooth(0.2, 0.55, len(a))));
    })();
    const ar = hingeRef(P.shoulder[i], P.elbow[i], P.wrist[i], F["upper" + S].y, [-1, 0, 0], armFb);
    put("upper" + S, P.shoulder[i], P.elbow[i], ar);
    put("fore" + S, P.elbow[i], P.wrist[i], ar);
    // ладонь на полу смотрит вниз: предплечье поворачивается (пронация) — половина поворота
    // приходится на нижнюю половину предплечья, целиком — на кисть
    const fd = norm(sub(P.wrist[i], P.elbow[i]));
    const r0 = norm(perp(ar, fd));
    let tw = 0;
    if (palmDown && palmDown[i]) {
      const s = i === 0 ? -1 : 1;
      const palm = mul(r0, s), want = perp([0, -1, 0], fd);
      if (len(want) > 0.2) tw = clamp(Math.atan2(dot(cross(palm, norm(want)), fd), dot(palm, norm(want))), -1.75, 1.75);
    }
    put("fore2" + S, P.elbow[i], P.wrist[i], rot(r0, fd, tw * 0.5));
    put("hand" + S, P.wrist[i], P.knuckle[i], rot(r0, fd, tw));
    const legFb = perp(P.lat, norm(sub(P.knee[i], P.hip[i])));
    const lr = hingeRef(P.hip[i], P.knee[i], P.ankle[i], F["thigh" + S].y, X, legFb);
    put("thigh" + S, P.hip[i], P.knee[i], lr);
    put("shin" + S, P.knee[i], P.ankle[i], lr);
    put("foot" + S, P.ankle[i], P.toe[i], lr);
  }
  return { mats, frames };
}

// Точки на поверхности тела (в исходной позе) для касания пола: подошвы, ладони, колени,
// локти, ягодицы, спина, грудь, затылок
function contactProbes(j) {
  const pr = [];
  const P = (bone, p) => pr.push({ bone: BI[bone], p });
  for (let i = 0; i < 2; i++) {
    const S = SIDE[i], s = i ? 1 : -1;
    P("foot" + S, [j.heel[i][0], 0.004, j.heel[i][2] + 0.01]);
    P("foot" + S, [j.ball[i][0], 0.002, j.ball[i][2]]);
    P("foot" + S, [j.toe[i][0], 0.006, j.toe[i][2] + 0.012]);
    const palm = lerp3(j.wrist[i], j.knuckle[i], 0.55);
    P("hand" + S, [palm[0] - s * 0.018, palm[1], palm[2]]);
    P("hand" + S, [j.finger[i][0], j.finger[i][1], j.finger[i][2]]);
    P("shin" + S, [j.knee[i][0], j.knee[i][1] - 0.02, j.knee[i][2] + 0.05]);
    P("shin" + S, [j.knee[i][0], j.knee[i][1] - 0.2, j.knee[i][2] + 0.04]);
    P("fore" + S, [j.elbow[i][0], j.elbow[i][1] - 0.01, j.elbow[i][2] - 0.035]);
    P("upper" + S, [j.elbow[i][0] - s * 0.01, j.elbow[i][1] + 0.06, j.elbow[i][2] - 0.04]);
    P("thigh" + S, [j.hip[i][0], 0.86, -0.1]);
  }
  P("pelvis", [0, 0.9, -0.11]);
  P("pelvis", [0, 0.92, 0.1]);
  P("chest", [0, 1.3, -0.105]);
  P("chest", [0, 1.26, 0.13]);
  P("spine", [0, 1.1, -0.095]);
  P("head", [0, 1.68, -0.1]);
  P("head", [0, 1.66, 0.1]);
  P("head", [0, 1.775, -0.01]);
  return pr;
}

// ===== Отрисовка =====
const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec4 aBone; attribute vec4 aWt; attribute vec2 aLook; attribute float aWork;
uniform mat4 uVP; uniform mat4 uView; uniform mat4 uB[${NB}]; uniform vec3 uPal[8]; uniform vec3 uWorkCol; uniform float uWorkAmt;
varying vec3 vN; varying vec3 vC; varying float vY;
void main() {
  mat4 M = uB[int(aBone.x + 0.5)] * aWt.x + uB[int(aBone.y + 0.5)] * aWt.y + uB[int(aBone.z + 0.5)] * aWt.z + uB[int(aBone.w + 0.5)] * aWt.w;
  vec4 wp = M * vec4(aPos, 1.0);
  vN = (uView * vec4((M * vec4(aNor, 0.0)).xyz, 0.0)).xyz;
  vec3 c = uPal[int(aLook.x + 0.5)] * aLook.y;
  float w = clamp(aWork * uWorkAmt, 0.0, 1.0);
  // работающие мышцы: тёплый цвет и лёгкое свечение
  vC = mix(c, uWorkCol, w) + uWorkCol * 0.12 * w;
  vY = wp.y;
  gl_Position = uVP * wp;
}`;
const FS = `
precision mediump float;
varying vec3 vN; varying vec3 vC; varying float vY;
uniform vec3 uRim; uniform float uAmb;
void main() {
  vec3 n = normalize(vN);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L1 = normalize(vec3(0.45, 0.8, 0.7));
  vec3 L2 = normalize(vec3(-0.8, 0.25, 0.4));
  float w1 = max((dot(n, L1) + 0.3) / 1.3, 0.0);
  float w2 = max((dot(n, L2) + 0.35) / 1.35, 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.6);
  vec3 h = normalize(L1 + V);
  float spec = pow(max(dot(n, h), 0.0), 30.0) * 0.1;
  vec3 amb = mix(vec3(0.74, 0.76, 0.82), vec3(1.0), hemi);
  float term = w1 * (1.0 - w1) * 4.0;
  vec3 col = vC * (uAmb * amb + 0.62 * w1 * vec3(1.0, 0.97, 0.93) + 0.2 * w2 * vec3(0.84, 0.9, 1.0)) + vC * vec3(0.05, 0.02, 0.0) * term + uRim * rim * 0.28 + spec;
  // у самого пола чуть темнее — фигура «стоит», а не висит
  col *= 0.84 + 0.16 * smoothstep(0.0, 0.1, vY);
  gl_FragColor = vec4(col, 1.0);
}`;
const PVS = `
attribute vec3 aPos; attribute vec3 aNor;
uniform mat4 uVP; uniform mat4 uView; uniform mat4 uModel;
varying vec3 vN; varying float vY;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  vN = (uView * vec4((uModel * vec4(aNor, 0.0)).xyz, 0.0)).xyz;
  vY = wp.y;
  gl_Position = uVP * wp;
}`;
const PFS = `
precision mediump float;
varying vec3 vN; varying float vY;
uniform vec3 uColor; uniform float uAmb;
void main() {
  vec3 n = normalize(vN);
  vec3 L1 = normalize(vec3(0.45, 0.8, 0.7));
  float w1 = max((dot(n, L1) + 0.3) / 1.3, 0.0);
  float hemi = 0.5 + 0.5 * n.y;
  float spec = pow(max(dot(n, normalize(L1 + vec3(0.0, 0.0, 1.0))), 0.0), 40.0) * 0.18;
  vec3 col = uColor * (uAmb * mix(vec3(0.75), vec3(1.0), hemi) + 0.62 * w1) + spec;
  col *= 0.86 + 0.14 * smoothstep(0.0, 0.08, vY);
  gl_FragColor = vec4(col, 1.0);
}`;
// Пол: мягкое пятно под фигурой и тени от частей тела (отрезки, спроецированные на пол)
const FVS = `
attribute vec2 aXZ;
uniform mat4 uVP;
varying vec2 vXZ;
void main() { vXZ = aXZ; gl_Position = uVP * vec4(aXZ.x, 0.0, aXZ.y, 1.0); }`;
const FFS = `
precision mediump float;
varying vec2 vXZ;
uniform vec4 uSegA[20]; uniform vec3 uSegB[20]; uniform vec4 uDisc; uniform float uFloorA; uniform float uShadowA;
void main() {
  float lit = 1.0;
  for (int i = 0; i < 20; i++) {
    vec2 a = uSegA[i].xy, b = uSegA[i].zw;
    vec2 ab = b - a;
    float t = clamp(dot(vXZ - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = length(vXZ - (a + ab * t));
    float r = uSegB[i].x, s = uSegB[i].y;
    lit *= 1.0 - s * (1.0 - smoothstep(r * 0.35, r, d));
  }
  float disc = 1.0 - smoothstep(0.55, 1.0, length((vXZ - uDisc.xy) / uDisc.zw));
  float a = uFloorA * disc + uShadowA * (1.0 - lit);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a);
}`;

function compile(gl, vs, fs) {
  const make = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader");
    return sh;
  };
  const p = gl.createProgram();
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
  const loc = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < n; i++) { const a = gl.getActiveAttrib(p, i); loc[a.name] = gl.getAttribLocation(p, a.name); }
  const u = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < u; i++) { const a = gl.getActiveUniform(p, i); const name = a.name.replace(/\[0\]$/, ""); loc[name] = gl.getUniformLocation(p, name); }
  return { p, loc };
}

// ----- Снаряды и опоры: простые объёмные формы -----
function meshBuilder() {
  const pos = [], nor = [], idx = [];
  const api = {
    pos, nor, idx,
    // цилиндр вдоль y от y0 до y1 радиусом r (n граней), с крышками
    cyl(r, y0, y1, n = 20, r1 = r) {
      const base = pos.length / 3;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        pos.push(r * c, y0, r * s, r1 * c, y1, r1 * s);
        nor.push(c, 0, s, c, 0, s);
      }
      for (let k = 0; k < n; k++) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      for (const [y, ny, rr] of [[y0, -1, r], [y1, 1, r1]]) {
        const c0 = pos.length / 3;
        pos.push(0, y, 0); nor.push(0, ny, 0);
        for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2; pos.push(rr * Math.cos(a), y, rr * Math.sin(a)); nor.push(0, ny, 0); }
        for (let k = 0; k < n; k++) idx.push(c0, c0 + 1 + k, c0 + 2 + k);
      }
      return api;
    },
    // прямоугольный брусок с центром c и размерами w×h×d
    box(c, w, h, d) {
      const [cx, cy, cz] = c, x = w / 2, y = h / 2, z = d / 2;
      const faces = [[[1, 0, 0], [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]]], [[-1, 0, 0], [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]]],
        [[0, 1, 0], [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]]], [[0, -1, 0], [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]]],
        [[0, 0, 1], [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]]], [[0, 0, -1], [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]]]];
      for (const [n, q] of faces) {
        const b = pos.length / 3;
        for (const p of q) { pos.push(cx + p[0], cy + p[1], cz + p[2]); nor.push(...n); }
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
      return api;
    },
    sphere(c, r, rings = 12, segs = 18, sy = 1) {
      const b = pos.length / 3;
      for (let i = 0; i <= rings; i++) {
        const ph = -Math.PI / 2 + (i / rings) * Math.PI;
        for (let k = 0; k <= segs; k++) {
          const a = (k / segs) * Math.PI * 2;
          const n = [Math.cos(ph) * Math.cos(a), Math.sin(ph), Math.cos(ph) * Math.sin(a)];
          pos.push(c[0] + r * n[0], c[1] + r * sy * n[1], c[2] + r * n[2]);
          nor.push(...norm([n[0], n[1] / sy, n[2]]));
        }
      }
      for (let i = 0; i < rings; i++) for (let k = 0; k < segs; k++) {
        const a = b + i * (segs + 1) + k, c2 = a + segs + 1;
        idx.push(a, c2, a + 1, a + 1, c2, c2 + 1);
      }
      return api;
    },
    // тор в плоскости xy (ручка гири): радиус R, толщина r
    torus(c, R, r, from = 0, to = Math.PI * 2, n = 18, m = 10) {
      const b = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const a = from + (to - from) * (i / n);
        const ca = Math.cos(a), sa = Math.sin(a);
        for (let k = 0; k <= m; k++) {
          const t = (k / m) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
          const nrm = [ca * ct, sa * ct, st];
          pos.push(c[0] + (R + r * ct) * ca, c[1] + (R + r * ct) * sa, c[2] + r * st);
          nor.push(...nrm);
        }
      }
      for (let i = 0; i < n; i++) for (let k = 0; k < m; k++) {
        const a = b + i * (m + 1) + k, c2 = a + m + 1;
        idx.push(a, c2, a + 1, a + 1, c2, c2 + 1);
      }
      return api;
    }
  };
  return api;
}
// Формы в своих координатах: гантель — ручка вдоль y; гиря — шар внизу, ручка сверху
function propShapes() {
  const shapes = {};
  const make = (name, fn) => { const m = meshBuilder(); fn(m); shapes[name] = m; };
  make("dbHandle", m => m.cyl(0.015, -0.075, 0.075, 14));
  make("dbHead", m => m.cyl(0.046, -0.024, 0.024, 6).cyl(0.04, -0.03, 0.03, 6));
  make("kbBody", m => m.sphere([0, 0, 0], 0.075, 12, 18, 0.95).cyl(0.045, -0.085, -0.06, 18));
  make("kbHandle", m => m.torus([0, 0.075, 0], 0.048, 0.011, -0.25, Math.PI + 0.25, 16, 8));
  make("bar", m => m.cyl(0.014, -0.8, 0.8, 14));
  make("plate", m => m.cyl(0.21, -0.022, 0.022, 28));
  make("rod", m => m.cyl(0.012, 0, 1, 10));
  make("band", m => m.cyl(0.008, 0, 1, 8));
  make("cube", m => m.box([0, 0, 0], 1, 1, 1));
  make("mat", m => m.box([0, 0.004, 0], 1, 0.008, 1));
  return shapes;
}

// ----- Общий рендерер -----
let R = null;
function renderer() {
  if (R) return R;
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true }) || canvas.getContext("experimental-webgl");
  if (!gl) throw new Error("WebGL недоступен");
  const skin = compile(gl, VS, FS), prop = compile(gl, PVS, PFS), floor = compile(gl, FVS, FFS);
  const buf = (data, target = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
  const shapes = {};
  for (const [name, m] of Object.entries(propShapes())) {
    shapes[name] = { pos: buf(new Float32Array(m.pos)), nor: buf(new Float32Array(m.nor)), idx: buf(new Uint16Array(m.idx), gl.ELEMENT_ARRAY_BUFFER), count: m.idx.length };
  }
  const quad = buf(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
  R = { canvas, gl, skin, prop, floor, shapes, quad, buf, lost: false };
  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); R.lost = true; });
  canvas.addEventListener("webglcontextrestored", () => { R = null; for (const c of Object.values(CHARS)) c.gpu = null; for (const d of demos) d.work = null; });
  return R;
}
function charGpu(C) {
  if (C.gpu) return C.gpu;
  const { gl, buf } = renderer();
  C.gpu = {
    pos: buf(C.geo.pos), nor: buf(C.geo.nor), bi: buf(C.bi), bw: buf(C.bw), look: buf(C.look),
    idx: buf(C.geo.idx, gl.ELEMENT_ARRAY_BUFFER), count: C.geo.idx.length
  };
  return C.gpu;
}

export function supported() {
  try { renderer(); return true; } catch (e) { return false; }
}
// Подготовить модель заранее (в простое), чтобы первая схема открывалась без задержки
export function warm(sex) { try { character(sex === "f" ? "f" : "m"); } catch (e) { /* модель построится при первой схеме */ } }

// ===== Схема упражнения =====
const demos = new Set();
let raf = 0, clock = 0, lastNow = 0;
const opts = { speed: 1, still: false, sex: "m", palette: null, dark: false, muscles: true };
export function setOptions(o = {}) {
  if (typeof o.speed === "number" && o.speed >= 0.25 && o.speed <= 2) opts.speed = o.speed;
  if (typeof o.still === "boolean") opts.still = o.still;
  if (o.sex === "m" || o.sex === "f") opts.sex = o.sex;
  if (o.palette) opts.palette = o.palette;
  if (typeof o.dark === "boolean") opts.dark = o.dark;
  if (typeof o.muscles === "boolean") opts.muscles = o.muscles;
  for (const d of demos) d.dirty = true;
  kick();
}
const reduced = () => { if (opts.still) return true; try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

// Цвета одежды и кожи берутся из CSS-переменных схем (их задаёт «Персонализация»)
function cssColor(el, name, fb) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  const m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) { const n = parseInt(m[1], 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  const r = v.match(/rgba?\(([^)]+)\)/);
  if (r) { const p = r[1].split(",").map(x => parseFloat(x)); return [p[0] / 255, p[1] / 255, p[2] / 255]; }
  return fb;
}
function paletteOf(el) {
  const lin = c => c.map(x => Math.pow(x, 1.0)); // цвета уже в нужном виде
  return {
    skin: lin(cssColor(el, "--demo-skin", [0.85, 0.67, 0.52])),
    shirt: lin(cssColor(el, "--demo-body", [0.24, 0.55, 0.42])),
    shorts: lin(cssColor(el, "--demo-shorts", [0.2, 0.24, 0.27])),
    shoe: lin(cssColor(el, "--demo-shoe", [0.25, 0.28, 0.3])),
    sole: lin(cssColor(el, "--demo-sole", [0.95, 0.95, 0.94])),
    hair: lin(cssColor(el, "--demo-hair", [0.24, 0.18, 0.14])),
    accent: lin(cssColor(el, "--accent", [0.13, 0.64, 0.29])),
    prop: lin(cssColor(el, "--demo-prop", [0.36, 0.4, 0.44]))
  };
}

// Где кисти держат снаряд: гантели — в каждой руке, гиря или гантель у груди — в обеих
function gripOf(M) {
  if (M.where === "chest" || (M.where === "obj" && M.weight)) return "together";
  return "";
}

// Позы за весь цикл (для рамки кадра и коврика), считаются один раз на схему
function sampledPoses(M, C) {
  const key = C.key;
  M._samples = M._samples || {};
  if (M._samples[key]) return M._samples[key];
  const out = [];
  const N = Math.max(12, M.keys * 6);
  for (let i = 0; i < N; i++) out.push(solvePose(M, C, M.frame((i / N) * M.cycle, false), null).P);
  M._samples[key] = out;
  return out;
}
// Рамка кадра: все положения фигуры за цикл помещаются в кадр, камера не «дышит»
function framing(M, C) {
  const pts = [];
  for (const P of sampledPoses(M, C)) {
    for (const k of ["pelvis", "neck", "top", "head"]) pts.push(P[k]);
    for (const k of ["elbow", "wrist", "knuckle", "knee", "ankle", "toe", "shoulder", "hip"]) pts.push(...P[k]);
  }
  return pts;
}

function cameraFor(M, demo) {
  const C = demo.C;
  if (!demo.pts) demo.pts = framing(M, C);
  const pts = demo.pts.concat(demo.propPts || []);
  // ракурс: профиль → три четверти справа-спереди; анфас → почти спереди, чуть справа
  const az = (demo.az + demo.orbit) * D, el = demo.elev * D;
  const dir = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const right = norm(cross(Y, dir)), up = cross(dir, right);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, cx = 0, cy = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= pts.length; cy /= pts.length; cz /= pts.length;
  const c = [cx, cy, cz];
  for (const p of pts) {
    const q = sub(p, c);
    const a = dot(q, right), b = dot(q, up);
    x0 = Math.min(x0, a); x1 = Math.max(x1, a); y0 = Math.min(y0, b); y1 = Math.max(y1, b);
  }
  // запас на объём тела вокруг суставов и на тень
  x0 -= 0.16; x1 += 0.16; y0 -= 0.1; y1 += 0.16;
  let target = add(c, add(mul(right, (x0 + x1) / 2), mul(up, (y0 + y1) / 2)));
  const fov = 24 * D, aspect = demo.w / demo.h;
  let hh = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / aspect) * 1.04;
  // для проверки: крупный план (zoom) с точкой интереса на высоте focusY
  if (demo.zoom) { hh /= demo.zoom; if (demo.focusY !== undefined) target = [target[0], demo.focusY, target[2]]; }
  const dist = hh / Math.tan(fov / 2) + 0.6;
  const eye = madd(target, dir, dist);
  const view = m4.lookAt(eye, target, Y);
  const proj = m4.persp(fov, aspect, Math.max(0.05, dist - 3), dist + 3);
  return { view, vp: m4.mul(proj, view), eye, target };
}

// Поза в кадре: суставы рисунка → 3D, касания пола, кости
function solvePose(M, C, f, demo) {
  const j = C.skel.j, J = f.J;
  const grip = gripOf(M);
  const P = M.front ? liftFront(J, j, grip, f.Pz) : liftSide(J, j, grip, f.Pz, FRONTAL.has(M.pid));
  if (f.lag) P.lag = f.lag;
  if (HOOKS[M.pid] && f.Pz) HOOKS[M.pid](P, f, M);
  // кисти на полу (упор лёжа, планка, «кошка») — ладонью вниз
  const pron = [0, 1].map(i => J.arms[i].hand[1] < 0.075 && J.arms[i].wrist[1] < 0.12);
  const breath = demo && !reduced() ? 0.012 * Math.sin(demo.t * 2 * Math.PI / 3.6) : 0;
  let { mats, frames } = poseBones(C, P, pron, breath);
  // Высота: самая низкая точка тела там же, где у рисунка (стоя — на полу, в прыжке — в воздухе,
  // на ступеньке — на ступеньке, в висе — на перекладине)
  if (!C.probes) C.probes = contactProbes(j);
  let low = Infinity;
  for (const pr of C.probes) {
    const y = m4.apply(mats.subarray(pr.bone * 16, pr.bone * 16 + 16), pr.p)[1];
    if (y < low) low = y;
  }
  const target = lowest2D(J) * K;
  const dy = M.hang ? 0 : target - low;
  if (dy) {
    for (const key of Object.keys(P)) {
      const v = P[key];
      if (Array.isArray(v) && v.length === 3 && typeof v[0] === "number" && !DIRS.includes(key)) P[key] = [v[0], v[1] + dy, v[2]];
      else if (Array.isArray(v) && Array.isArray(v[0])) P[key] = v.map(q => [q[0], q[1] + dy, q[2]]);
      else if (key === "kb" && v) P.kb = { ...v, c: [v.c[0], v.c[1] + dy, v.c[2]] };
    }
    ({ mats, frames } = poseBones(C, P, pron, breath));
  }
  // Опоры рисунка, которые стоят на полу, касаются пола и у модели: руку или ногу чуть сгибаем
  // или выпрямляем (обратная кинематика), плечо и бедро остаются на месте
  if (!M.hang && fixContacts(C, P, J, mats)) ({ mats, frames } = poseBones(C, P, pron, breath));
  void demo;
  return { P, mats, frames, dy };
}
function ik2(A, Mj, T, pole) {
  const l1 = len(sub(Mj, A)), l2 = len(sub(T, Mj));
  return (target, fallbackPole) => {
    const v = sub(target, A);
    const d = clamp(len(v), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    const dir = norm(v);
    let pl = perp(sub(Mj, A), dir);
    if (len(pl) < 1e-3) pl = perp(fallbackPole || pole, dir);
    pl = norm(pl);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    return { mid: add(madd(A, dir, a), mul(pl, h)), end: madd(A, dir, d) };
  };
}
function fixContacts(C, P, J, mats) {
  const probeY = (bone, p) => m4.apply(mats.subarray(BI[bone] * 16, BI[bone] * 16 + 16), p)[1];
  const j = C.skel.j;
  let changed = false;
  for (let i = 0; i < 2; i++) {
    const S = SIDE[i], s = i ? 1 : -1;
    // ладонь
    const A = J.arms[i];
    if (A.hand[1] < 0.075 && A.wrist[1] < 0.12) {
      const palm = lerp3(j.wrist[i], j.knuckle[i], 0.55);
      const y = probeY("hand" + S, [palm[0] - s * 0.018, palm[1], palm[2]]);
      if (Math.abs(y) > 0.006) {
        const hv = sub(P.knuckle[i], P.wrist[i]);
        const r = ik2(P.shoulder[i], P.elbow[i], P.wrist[i], mul(P.fwd, -1))([P.wrist[i][0], P.wrist[i][1] - y, P.wrist[i][2]]);
        P.elbow[i] = r.mid; P.wrist[i] = r.end; P.knuckle[i] = add(r.end, hv);
        changed = true;
      }
    }
    // стопа
    const L = J.legs[i];
    if (Math.min(L.toe[1], L.heel[1]) - 0.03 < 0.012) {
      const ys = [[j.heel[i][0], 0.004, j.heel[i][2] + 0.01], [j.ball[i][0], 0.002, j.ball[i][2]], [j.toe[i][0], 0.006, j.toe[i][2] + 0.012]].map(q => probeY("foot" + S, q));
      const y = Math.min(...ys);
      if (Math.abs(y) > 0.006) {
        const fv = sub(P.toe[i], P.ankle[i]);
        const r = ik2(P.hip[i], P.knee[i], P.ankle[i], P.fwd)([P.ankle[i][0], P.ankle[i][1] - y, P.ankle[i][2]]);
        P.knee[i] = r.mid; P.ankle[i] = r.end; P.toe[i] = add(r.end, fv);
        changed = true;
      }
    }
  }
  return changed;
}
// Самая низкая точка рисунка с учётом толщины частей тела (как размещает фигуру anim.js)
function lowest2D(J) {
  const pts = [[J.hip, 0.1], [J.sh, 0.1], [J.head, 0.105]];
  for (const L of J.legs) pts.push([L.knee, 0.06], [L.ankle, 0.035], [L.toe, 0.03], [L.heel, 0.03]);
  for (const A of J.arms) pts.push([A.elbow, 0.045], [A.wrist, 0.035], [A.hand, 0.03]);
  let low = Infinity;
  for (const [q, r] of pts) low = Math.min(low, q[1] - r);
  return Math.max(0, low);
}

// Тени: кости как отрезки на полу; чем ближе к полу, тем темнее и чётче
function shadowSegs(P) {
  const segs = [];
  const seg = (a, b, r) => {
    const h = Math.max(0, Math.min(a[1], b[1]));
    const s = 0.55 * (1 - smooth(0.0, 0.6, h));
    if (s < 0.02) return;
    segs.push([a[0], a[2], b[0], b[2], r + h * 0.35, s]);
  };
  seg(P.pelvis, P.neck, 0.17);
  seg(P.head, P.top, 0.11);
  for (let i = 0; i < 2; i++) {
    seg(P.hip[i], P.knee[i], 0.085); seg(P.knee[i], P.ankle[i], 0.065); seg(P.ankle[i], P.toe[i], 0.07);
    seg(P.shoulder[i], P.elbow[i], 0.06); seg(P.elbow[i], P.wrist[i], 0.05); seg(P.wrist[i], P.knuckle[i], 0.05);
  }
  return segs.slice(0, 20);
}

// Опоры и снаряды в мировых координатах для кадра
function propList(M, P, demo, frames) {
  const out = [];
  const pal = demo.pal;
  const metal = [0.32, 0.34, 0.37], dark = [0.2, 0.22, 0.24];
  const place = (shape, model, color) => out.push({ shape, model, color });
  const T = (pos, x, y, z, s = [1, 1, 1]) => m4.frame(mul(x, s[0]), mul(y, s[1]), mul(z, s[2]), pos);
  const handFrame = i => frames["hand" + SIDE[i]];
  const palmC = i => {
    const f = handFrame(i);
    return madd(madd(P.wrist[i], f.y, 0.055), f.z, 0.0);
  };
  const kind = M.weight;
  if (kind === "db" && (M.where === "hands" || M.where === "near" || !M.where)) {
    for (const i of M.where === "near" ? [0] : [0, 1]) {
      const f = handFrame(i), c = palmC(i);
      // ручка гантели — поперёк ладони
      const ax = norm(cross(f.y, f.x));
      const y = ax, x = norm(perp(f.y, y)), z = cross(x, y);
      place("dbHandle", T(c, x, y, z), metal);
      place("dbHead", T(madd(c, y, 0.095), x, y, z), dark);
      place("dbHead", T(madd(c, y, -0.095), x, y, z), dark);
    }
  } else if (kind === "kb" && P.kb) {
    const y = P.kb.y, x = norm(perp(P.kb.x, y)), z = cross(x, y);
    place("kbBody", T(P.kb.c, x, y, z), dark);
    place("kbHandle", T(P.kb.c, x, y, z), dark);
  } else if ((kind === "db" || kind === "kb") && (M.where === "chest" || M.where === "obj")) {
    const c = lerp3(palmC(0), palmC(1), 0.5);
    const up = norm(sub(P.neck, P.pelvis));
    if (kind === "kb") {
      const x = norm(sub(P.wrist[1], P.wrist[0])), y = norm(perp(up, x)), z = cross(x, y);
      place("kbBody", T(madd(c, y, -0.115), x, y, z), dark);
      place("kbHandle", T(madd(c, y, -0.115), x, y, z), dark);
    } else {
      const y = up, x = norm(perp(sub(P.wrist[1], P.wrist[0]), y)), z = cross(x, y);
      place("dbHandle", T(c, x, y, z), metal);
      place("dbHead", T(madd(c, y, 0.095), x, y, z), dark);
      place("dbHead", T(madd(c, y, -0.095), x, y, z), dark);
    }
  } else if (kind === "kb" && M.where === "near") {
    // гиря в одной руке: внизу висит под ладонью, в стойке и над головой лежит на тыльной стороне предплечья
    const f = handFrame(0), c = palmC(0);
    const back = mul(f.x, 1); // правая рука: ладонь смотрит в −x рамки, тыл — в +x
    const rack = smooth(-0.1, 0.4, dot(f.y, Y));
    const dir = norm(lerp3([0, -1, 0], back, rack));
    const y = mul(dir, -1), x = norm(perp(f.z, y)), z = cross(x, y);
    place("kbBody", T(madd(c, dir, 0.1), x, y, z), dark);
    place("kbHandle", T(madd(c, dir, 0.1), x, y, z), dark);
  } else if (kind === "kb" && M.where === "hands") {
    const c = lerp3(palmC(0), palmC(1), 0.5);
    const x = norm(sub(P.wrist[1], P.wrist[0])), y = norm(perp(sub(P.wrist[0], P.elbow[0]), x)), z = cross(x, y);
    place("kbBody", T(madd(c, y, 0.1), x, mul(y, -1), mul(z, -1)), dark);
    place("kbHandle", T(madd(c, y, 0.1), x, mul(y, -1), mul(z, -1)), dark);
  } else if (kind === "bb") {
    let c, x;
    if (M.where === "back") { c = madd(madd(P.neck, norm(sub(P.pelvis, P.neck)), 0.06), P.fwd, -0.075); x = P.latC; }
    else { c = lerp3(palmC(0), palmC(1), 0.5); x = norm(sub(P.wrist[1], P.wrist[0])); }
    const y = x, xx = norm(perp(Y, y)), z = cross(xx, y);
    place("bar", T(c, xx, y, z), metal);
    place("plate", T(madd(c, y, 0.62), xx, y, z), dark);
    place("plate", T(madd(c, y, -0.62), xx, y, z), dark);
  }
  for (const pr of demo.statics) out.push(pr);
  // ленты-эспандеры
  const band = (a, b) => {
    const d = sub(b, a), L = len(d);
    if (L < 1e-3) return;
    const y = mul(d, 1 / L), x = norm(perp(Math.abs(y[1]) < 0.9 ? Y : X, y)), z = cross(x, y);
    place("band", T(a, x, mul(y, L), z), pal.accent);
  };
  for (const p of M.props) {
    if (p === "band2" || p === "bandHands") band(palmC(0), palmC(1));
    else if (p === "bandFeet") for (const i of [0, 1]) band(palmC(i), lerp3(P.ankle[i], P.toe[i], 0.4));
    else if (p === "bandKnees") band(P.knee[0], P.knee[1]);
    else if (p === "strap") for (const i of [0, 1]) band(palmC(i), lerp3(P.ankle[0], P.toe[0], 0.55));
    else if (p === "bandFront" && demo.anchor) for (const i of [0, 1]) band(palmC(i), demo.anchor);
    else if (p === "bandUp" && demo.anchor) for (const i of [0, 1]) band(palmC(i), demo.anchor);
  }
  return out;
}

// Неподвижные опоры (стул, скамья, ступенька, стена, перекладина, коврик) — по ключевой позе
function staticProps(M, C) {
  const out = [], pts = [];
  const color = [0.62, 0.6, 0.57], wood = [0.56, 0.45, 0.35], metal = [0.36, 0.38, 0.41];
  const box = (c, w, h, d, col = color) => {
    out.push({ shape: "cube", model: m4.frame([w, 0, 0], [0, h, 0], [0, 0, d], c), color: col });
    pts.push([c[0] - w / 2, c[1] - h / 2, c[2] - d / 2], [c[0] + w / 2, c[1] + h / 2, c[2] + d / 2]);
  };
  const keyPose = i => solvePose(M, C, { J: M.key(i), Pz: M.keyPz(i) }, null).P;
  const A = keyPose(0), B = keyPose(1);
  const KEYS = Array.from({ length: Math.max(2, M.keys) }, (_, i) => (i === 0 ? A : i === 1 ? B : keyPose(i)));
  let anchor = null;
  const lowBody = Math.min(...KEYS.map(Q => Math.min(Q.pelvis[1], Q.neck[1])));
  for (const p of M.props) {
    if (p === "chairA" || p === "chairB") {
      const Q = p === "chairB" ? B : A;
      const seat = Math.max(0.3, Q.pelvis[1] - 0.115), c = [0, seat, Q.pelvis[2] + 0.08];
      box([c[0], seat - 0.02, c[2]], 0.46, 0.04, 0.44, wood);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box([sx * 0.2, (seat - 0.04) / 2, c[2] + sz * 0.19], 0.03, seat - 0.04, 0.03, wood);
      box([0, seat + 0.24, c[2] - 0.21], 0.46, 0.44, 0.03, wood);
    } else if (p === "chairHands" || p === "tableHands") {
      const h = lerp3(A.wrist[0], A.wrist[1], 0.5), top = Math.max(0.3, Math.min(A.wrist[0][1], A.wrist[1][1]) - 0.04);
      const d = p === "tableHands" ? 0.5 : 0.42, zc = h[2] + (p === "tableHands" ? 0.18 : -0.23);
      box([0, top - 0.02, zc], p === "tableHands" ? 1.0 : 0.5, 0.04, d, wood);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box([sx * (p === "tableHands" ? 0.46 : 0.22), (top - 0.04) / 2, zc + sz * (d / 2 - 0.03)], 0.035, top - 0.04, 0.035, wood);
    } else if (p === "bench") {
      const top = Math.max(0.3, Math.min(A.pelvis[1], A.chest[1]) - 0.13);
      const z0 = Math.min(A.pelvis[2], A.neck[2]) - 0.15, z1 = Math.max(A.pelvis[2], A.neck[2]) + 0.2;
      box([0, top - 0.04, (z0 + z1) / 2], 0.3, 0.08, z1 - z0, [0.24, 0.26, 0.3]);
      for (const z of [z0 + 0.12, z1 - 0.12]) box([0, (top - 0.08) / 2, z], 0.24, top - 0.08, 0.06, metal);
    } else if (p === "step" || p === "stepEdge") {
      // ступенька под опорной ногой (в позе B на ней стоят); край — под носками
      const top = p === "step" ? Math.max(0.12, B.ankle[0][1] - 0.085) : (M.pat.standY || 0.2) * K;
      const zc = p === "step" ? B.ankle[0][2] + 0.03 : A.toe[0][2] - 0.13;
      box([0, top / 2, zc], 0.7, top, p === "step" ? 0.42 : 0.4, [0.5, 0.52, 0.55]);
    } else if (p === "door") {
      // открытая дверь торцом к человеку: держатся за ручки с двух сторон
      const z = Math.max(A.knuckle[0][2], A.knuckle[1][2]) + 0.01;
      box([0, 1.0, z + 0.4], 0.045, 2.0, 0.8, [0.78, 0.74, 0.68]);
    } else if (p === "wallHands" || p === "wallFront") {
      const z = Math.max(A.knuckle[0][2], A.knuckle[1][2]) + 0.03;
      box([0, 1.0, z + 0.03], 1.3, 2.0, 0.06, [0.8, 0.79, 0.76]);
    } else if (p === "wallBack") {
      const z = Math.min(A.pelvis[2], A.neck[2]) - 0.16;
      box([0, 1.0, z - 0.03], 1.6, 2.0, 0.06, [0.8, 0.79, 0.76]);
    } else if (p === "bar") {
      const h = Math.max(A.knuckle[0][1], A.knuckle[1][1]) + 0.01, z = (A.knuckle[0][2] + A.knuckle[1][2]) / 2;
      out.push({ shape: "bar", model: m4.frame([0, -1, 0], [0.75, 0, 0], [0, 0, 1], [0, h, z]), color: metal });
      pts.push([-0.6, h, z], [0.6, h, z]);
    } else if (p === "bandFront") {
      const h = lerp3(A.knuckle[0], A.knuckle[1], 0.5);
      anchor = [0, h[1], h[2] + 0.55];
      box([0, h[1] / 2 + 0.3, anchor[2] + 0.03], 0.08, h[1] + 0.6, 0.06, metal);
    } else if (p === "bandUp") {
      anchor = [0, 2.05, A.neck[2] + 0.3];
      box([0, 2.08, anchor[2]], 0.3, 0.04, 0.3, metal);
    }
  }
  if (M.pid === "quadStretch") {
    // стена сбоку: рука опирается для равновесия
    const x = A.shoulder[1][0] + WALL_SIDE + 0.03;
    box([x, 1.0, A.pelvis[2]], 0.06, 2.0, 1.2, [0.8, 0.79, 0.76]);
  }
  if (M.pid === "chestStretch" && A._door) {
    // дверной проём: предплечья на косяках
    const z = (A.wrist[0][2] + A.wrist[1][2]) / 2 + 0.07;
    for (const i of [0, 1]) box([A.wrist[i][0] + (i ? 0.05 : -0.05), 1.03, z], 0.1, 2.06, 0.14, [0.86, 0.84, 0.8]);
    box([0, 2.08, z], Math.abs(A.wrist[1][0] - A.wrist[0][0]) + 0.2, 0.1, 0.14, [0.86, 0.84, 0.8]);
  }
  // коврик под упражнениями на полу: по всем кадрам цикла, а не только по ключевым позам
  const frames = sampledPoses(M, C);
  const low = Math.min(lowBody, ...frames.map(Q => Math.min(Q.pelvis[1], Q.neck[1])));
  if (low < 0.42 && !M.props.includes("bench")) {
    const near = Q => [Q.pelvis, Q.neck, Q.top, ...Q.ankle, ...Q.toe, ...Q.knee, ...Q.wrist, ...Q.knuckle].filter(q => q[1] < 0.3);
    const all = frames.flatMap(near);
    const xs = all.map(q => q[0]), zs = all.map(q => q[2]);
    const x0 = Math.min(...xs) - 0.16, x1 = Math.max(...xs) + 0.16, z0 = Math.min(...zs) - 0.18, z1 = Math.max(...zs) + 0.18;
    const w = clamp(x1 - x0, 0.62, 1.2), L = clamp(z1 - z0, 0.9, 2.0);
    out.push({ shape: "mat", model: m4.frame([w, 0, 0], [0, 1, 0], [0, 0, L], [(x0 + x1) / 2, 0, (z0 + z1) / 2]), color: null, mat: true });
  }
  return { out, pts, anchor };
}

function kick() { if (!raf && demos.size) raf = requestAnimationFrame(loop); }
function loop(now) {
  raf = 0;
  clock += (lastNow ? Math.min(now - lastNow, 100) : 0) * opts.speed;
  lastNow = now;
  let anyRunning = false;
  for (const d of [...demos]) {
    if (!d.el.isConnected) {
      if (d.seen || now - d.born > 4000) destroy(d);
      continue;
    }
    d.seen = true;
    const running = !d.paused && !reduced();
    if (running) { d.t += (clock - d.lastClock) / 1000; anyRunning = true; }
    d.lastClock = clock;
    // 30 кадров в секунду достаточно для плавного показа и бережёт батарею
    if (d.visible && (d.dirty || (running && now - (d.drawn || 0) >= 32))) { draw(d); d.drawn = now; }
  }
  if (anyRunning || [...demos].some(d => d.dirty && d.visible)) raf = requestAnimationFrame(loop);
  else lastNow = 0;
}
function destroy(d) {
  demos.delete(d);
  if (d.io) d.io.disconnect();
  if (R && d.workBuf) R.gl.deleteBuffer(d.workBuf);
}

function draw(d) {
  let r;
  try { r = renderer(); } catch (e) { return; }
  if (r.lost) return;
  const { gl } = r;
  const rect = d.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
  if (d.canvas.width !== w || d.canvas.height !== h) { d.canvas.width = w; d.canvas.height = h; }
  d.w = w; d.h = h;
  if (r.canvas.width < w || r.canvas.height < h) { r.canvas.width = Math.max(r.canvas.width, w); r.canvas.height = Math.max(r.canvas.height, h); }
  if (!d.pal || d.dirty) d.pal = paletteOf(d.el);
  d.dirty = false;
  const C = character(d.sex);
  const G = charGpu(C);
  if (!d.workBuf) {
    d.workBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, d.workBuf);
    gl.bufferData(gl.ARRAY_BUFFER, workOf(d.id, C.geo), gl.STATIC_DRAW);
  }
  if (!d.statics) {
    const s = staticProps(d.M, C);
    d.statics = s.out; d.propPts = s.pts; d.anchor = s.anchor;
  }
  const still = reduced();
  const f = d.M.frame(still ? 0 : d.t, still);
  // скорость головы (по рисунку) — хвост волос отстаёт от неё
  if (!still && d.sex === "f") {
    const g = d.M.frame(Math.max(0, d.t - 0.08), false).J.head, hN = f.J.head;
    const v = d.M.front ? [(hN[0] - g[0]) * K, (hN[1] - g[1]) * K, 0] : [0, (hN[1] - g[1]) * K, (hN[0] - g[0]) * K];
    f.lag = mul(v, 2.2);
  }
  const pose = solvePose(d.M, C, f, d);
  const cam = cameraFor(d.M, d);
  gl.viewport(0, 0, w, h);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);
  // пол и тени
  {
    const F = r.floor, L = F.loc;
    gl.useProgram(F.p);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const c = [(pose.P.pelvis[0] + pose.P.neck[0]) / 2, (pose.P.pelvis[2] + pose.P.neck[2]) / 2];
    const S = 1.6;
    // вершины пола: xz в [-1, 1] → мир
    const vp = m4.mul(cam.vp, new Float32Array([S, 0, 0, 0, 0, 1, 0, 0, 0, 0, S, 0, c[0], 0, c[1], 1]));
    gl.uniformMatrix4fv(L.uVP, false, vp);
    const segs = shadowSegs(pose.P);
    const A = new Float32Array(80), B = new Float32Array(60);
    segs.forEach((s, i) => {
      A.set([(s[0] - c[0]) / S, (s[1] - c[1]) / S, (s[2] - c[0]) / S, (s[3] - c[1]) / S], i * 4);
      B.set([s[4] / S, s[5], 0], i * 3);
    });
    gl.uniform4fv(L.uSegA, A);
    gl.uniform3fv(L.uSegB, B);
    gl.uniform4fv(L.uDisc, [0, 0, 0.75, 0.75]);
    gl.uniform1f(L.uFloorA, opts.dark ? 0.16 : 0.07);
    gl.uniform1f(L.uShadowA, opts.dark ? 0.5 : 0.32);
    gl.bindBuffer(gl.ARRAY_BUFFER, r.quad);
    gl.enableVertexAttribArray(L.aXZ);
    gl.vertexAttribPointer(L.aXZ, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(L.aXZ);
    gl.disable(gl.BLEND);
  }
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  // снаряды и опоры
  {
    const Pp = r.prop, L = Pp.loc;
    gl.useProgram(Pp.p);
    gl.uniformMatrix4fv(L.uVP, false, cam.vp);
    gl.uniformMatrix4fv(L.uView, false, cam.view);
    gl.uniform1f(L.uAmb, opts.dark ? 0.32 : 0.42);
    gl.disable(gl.CULL_FACE);
    for (const pr of propList(d.M, pose.P, d, pose.frames)) {
      const sh = r.shapes[pr.shape];
      gl.uniformMatrix4fv(L.uModel, false, pr.model);
      const col = pr.mat ? mixc(d.pal.accent, [0.5, 0.5, 0.5], 0.55) : pr.color;
      gl.uniform3fv(L.uColor, col);
      gl.bindBuffer(gl.ARRAY_BUFFER, sh.pos);
      gl.enableVertexAttribArray(L.aPos);
      gl.vertexAttribPointer(L.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, sh.nor);
      gl.enableVertexAttribArray(L.aNor);
      gl.vertexAttribPointer(L.aNor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sh.idx);
      gl.drawElements(gl.TRIANGLES, sh.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.disableVertexAttribArray(L.aPos);
    gl.disableVertexAttribArray(L.aNor);
  }
  // фигура
  {
    const S = r.skin, L = S.loc;
    gl.useProgram(S.p);
    gl.uniformMatrix4fv(L.uVP, false, cam.vp);
    gl.uniformMatrix4fv(L.uView, false, cam.view);
    gl.uniformMatrix4fv(L.uB, false, pose.mats);
    const pal = d.pal;
    const P8 = new Float32Array(24);
    [pal.skin, pal.shirt, pal.shorts, pal.shoe, pal.sole, pal.hair, pal.accent, [0.93, 0.93, 0.92]].forEach((c, i) => P8.set(c, i * 3));
    gl.uniform3fv(L.uPal, P8);
    gl.uniform3fv(L.uWorkCol, [0.95, 0.3, 0.2]);
    // подсветка усиливается в рабочей фазе движения
    const effort = typeof f.k === "number" ? f.k : 0.5;
    gl.uniform1f(L.uWorkAmt, opts.muscles ? 0.42 + 0.22 * effort : 0);
    gl.uniform3fv(L.uRim, pal.accent);
    gl.uniform1f(L.uAmb, opts.dark ? 0.34 : 0.42);
    const attr = (buf, loc, size) => { if (loc === undefined || loc < 0) return; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
    attr(G.pos, L.aPos, 3); attr(G.nor, L.aNor, 3); attr(G.bi, L.aBone, 4); attr(G.bw, L.aWt, 4); attr(G.look, L.aLook, 2); attr(d.workBuf, L.aWork, 1);
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, G.idx);
    gl.drawElements(gl.TRIANGLES, G.count, gl.UNSIGNED_SHORT, 0);
    for (const k of ["aPos", "aNor", "aBone", "aWt", "aLook", "aWork"]) if (L[k] !== undefined && L[k] >= 0) gl.disableVertexAttribArray(L[k]);
  }
  // копия кадра в холст схемы
  const ctx = d.ctx || (d.ctx = d.canvas.getContext("2d"));
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(r.canvas, 0, r.canvas.height - h, w, h, 0, 0, w, h);
}
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Создать схему: элемент с холстом, кнопкой паузы и поворотом фигуры пальцем
export function createDemo(id, { label, paused = false, sex } = {}) {
  const M = motionOf(id);
  const el = document.createElement("div");
  el.className = "demo3d";
  const canvas = document.createElement("canvas");
  canvas.className = "demo3d-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", label || `Объёмная схема движения: ${(EX[id] || { name: "" }).name}`);
  el.append(canvas);
  const side = !M.front;
  const d = {
    id, M, el, canvas, sex: sex || opts.sex, C: null, t: 0, lastClock: clock, born: performance.now(), seen: false,
    paused, visible: true, dirty: true, az: side ? -62 : -20, elev: side ? 9 : 7, orbit: 0, showWork: true, statics: null
  };
  // лёжа на полу — камера чуть выше, чтобы фигура не пряталась за собой; лёжа на боку — со стороны
  // живота; стена или дверь перед человеком — сбоку и чуть сзади, чтобы стена не закрывала фигуру
  d.C = character(d.sex);
  const probe = solvePose(M, d.C, { J: M.key(0), Pz: M.keyPz(0) }, null).P;
  if (Math.min(probe.pelvis[1], probe.neck[1]) < 0.45) d.elev = 20;
  if (FRONTAL.has(M.pid) || M.pid === "openBook") d.az = 58;
  if (M.props.some(p => p === "wallHands" || p === "wallFront" || p === "door")) d.az = -108;
  // пауза: движение дольше 5 секунд рядом с текстом должно останавливаться (WCAG 2.2.2)
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "demo3d-btn";
  const sync = () => {
    btn.setAttribute("aria-label", d.paused ? "Продолжить показ движения" : "Остановить показ движения");
    btn.setAttribute("aria-pressed", String(d.paused));
    btn.classList.toggle("is-paused", d.paused);
  };
  btn.addEventListener("click", () => { d.paused = !d.paused; sync(); d.dirty = true; kick(); });
  sync();
  // ракурс: три четверти → сбоку → спереди → сзади (видео с нескольких сторон помогает понять технику)
  const views = [d.az, -90, 0, 180];
  let vi = 0;
  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
  viewBtn.className = "demo3d-btn demo3d-view";
  viewBtn.setAttribute("aria-label", "Показать с другой стороны");
  const turnTo = target => {
    const from = d.orbit, to = target - d.az;
    const delta = ((to - from + 540) % 360) - 180;
    if (reduced()) { d.orbit = from + delta; d.dirty = true; kick(); return; }
    const t0 = performance.now();
    const step = now => {
      const k = Math.min(1, (now - t0) / 450), e = 1 - Math.pow(1 - k, 3);
      d.orbit = from + delta * e;
      d.dirty = true;
      kick();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  viewBtn.addEventListener("click", () => { vi = (vi + 1) % views.length; turnTo(views[vi]); });
  el.append(btn, viewBtn);
  // с клавиатуры: стрелки влево-вправо поворачивают фигуру
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    d.orbit += e.key === "ArrowLeft" ? -20 : 20;
    d.dirty = true;
    kick();
  });
  // поворот камеры пальцем: тянуть вбок — фигура поворачивается; двойное касание — исходный вид
  let drag = null;
  canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, o: d.orbit, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    drag.moved = Math.max(drag.moved, Math.abs(dx));
    d.orbit = drag.o + dx * 0.6;
    d.dirty = true;
    kick();
  });
  const end = () => { drag = null; };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("dblclick", () => { d.orbit = 0; d.dirty = true; kick(); });
  if ("IntersectionObserver" in window) {
    d.io = new IntersectionObserver(es => { for (const en of es) d.visible = en.isIntersecting; if (d.visible) { d.dirty = true; kick(); } });
    d.io.observe(canvas);
  }
  demos.add(d);
  kick();
  // для проверки: кадр в заданное время и смена ракурса
  el.lpFrame = t => { d.t = t; d.dirty = true; draw(d); };
  el.lpPeriod = M.cycle;
  el.lpView = (az, elv) => { if (typeof az === "number") d.orbit = az - d.az; if (typeof elv === "number") d.elev = elv; d.dirty = true; };
  el.lpDemo = d;
  el.lpZoom = (k, y) => { d.zoom = k; d.focusY = y; d.dirty = true; };
  return el;
}
