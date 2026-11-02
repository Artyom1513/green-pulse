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
// Поверхность вращения вокруг оси a→d; profile — кольца { t, rx, rz } вдоль оси
function revolve(mesh, { a, d, profile, segs = 20, power = 2, classify }) {
  d = norm(d);
  const ref = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const e1 = norm(cross(d, ref));
  const e2 = cross(e1, d);
  const rings = profile.length;
  const base = mesh.count;
  const pts = [];
  for (let i = 0; i < rings; i++) {
    const { t, rx, rz } = profile[i];
    for (let j = 0; j <= segs; j++) {
      const ang = (j / segs) * Math.PI * 2;
      const c = Math.cos(ang), s = Math.sin(ang);
      const ce = Math.sign(c) * Math.pow(Math.abs(c), 2 / power);
      const se = Math.sign(s) * Math.pow(Math.abs(s), 2 / power);
      pts.push(add(add(add(a, scale(d, t)), scale(e1, rx * ce)), scale(e2, rz * se)));
    }
  }
  const L = profile[rings - 1].t - profile[0].t || 1;
  for (let i = 0; i < rings; i++) {
    const axisPt = add(a, scale(d, profile[i].t));
    for (let j = 0; j <= segs; j++) {
      const p = pts[i * (segs + 1) + j];
      const jj = j % segs;
      const pR = pts[i * (segs + 1) + ((jj + 1) % segs)], pL = pts[i * (segs + 1) + ((jj - 1 + segs) % segs)];
      const pU = pts[Math.min(i + 1, rings - 1) * (segs + 1) + j], pD = pts[Math.max(i - 1, 0) * (segs + 1) + j];
      let n = cross(sub(pR, pL), sub(pU, pD));
      const radial = sub(p, axisPt);
      if (profile[i].rx < 1e-4 || len(n) < 1e-10) n = i === 0 ? scale(d, -1) : i === rings - 1 ? d : radial;
      else if (dot(n, radial) < 0) n = scale(n, -1);
      n = norm(n);
      const [region, side] = classify(p, n, (profile[i].t - profile[0].t) / L);
      mesh.push(p, n, region, side);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const v = base + i * (segs + 1) + j, w = v + segs + 1;
      mesh.idx.push(v, w, v + 1, v + 1, w, w + 1);
    }
  }
}

function capsuleProfile(L, ra, rb, sx = 1, sz = 1, cap = 6, body = 14) {
  const prof = [];
  for (let k = 0; k <= cap; k++) {
    const phi = -Math.PI / 2 + (k / cap) * (Math.PI / 2);
    prof.push({ t: ra * Math.sin(phi), rx: ra * Math.cos(phi) * sx, rz: ra * Math.cos(phi) * sz });
  }
  for (let k = 1; k < body; k++) {
    const u = k / body, r = ra + (rb - ra) * u;
    prof.push({ t: L * u, rx: r * sx, rz: r * sz });
  }
  for (let k = 0; k <= cap; k++) {
    const phi = (k / cap) * (Math.PI / 2);
    prof.push({ t: L + rb * Math.sin(phi), rx: rb * Math.cos(phi) * sx, rz: rb * Math.cos(phi) * sz });
  }
  return prof;
}
function ellipsoidProfile(rx, ry, rz, rings = 14) {
  const prof = [];
  for (let k = 0; k <= rings; k++) {
    const phi = -Math.PI / 2 + (k / rings) * Math.PI;
    prof.push({ t: ry * Math.sin(phi), rx: rx * Math.cos(phi), rz: rz * Math.cos(phi) });
  }
  return prof;
}

// Сборка фигуры. regionIndex(id) → номер зоны (1…), сторона: 0 — центр, 1 — правая, 2 — левая
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
  const up = [0, 1, 0];

  // Голова, нос, уши
  revolve(mesh, { a: [0, 1.655, 0.004], d: up, profile: ellipsoidProfile(0.085, 0.108, 0.097, 16), segs: 28, classify: () => C("head") });
  revolve(mesh, { a: [0, 1.646, 0.096], d: up, profile: ellipsoidProfile(0.015, 0.024, 0.018, 8), segs: 14, classify: () => C("head") });
  for (const s of [-1, 1]) revolve(mesh, { a: [s * 0.086, 1.652, 0], d: up, profile: ellipsoidProfile(0.012, 0.026, 0.018, 8), segs: 12, classify: () => C("head") });
  // Шея
  revolve(mesh, { a: [0, 1.465, -0.008], d: [0, 1, 0.04], profile: capsuleProfile(0.1, 0.058, 0.05), segs: 22, classify: () => C("neck") });

  // Туловище: кольца по высоте
  const torso = [
    [0.840, 0.02, 0.02, 0], [0.855, 0.11, 0.08, 0], [0.88, 0.15, 0.10, 0], [0.93, 0.163, 0.105, 0],
    [0.99, 0.157, 0.10, 0], [1.05, 0.143, 0.095, 0], [1.11, 0.137, 0.095, 0], [1.17, 0.145, 0.10, 0.005],
    [1.24, 0.162, 0.108, 0.01], [1.31, 0.176, 0.112, 0.012], [1.37, 0.183, 0.108, 0.01], [1.415, 0.175, 0.098, 0.005],
    [1.445, 0.145, 0.08, 0], [1.47, 0.085, 0.06, 0], [1.485, 0.02, 0.02, 0]
  ];
  // Кольца сглаживаются сплайном Катмулла — Рома: силуэт ровнее, а отмеченные пятна — круглее
  const dense = [];
  for (let i = 0; i < torso.length - 1; i++) {
    const p0 = torso[Math.max(i - 1, 0)], p1 = torso[i], p2 = torso[i + 1], p3 = torso[Math.min(i + 2, torso.length - 1)];
    for (let k = 0; k < 3; k++) {
      const t = k / 3, t2 = t * t, t3 = t2 * t;
      dense.push(p1.map((_, j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  dense.push(torso[torso.length - 1]);
  // Смещение по глубине для кольца задаём сдвигом его вершин после построения
  const torsoProfile = dense.map(([y, rx, rz]) => ({ t: y - 0.84, rx: Math.max(rx, 0.001), rz: Math.max(rz, 0.001) }));
  const torsoZ = dense.map(r => r[3]);
  const before = mesh.count;
  revolve(mesh, {
    a: [0, 0.84, 0], d: up, profile: torsoProfile, segs: 36, power: 2.5,
    classify: p => {
      const ax = Math.abs(p[0]), y = p[1], z = p[2];
      if (y > 1.36 && ax > 0.115) return R("shoulder", p);
      if (y < 1.0 && ax > 0.148) return R("hip", p);
      if (y >= 1.18) return C(z >= 0 ? "chest" : "upperBack");
      if (y >= 1.0) return C(z >= 0 ? "abdomen" : "lowerBack");
      if (z >= 0) return ax > 0.045 ? R("groin", p) : C("abdomen");
      return ax < 0.05 ? C("pelvis") : R("glute", p);
    }
  });
  // Сдвиг колец туловища вперёд на уровне груди
  for (let v = before, ring = 0; v < mesh.count; v++) {
    ring = Math.floor((v - before) / 37);
    pos[v * 3 + 2] += torsoZ[ring];
  }

  for (const s of [-1, 1]) {
    const X = x => x * s;
    // Ягодицы
    revolve(mesh, {
      a: [X(0.07), 0.915, -0.045], d: up, profile: ellipsoidProfile(0.082, 0.09, 0.058, 12), segs: 20,
      classify: p => (Math.abs(p[0]) > 0.142 ? R("hip", p) : R("glute", p))
    });
    // Дельты
    revolve(mesh, { a: [X(0.188), 1.392, 0], d: up, profile: ellipsoidProfile(0.062, 0.07, 0.064, 12), segs: 20, classify: p => R("shoulder", p) });
    // Плечо, предплечье, кисть
    const ua = [X(0.2), 1.36, 0], ub = [X(0.232), 1.11, 0];
    revolve(mesh, {
      a: ua, d: sub(ub, ua), profile: capsuleProfile(len(sub(ub, ua)), 0.051, 0.042), segs: 20,
      classify: (p, n, u) => R(u < 0.14 ? "shoulder" : u > 0.86 ? "elbow" : "upperArm", p)
    });
    const fa = [X(0.234), 1.1, 0.004], fb = [X(0.256), 0.872, 0.022];
    revolve(mesh, {
      a: fa, d: sub(fb, fa), profile: capsuleProfile(len(sub(fb, fa)), 0.042, 0.03), segs: 20,
      classify: (p, n, u) => R(u < 0.13 ? "elbow" : u > 0.9 ? "wrist" : "forearm", p)
    });
    revolve(mesh, {
      a: [X(0.262), 0.8, 0.03], d: up, profile: ellipsoidProfile(0.022, 0.068, 0.04, 12), segs: 16,
      classify: p => R(p[1] > 0.852 ? "wrist" : "hand", p)
    });
    // Бедро
    const ta = [X(0.09), 0.93, 0], tb = [X(0.098), 0.53, 0.012];
    revolve(mesh, {
      a: ta, d: sub(tb, ta), profile: capsuleProfile(len(sub(tb, ta)), 0.088, 0.058), segs: 24,
      classify: (p, n, u) => {
        if (u < 0.13) return p[2] < -0.02 ? R("glute", p) : Math.abs(p[0]) < 0.07 ? R("groin", p) : R("hip", p);
        if (u < 0.26 && Math.abs(p[0]) < 0.062 && p[2] > -0.03) return R("groin", p);
        if (u > 0.9) return R("knee", p);
        return R(p[2] >= 0.005 ? "thighFront" : "hamstring", p);
      }
    });
    // Надколенник
    revolve(mesh, { a: [X(0.1), 0.505, 0.05], d: up, profile: ellipsoidProfile(0.038, 0.044, 0.028, 10), segs: 16, classify: p => R("knee", p) });
    // Голень, икра, лодыжка, стопа
    const sa = [X(0.099), 0.5, 0.008], sb = [X(0.1), 0.1, -0.004];
    revolve(mesh, {
      a: sa, d: sub(sb, sa), profile: capsuleProfile(len(sub(sb, sa)), 0.054, 0.034), segs: 22,
      classify: (p, n, u) => {
        if (u < 0.1) return R("knee", p);
        if (u > 0.92) return R(p[2] < -0.01 ? "achilles" : "ankle", p);
        return R(p[2] >= -0.012 ? "shin" : "calf", p);
      }
    });
    revolve(mesh, {
      a: [X(0.1), 0.36, -0.028], d: up, profile: ellipsoidProfile(0.047, 0.09, 0.043, 12), segs: 18,
      classify: p => R(p[1] < 0.29 && p[2] < -0.03 ? "achilles" : "calf", p)
    });
    revolve(mesh, { a: [X(0.1), 0.085, 0], d: up, profile: ellipsoidProfile(0.038, 0.038, 0.038, 10), segs: 16, classify: p => R(p[2] < -0.018 ? "achilles" : "ankle", p) });
    revolve(mesh, { a: [X(0.1), 0.04, 0.05], d: up, profile: ellipsoidProfile(0.042, 0.037, 0.108, 12), segs: 20, classify: p => R("foot", p) });
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
void main() { gl_FragColor = vec4(vId / 255.0, 0.0, 1.0); }`;

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
  const ids = new Float32Array(vertexCount * 2);
  for (let v = 0; v < vertexCount; v++) {
    ids[v * 2] = geo.reg[v];
    ids[v * 2 + 1] = geo.sid[v];
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
      pos: buffer(geo.pos), nor: buffer(geo.nor), col: buffer(colors, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW), ids: buffer(ids),
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
    bindAttr(glState.pos, L.pPos, 3);
    bindAttr(glState.ids, L.pId, 2);
    gl.uniformMatrix4fv(L.pMVP, false, mvp);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, glState.idx);
    gl.drawElements(gl.TRIANGLES, geo.idx.length, gl.UNSIGNED_SHORT, 0);
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
    vertexCount
  };
}
