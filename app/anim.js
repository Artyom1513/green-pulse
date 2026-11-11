// ===== Листопульс: анимация техники упражнений =====
// Схематичный человечек в профиль или анфас: позы задаются углами суставов, между ключевыми
// позами движение плавно интерполируется. Всё рисуется в SVG на устройстве, без видео и сети.
import { s } from "./ui.js";
import { EX } from "./data.js";

const D = Math.PI / 180;
const LEN = { thigh: 0.44, shank: 0.43, foot: 0.19, heel: 0.05, torso: 0.53, neck: 0.08, head: 0.105, upper: 0.3, fore: 0.27, hand: 0.075 };
const down = a => [Math.sin(a * D), -Math.cos(a * D)]; // 0° — вниз, 90° — вперёд, 180° — вверх
const upv = a => [Math.sin(a * D), Math.cos(a * D)]; // 0° — вверх, 90° — вперёд
const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];

// ----- Позы -----
const leg = (h = 0, k = 0, f = 90, fy = 0) => (fy ? { h, k, f, fy } : { h, k, f });
const arm = (sA = 0, e = 0, w = 0) => ({ s: sA, e, w });
const pose = (o = {}) => ({ t: 0, n: 0, sh: 0, air: 0, lift: 0, legs: [leg(), leg()], arms: [arm(6, 12), arm(-4, 12)], ...o });
// lift — подъём стопы к зрителю (колено сгибается вперёд, а не вбок)
const fleg = (h = 4, k = 0, lift = 0, ft = 0, fs = 0) => ({ h, k, lift, ...(ft ? { ft } : {}), ...(fs ? { fs } : {}) });
const farm = (sA = 10, e = 6, fw = 0) => (fw ? { s: sA, e, fw } : { s: sA, e });
const fpose = (o = {}) => ({ front: true, t: 0, n: 0, air: 0, lift: 0, legs: [fleg(), fleg()], arms: [farm(), farm()], ...o });

const STAND = pose();
const SUPINE_KNEES = [leg(130, 95, 90), leg(130, 95, 90)];
const SUPINE = (o = {}) => pose({ t: -90, legs: SUPINE_KNEES, arms: [arm(90, 0), arm(90, 0)], ...o });
// Мост: таз поднят, плечи и стопы на тех же местах, что лёжа; голова лежит на полу (n = −(t + 90))
const BRIDGE_UP = [leg(97.5, 68.3), leg(97.5, 68.3)];
const BRIDGE = (o = {}) => SUPINE({ t: -118, n: 28, legs: BRIDGE_UP, ...o });
const KNEEL = [leg(0, 87, -88), leg(0, 87, -88)]; // голень и подъём стопы лежат на полу
const QUAD = (o = {}) => pose({ t: 71, legs: KNEEL, arms: [arm(0, 0), arm(0, 0)], ...o });
const PLANK_HIGH = pose({ t: 71, legs: [leg(-71, 0, -5), leg(-71, 0, -5)], arms: [arm(3, 0), arm(3, 0)] });
const SEATED = (o = {}) => pose({ t: -2, legs: [leg(90, 90), leg(90, 90)], arms: [arm(25, 70), arm(25, 70)], ...o });
const HINGE = (o = {}) => pose({ t: 70, legs: [leg(18, 24), leg(18, 24)], arms: [arm(0, 0), arm(0, 0)], ...o });
const SQUAT_LOW = (o = {}) => pose({ t: 38, legs: [leg(95, 115), leg(95, 115)], arms: [arm(88, 0), arm(88, 0)], ...o });
const LUNGE_LOW = (o = {}) => pose({ t: 3, legs: [leg(80, 85), leg(-10, 96, 2)], arms: [arm(4, 6), arm(-4, 6)], ...o });
const HANDS_HIPS = [arm(-15, 100), arm(-15, 100)];
const BALANCE = (o = {}) => pose({ legs: [leg(0, 0), leg(25, 70, 70)], arms: [arm(30, 10), arm(30, 10)], ...o });

// Узоры движений: a и b — ключевые позы, alt — чередование сторон, p — период в секундах,
// anchor — что стоит на месте, w — где вес (руки, грудь, таз, спина), props — опоры
const P = {
  stand: { a: STAND },
  march: { a: STAND, b: pose({ legs: [leg(62, 85), leg(-4, 6)], arms: [arm(-28, 30), arm(38, 40)] }), alt: true, p: 1.4, w: "hands" },
  toeWalk: { a: pose({ legs: [leg(0, 0, 55), leg(0, 0, 55)] }), b: pose({ legs: [leg(35, 45, 55), leg(-8, 6, 55)], arms: [arm(-20, 20), arm(25, 30)] }), alt: true, p: 1.4 },
  heelWalk: { a: pose({ legs: [leg(0, 0, 116), leg(0, 0, 116)] }), b: pose({ legs: [leg(30, 20, 125), leg(-8, 0, 110)], arms: [arm(-20, 20), arm(25, 30)] }), alt: true, p: 1.4 },
  highKnees: { a: STAND, b: pose({ legs: [leg(88, 100), leg(0, 5)], arms: [arm(-35, 80), arm(55, 85)] }), alt: true, p: 1.1 },
  jog: { a: pose({ arms: [arm(-10, 90), arm(10, 90)] }), b: pose({ air: 0.04, legs: [leg(42, 95, 27), leg(-18, 35, 12)], arms: [arm(-35, 90), arm(35, 90)] }), alt: true, p: 0.9 },
  heelKicks: { a: STAND, b: pose({ legs: [leg(-6, 125, -40), leg(0, 0)], arms: [arm(20, 70), arm(-20, 70)] }), m: pose({ legs: [leg(-2, 45, 44), leg(0, 0)], arms: [arm(10, 40), arm(-10, 40)] }), alt: true, p: 1.1 },
  sway: { a: pose({ t: -3, arms: HANDS_HIPS }), b: pose({ t: 5, arms: HANDS_HIPS }), p: 2.4 },
  neckNod: { a: pose({ n: -12 }), b: pose({ n: 32 }), p: 3 },
  handsForward: { a: pose({ arms: [arm(55, 35, -35), arm(55, 35, -35)] }), b: pose({ arms: [arm(55, 35, 35), arm(55, 35, 35)] }), p: 1.8 },
  legSwings: { a: pose({ legs: [leg(-32, 8, 35), leg(0, 0)], arms: [arm(10, 10), arm(70, 10)] }), b: pose({ legs: [leg(55, 5, 120), leg(0, 0)], arms: [arm(10, 10), arm(70, 10)] }), p: 1.6, anchor: "far" },
  inchworm: { a: pose({ t: 108, legs: [leg(-8, 0), leg(-8, 0)], arms: [arm(6, 0), arm(6, 0)] }), b: PLANK_HIGH, p: 3, anchor: "toes" },
  hinge: { a: pose({ arms: [arm(2, 0), arm(2, 0)] }), b: HINGE(), p: 2.8, w: "hands" },
  dislocate: { a: pose({ arms: [arm(60, 0), arm(60, 0)] }), b: pose({ arms: [arm(200, 0), arm(200, 0)] }), p: 2.6, props: ["band2"] },
  squat: { a: pose({ arms: [arm(8, 10), arm(8, 10)] }), b: SQUAT_LOW(), p: 2.6, w: "back" },
  chairSquat: { a: pose({ arms: [arm(30, 10), arm(30, 10)] }), b: pose({ t: 28, legs: [leg(85, 90), leg(85, 90)], arms: [arm(85, 0), arm(85, 0)] }), p: 2.6, props: ["chairB"] },
  goblet: { a: pose({ arms: [arm(25, 135), arm(25, 135)] }), b: SQUAT_LOW({ arms: [arm(30, 130), arm(30, 130)] }), p: 2.6, w: "chest" },
  bridge: { a: SUPINE(), b: BRIDGE(), p: 2.6, anchor: "shoulder", w: "hip" },
  singleBridge: { a: SUPINE({ legs: [leg(130, 95), leg(150, 15, 160)] }), b: BRIDGE({ legs: [BRIDGE_UP[0], leg(118, 0, 120)] }), p: 2.6, anchor: "shoulder" },
  bridgeMarch: { a: BRIDGE(), b: BRIDGE({ legs: [leg(160, 110, 150), BRIDGE_UP[1]] }), alt: true, p: 1.8, anchor: "shoulder" },
  bridgeHold: { a: BRIDGE(), anchor: "shoulder" },
  lunge: { a: pose({ legs: [leg(33.7, 10), leg(-36.7, 14, 45)] }), b: LUNGE_LOW(), p: 2.6, w: "hands", anchor: "toes" },
  splitHold: { a: LUNGE_LOW({ legs: [leg(60, 60), leg(-12, 73, 15)] }) },
  stepUp: { a: pose({ legs: [leg(60, 70), leg(0, 0)] }), b: pose({ lift: 0.24, legs: [leg(0, 0), leg(35, 70, 60)] }), p: 2.6, props: ["step"], w: "hands" },
  deadlift: { a: pose({ t: 62, legs: [leg(60, 80), leg(60, 80)], arms: [arm(0, 0), arm(0, 0)] }), b: pose({ arms: [arm(0, 0), arm(0, 0)] }), p: 2.8, w: "hands" },
  swing: { a: pose({ t: 62, legs: [leg(25, 32), leg(25, 32)], arms: [arm(-32, 0), arm(-32, 0)] }), b: pose({ t: -4, arms: [arm(86, 0), arm(86, 0)] }), p: 1.6, w: "hands" },
  calfRaise: { a: STAND, b: pose({ legs: [leg(0, 0, 50), leg(0, 0, 50)] }), p: 2, w: "hands", anchor: "toes" },
  calfHold: { a: pose({ legs: [leg(0, 0, 60), leg(0, 0, 60)] }), anchor: "toes" },
  wallSit: { a: pose({ legs: [leg(90, 90), leg(90, 90)], arms: [arm(6, 8), arm(6, 8)] }), props: ["wallBack"] },
  wallSitShort: { a: pose({ legs: [leg(40, 45), leg(40, 45)], arms: [arm(6, 8), arm(6, 8)] }), props: ["wallBack"] },
  squatHold: { a: pose({ t: 22, legs: [leg(55, 70), leg(55, 70)], arms: [arm(88, 0), arm(88, 0)] }) },
  squatJump: { a: SQUAT_LOW({ arms: [arm(-35, 0), arm(-35, 0)] }), b: pose({ air: 0.18, legs: [leg(0, 0, 40), leg(0, 0, 40)], arms: [arm(160, 0), arm(160, 0)] }), p: 1.6 },
  singleHinge: { a: pose({ legs: [leg(0, 0), leg(-10, 15, 80)] }), b: pose({ t: 82, legs: [leg(12, 18), leg(-86, 0, 2)], arms: [arm(0, 0), arm(0, 0)] }), p: 3, anchor: "near", w: "hands" },
  nordic: { a: pose({ legs: KNEEL, arms: [arm(20, 110), arm(20, 110)] }), b: pose({ t: 32, legs: [leg(-32, 55, -88), leg(-32, 55, -88)], arms: [arm(55, 20), arm(55, 20)] }), p: 3, anchor: "knees" },
  sideLying: { a: pose({ t: -90, legs: [leg(86, 0, 90), leg(86, 0, 90)], arms: [arm(90, 0), arm(-90, 0)] }), b: pose({ t: -90, legs: [leg(122, 0, 122), leg(86, 0, 90)], arms: [arm(90, 0), arm(-90, 0)] }), p: 2.4, anchor: "hip" },
  // Кисти на опоре (стена, стул, косяк) стоят на одном месте: углы поз подобраны под это
  wallPush: { a: pose({ t: 16, legs: [leg(-16, 0), leg(-16, 0)], arms: [arm(78, 0, 12), arm(78, 0, 12)] }), b: pose({ t: 28, legs: [leg(-28, 0), leg(-28, 0)], arms: [arm(33.4, 120, -63.4), arm(33.4, 120, -63.4)] }), p: 2.4, props: ["wallHands"] },
  // Ладони стоят на одном месте весь повтор: корпус поворачивается вокруг коленей или носков,
  // локти сгибаются назад — углы поз подобраны так, чтобы кисти и опоры ног не сдвигались
  kneePush: { a: pose({ t: 50.7, legs: [leg(-50.7, 90, -150), leg(-50.7, 90, -150)], arms: [arm(3, 0), arm(3, 0)] }), b: pose({ t: 71, legs: [leg(-71, 90, -170), leg(-71, 90, -170)], arms: [arm(-80, 116, -36), arm(-80, 116, -36)] }), p: 2.4, anchor: "knees" },
  pushUp: { a: PLANK_HIGH, b: pose({ t: 83.6, legs: [leg(-83.6, 0, -5), leg(-83.6, 0, -5)], arms: [arm(-63, 123, -60), arm(-63, 123, -60)] }), p: 2.4 },
  pikePush: { a: pose({ t: 132, legs: [leg(-38, 0, 58), leg(-38, 0, 58)], arms: [arm(48, 0), arm(48, 0)] }), b: pose({ t: 145, legs: [leg(-46, 0, 50), leg(-46, 0, 50)], arms: [arm(92, -64), arm(92, -64)] }), p: 2.6, anchor: "hands" },
  dip: { a: pose({ t: 2, legs: [leg(72, 62), leg(72, 62)], arms: [arm(-16, 0, 16), arm(-16, 0, 16)] }), b: pose({ t: 8, legs: [leg(93.5, 86.3), leg(93.5, 86.3)], arms: [arm(-66.3, 79.7, -13.4), arm(-66.3, 79.7, -13.4)] }), p: 2.4, props: ["chairHands"] },
  chestPress: { a: pose({ legs: [leg(10, 0), leg(-10, 0)], arms: [arm(-30, 120), arm(-30, 120)] }), b: pose({ legs: [leg(10, 0), leg(-10, 0)], arms: [arm(88, 0), arm(88, 0)] }), p: 2.2 },
  floorPress: { a: SUPINE({ arms: [arm(90, 90), arm(90, 90)] }), b: SUPINE({ arms: [arm(180, 0), arm(180, 0)] }), p: 2.4, anchor: "hip", w: "hands" },
  benchPress: { a: pose({ t: -90, legs: [leg(90, 90), leg(90, 90)], arms: [arm(20, 160), arm(20, 160)] }), b: pose({ t: -90, legs: [leg(90, 90), leg(90, 90)], arms: [arm(180, 0), arm(180, 0)] }), p: 2.4, anchor: "hip", props: ["bench"], w: "hands" },
  skull: { a: SUPINE({ arms: [arm(165, 120), arm(165, 120)] }), b: SUPINE({ arms: [arm(178, 2), arm(178, 2)] }), p: 2.2, anchor: "hip", w: "hands" },
  pullover: { a: SUPINE({ arms: [arm(178, 4), arm(178, 4)] }), b: SUPINE({ arms: [arm(272, 8), arm(272, 8)] }), p: 2.8, anchor: "hip", w: "hands" },
  curl: { a: pose({ arms: [arm(2, 8), arm(2, 8)] }), b: pose({ arms: [arm(8, 140), arm(8, 140)] }), p: 2.2, w: "hands" },
  tricepsDown: { a: pose({ arms: [arm(-8, 120), arm(-8, 120)] }), b: pose({ arms: [arm(-6, 4), arm(-6, 4)] }), p: 2, props: ["bandUp"] },
  press: { a: pose({ arms: [arm(25, 155), arm(25, 155)] }), b: pose({ arms: [arm(176, 4), arm(176, 4)] }), p: 2.4, w: "hands" },
  seatedPress: { a: SEATED({ arms: [arm(25, 155), arm(25, 155)] }), b: SEATED({ arms: [arm(176, 4), arm(176, 4)] }), p: 2.4, props: ["chairA"], w: "hands" },
  ohTriceps: { a: SEATED({ arms: [arm(165, 140), arm(165, 140)] }), b: SEATED({ arms: [arm(174, 4), arm(174, 4)] }), p: 2.2, props: ["chairA"], w: "hands" },
  kickback: { a: HINGE({ t: 75, arms: [arm(-75, 75), arm(28, 0)] }), b: HINGE({ t: 75, arms: [arm(-75, 0), arm(28, 0)] }), p: 2, w: "near" },
  frontRaise: { a: pose({ arms: [arm(3, 5), arm(3, 5)] }), b: pose({ arms: [arm(88, 5), arm(88, 5)] }), p: 2.2, w: "hands" },
  superman: { a: pose({ t: 90, legs: [leg(-86, 0, -90), leg(-86, 0, -90)], arms: [arm(90, 0), arm(90, 0)] }), b: pose({ t: 84, curve: 0.014, legs: [leg(-100, 0, -100), leg(-100, 0, -100)], arms: [arm(102, 0), arm(102, 0)] }), p: 2.6, anchor: "hip" },
  backExtHold: { a: pose({ t: 84, curve: 0.014, legs: [leg(-98, 0, -98), leg(-98, 0, -98)], arms: [arm(100, 0), arm(100, 0)] }), anchor: "hip" },
  proneYT: { a: pose({ t: 90, legs: [leg(-86, 0, -90), leg(-86, 0, -90)], arms: [arm(90, 0), arm(90, 0)] }), b: pose({ t: 88, legs: [leg(-86, 0, -90), leg(-86, 0, -90)], arms: [arm(108, 0), arm(108, 0)] }), p: 2.4, anchor: "hip" },
  standRow: { a: pose({ legs: [leg(8, 12), leg(8, 12)], arms: [arm(88, 0), arm(88, 0)] }), b: pose({ legs: [leg(8, 12), leg(8, 12)], arms: [arm(-35, 125), arm(-35, 125)] }), p: 2.2, props: ["bandFront"] },
  row: { a: HINGE({ t: 65, legs: [leg(20, 28), leg(20, 28)] }), b: HINGE({ t: 65, legs: [leg(20, 28), leg(20, 28)], arms: [arm(-75, 75), arm(-75, 75)] }), p: 2.2, w: "hands" },
  reverseFly: { a: HINGE({ t: 72 }), b: HINGE({ t: 72, arms: [arm(-72, 6), arm(-72, 6)] }), p: 2.4, w: "hands" },
  hang: { a: pose({ t: -2, legs: [leg(4, 20), leg(4, 20)], arms: [arm(178, 0), arm(178, 0)] }), hang: 2.24, props: ["bar"] },
  pullUp: { a: pose({ t: -2, legs: [leg(4, 20), leg(4, 20)], arms: [arm(178, 0), arm(178, 0)] }), b: pose({ t: -6, legs: [leg(14, 40), leg(14, 40)], arms: [arm(-12, 186), arm(-12, 186)] }), p: 2.8, hang: 2.24, anchor: "hands", props: ["bar"] },
  shrug: { a: pose({ arms: [arm(2, 0), arm(2, 0)] }), b: pose({ sh: 0.05, arms: [arm(2, 0), arm(2, 0)] }), p: 1.8, w: "hands" },
  renegade: { a: PLANK_HIGH, b: pose({ t: 71, legs: [leg(-71, 0, -5), leg(-71, 0, -5)], arms: [arm(-72, 82), arm(3, 0)] }), alt: true, p: 2.2, w: "hands" },
  doorRow: { a: pose({ t: -28, legs: [leg(28, 0), leg(28, 0)], arms: [arm(80, 0), arm(80, 0)] }), b: pose({ t: -12, legs: [leg(12, 0), leg(12, 0)], arms: [arm(-13.6, 114.9, -16.3), arm(-13.6, 114.9, -16.3)] }), p: 2.4, props: ["door"] },
  deadBug: { a: SUPINE({ legs: [leg(180, 90, 180), leg(180, 90, 180)], arms: [arm(180, 0), arm(180, 0)] }), b: SUPINE({ legs: [leg(180, 90, 180), leg(100, 0, 100)], arms: [arm(270, 0), arm(180, 0)] }), alt: true, p: 2.4, anchor: "hip", w: "hands" },
  deadBugHold: { a: SUPINE({ legs: [leg(180, 90, 180), leg(180, 90, 180)], arms: [arm(180, 0), arm(180, 0)] }), anchor: "hip" },
  birdDog: { a: QUAD(), b: QUAD({ legs: [KNEEL[0], leg(-90, 0, -90)], arms: [arm(92, 0), arm(0, 0)] }), alt: true, p: 2.6, anchor: "hip" },
  catCow: { a: QUAD({ n: -30, curve: 0.04 }), b: QUAD({ n: 42, curve: -0.05 }), p: 3.2, anchor: "hip" },
  standingKnee: { a: STAND, b: pose({ t: 16, legs: [leg(100, 95), leg(0, 0)], arms: [arm(-10, 30), arm(35, 110)] }), alt: true, p: 1.8 },
  plank: { a: pose({ t: 85, legs: [leg(-85, 0, -5), leg(-85, 0, -5)], arms: [arm(0, 90), arm(0, 90)] }) },
  kneePlank: { a: pose({ t: 64, legs: [leg(-64, 90, -150), leg(-64, 90, -150)], arms: [arm(0, 90), arm(0, 90)] }) },
  sidePlank: { a: pose({ t: 78, legs: [leg(-78, 0, -12), leg(-78, 0, -12)], arms: [arm(0, 90), arm(180, 0)] }) },
  hollow: { a: pose({ t: -76, curve: -0.016, legs: [leg(105, 0, 105), leg(105, 0, 105)], arms: [arm(-108, 0), arm(-108, 0)] }), anchor: "hip" },
  // скручивание: поясница остаётся на полу, поднимаются лопатки — спина округляется (curve < 0)
  crunch: { a: SUPINE({ arms: [arm(110, 60), arm(110, 60)] }), b: SUPINE({ t: -68, curve: -0.024, arms: [arm(100, 20), arm(100, 20)] }), p: 2.2, anchor: "hip" },
  carry: { a: pose({ arms: [arm(0, 0), arm(0, 0)] }), b: pose({ legs: [leg(42, 64), leg(0, 0)], arms: [arm(0, 0), arm(0, 0)] }), alt: true, p: 1.3, w: "hands" },
  kbCarry: { a: pose({ arms: [arm(20, 140), arm(20, 140)] }), b: pose({ legs: [leg(42, 64), leg(0, 0)], arms: [arm(20, 140), arm(20, 140)] }), alt: true, p: 1.3, w: "chest" },
  getUp: { a: SUPINE({ legs: [leg(130, 95), leg(89, 0, 178)], arms: [arm(180, 0), arm(135, 0)] }), b: SUPINE({ t: -62, legs: [leg(130, 95), leg(89, 0, 178)], arms: [arm(180, 0), arm(0, 90)] }), p: 3.2, anchor: "hip", w: "near" },
  seatedMarch: { a: SEATED(), b: SEATED({ legs: [leg(115, 95), leg(90, 90)], arms: [arm(-15, 80), arm(40, 80)] }), alt: true, p: 1.4, props: ["chairA"] },
  armBike: { a: SEATED({ arms: [arm(60, 70), arm(100, 40)] }), b: SEATED({ arms: [arm(100, 40), arm(60, 70)] }), p: 1.2, props: ["chairA"] },
  seatedAnkle: { a: SEATED({ legs: [leg(80, 25, 70), leg(90, 90)] }), b: SEATED({ legs: [leg(80, 25, 125), leg(90, 90)] }), p: 2, props: ["chairA"] },
  sitIso: { a: SEATED({ arms: [arm(30, 80), arm(30, 80)] }), props: ["chairA"] },
  shadowBox: { a: pose({ t: 5, legs: [leg(12, 15), leg(-12, 15, 76)], arms: [arm(25, 120), arm(25, 120)] }), b: pose({ t: 8, legs: [leg(12, 15), leg(-12, 15, 76)], arms: [arm(88, 0), arm(25, 120)] }), alt: "arms", p: 1 },
  mountain: { a: PLANK_HIGH, b: pose({ t: 71, legs: [leg(60, 130, -80), leg(-71, 0, -5)], arms: [arm(3, 0), arm(3, 0)] }), m: pose({ t: 71, legs: [leg(-30, 110, -60), leg(-71, 0, -5)], arms: [arm(3, 0), arm(3, 0)] }), alt: true, p: 0.9 },
  burpee: { a: pose({ t: 55, legs: [leg(100, 130), leg(100, 130)], arms: [arm(-10, 35), arm(-10, 35)] }), b: PLANK_HIGH, m: pose({ t: 100, hs: 1, legs: [leg(30, 120, -30), leg(30, 120, -30)], arms: [arm(-4, 10), arm(-4, 10)] }), p: 2.4, anchor: "hands" },
  thruster: { a: SQUAT_LOW({ arms: [arm(25, 155), arm(25, 155)] }), b: pose({ arms: [arm(176, 4), arm(176, 4)] }), p: 2.4, w: "hands" },
  clean: { a: pose({ t: 62, legs: [leg(25, 32), leg(25, 32)], arms: [arm(-25, 0), arm(-25, 0)] }), b: pose({ arms: [arm(15, 150), arm(4, 0)] }), p: 2, w: "near" },
  bear: { a: pose({ t: 80, legs: [leg(15, 100, -60), leg(15, 100, -60)], arms: [arm(0, 0), arm(0, 0)] }), b: pose({ t: 80, legs: [leg(15, 100, -60), leg(32, 100, -50)], arms: [arm(18, 0), arm(0, 0)] }), m: pose({ t: 80, legs: [leg(15, 100, -60), leg(30, 122, -36)], arms: [arm(9, 0), arm(0, 0)] }), alt: true, p: 1.2 },
  balance: { a: BALANCE({ t: -2 }), b: BALANCE({ t: 2 }), p: 3, anchor: "near" },
  starReach: { a: BALANCE(), b: pose({ t: -8, legs: [leg(15, 30), leg(55, 5, 80)], arms: [arm(40, 10), arm(40, 10)] }), p: 2.6, anchor: "near" },
  longSit: { a: pose({ t: -8, legs: [leg(89, 0, 175), leg(89, 0, 175)], arms: [arm(-25, 0), arm(-25, 0)] }), b: pose({ t: -8, legs: [leg(89, 0, 160), leg(89, 0, 160)], arms: [arm(-25, 0), arm(-25, 0)] }), p: 2.4, anchor: "hip" },
  lieIso: { a: SUPINE({ arms: [arm(100, 80), arm(90, 0)] }), b: SUPINE({ t: -89, arms: [arm(100, 80), arm(90, 0)] }), p: 4, anchor: "hip" },
  standIso: { a: pose({ arms: [arm(0, 90), arm(20, 90)] }), b: pose({ arms: [arm(0, 88), arm(20, 92)] }), p: 3 },
  openBook: { a: pose({ t: -90, legs: [leg(130, 95), leg(130, 95)], arms: [arm(178, 0), arm(178, 0)] }), b: pose({ t: -90, legs: [leg(130, 95), leg(130, 95)], arms: [arm(270, 0), arm(178, 0)] }), p: 3, anchor: "hip" },
  hipFlexor: { a: pose({ t: -4, legs: [leg(85, 99), leg(-15, 72, -88)], arms: [arm(10, 0), arm(10, 0)] }), b: pose({ t: -10, legs: [leg(85, 109), leg(-25, 62, -88)], arms: [arm(10, 0), arm(10, 0)] }), p: 3.2, anchor: "near" },
  thoracicReach: { a: pose({ arms: [arm(88.1, 81.8), arm(88.1, 81.8)] }), b: pose({ arms: [arm(127.2, 27.5, 21.4), arm(127.2, 27.5, 21.4)] }), p: 2.6, props: ["wallFront"] },
  sphinx: { a: pose({ t: 62.5, curve: 0.026, legs: [leg(-86, 0, -90), leg(-86, 0, -90)], arms: [arm(0, 90), arm(0, 90)] }), anchor: "hip" },
  cobra: { a: pose({ t: 74, curve: 0.012, legs: [leg(-86, 0, -90), leg(-86, 0, -90)], arms: [arm(-114, 128, -14), arm(-114, 128, -14)] }), b: pose({ t: 52, n: -8, curve: 0.034, legs: [leg(-86, 0, -90), leg(-86, 0, -90)], arms: [arm(-69, 106, -37), arm(-69, 106, -37)] }), p: 3.2, anchor: "hip" },
  kneesToChest: { a: pose({ t: -90, legs: [leg(215, 120, 150), leg(215, 120, 150)], arms: [arm(160, 40), arm(160, 40)] }), b: pose({ t: -84, legs: [leg(222, 120, 150), leg(222, 120, 150)], arms: [arm(160, 40), arm(160, 40)] }), p: 3, anchor: "hip" },
  downDog: { a: pose({ t: 132, legs: [leg(-38, 0, 58), leg(-38, 0, 58)], arms: [arm(48, 0), arm(48, 0)] }), b: pose({ t: 132, legs: [leg(-36, 8, 72), leg(-38, 0, 58)], arms: [arm(48, 0), arm(48, 0)] }), p: 3 },
  worldStretch: { a: LUNGE_LOW({ t: 30, arms: [arm(10, 0), arm(10, 0)] }), b: LUNGE_LOW({ t: 25, arms: [arm(176, 0), arm(10, 0)] }), p: 3 },
  // поза ребёнка: таз опущен к пяткам, голени лежат на полу, грудь на бёдрах, руки вытянуты вперёд по полу
  childPose: { a: pose({ t: 102, curve: -0.024, legs: [leg(60, 148, -88), leg(60, 148, -88)], arms: [arm(77.5, 0), arm(77.5, 0)] }), b: pose({ t: 104, curve: -0.03, legs: [leg(62, 150, -88), leg(62, 150, -88)], arms: [arm(80.2, 0), arm(80.2, 0)] }), p: 4 },
  forwardFold: { a: pose({ t: 98, curve: -0.014, legs: [leg(-6, 0), leg(-6, 0)], arms: [arm(0, 0), arm(0, 0)] }), b: pose({ t: 104, curve: -0.02, legs: [leg(-6, 0), leg(-6, 0)], arms: [arm(0, 0), arm(0, 0)] }), p: 4 },
  strapHam: { a: pose({ t: -90, legs: [leg(185, 0, 100), leg(89, 0, 178)], arms: [arm(172, 0), arm(172, 0)] }), b: pose({ t: -90, legs: [leg(195, 0, 105), leg(89, 0, 178)], arms: [arm(178, 0), arm(178, 0)] }), p: 4, anchor: "hip", props: ["strap"] },
  quadStretch: { a: pose({ legs: [leg(-8, 160, -170), leg(0, 0)], arms: [arm(-15, 0), arm(20, 10)] }), anchor: "far" },
  calfStretch: { a: pose({ t: 15, legs: [leg(30, 50), leg(-25, 0)], arms: [arm(75, 0), arm(75, 0)] }), props: ["wallHands"] },
  chestStretch: { a: pose({ t: 8, legs: [leg(15, 0), leg(-15, 0)], arms: [arm(-70, 160), arm(-70, 160)] }), b: pose({ t: 12, legs: [leg(15, 0), leg(-15, 0)], arms: [arm(-80, 165), arm(-80, 165)] }), p: 4 },
  tricepsStretch: { a: pose({ arms: [arm(172, 160), arm(150, 60)] }) },
  butterfly: { a: pose({ t: -5, legs: [leg(118, 150, 90), leg(118, 150, 90)], arms: [arm(40, 20), arm(40, 20)] }), b: pose({ t: 12, legs: [leg(112, 150, 90), leg(112, 150, 90)], arms: [arm(50, 15), arm(50, 15)] }), p: 3.2, anchor: "hip" },
  seatedFold: { a: pose({ t: -6, legs: [leg(89, 0, 175), leg(89, 0, 175)], arms: [arm(170, 0), arm(170, 0)] }), b: pose({ t: 58, curve: -0.024, legs: [leg(89, 0, 170), leg(89, 0, 170)], arms: [arm(82, 0), arm(82, 0)] }), p: 3.6, anchor: "hip" },
  reachUp: { a: pose({ arms: [arm(4, 6), arm(4, 6)] }), b: pose({ legs: [leg(0, 0, 70), leg(0, 0, 70)], arms: [arm(178, 0), arm(178, 0)] }), p: 3, anchor: "toes" },
  warrior: { a: pose({ t: -4, legs: [leg(72, 72), leg(-47, 0, 78)], arms: [arm(176, 0), arm(176, 0)] }) },
  tree: { a: pose({ legs: [leg(0, 0), leg(30, 125, 30)], arms: [arm(178, 0), arm(178, 0)] }), b: pose({ t: 2, legs: [leg(0, 0), leg(30, 125, 30)], arms: [arm(178, 0), arm(178, 0)] }), p: 3, anchor: "near" },
  sunFlow: { a: pose({ arms: [arm(178, 0), arm(178, 0)] }), b: pose({ t: 100, legs: [leg(-6, 0), leg(-6, 0)], arms: [arm(2, 0), arm(2, 0)] }), p: 4 },
  // v1.5: равновесие, осанка, эспандер, корпус. Позы с опорой подобраны так, чтобы кисти
  // оставались на стене или столе, а обе стопы — на полу
  tandem: { a: pose({ legs: [leg(7, 2), leg(-7, 2)], arms: [arm(28, 12), arm(28, 12)] }), b: pose({ t: 2, legs: [leg(7, 2), leg(-7, 2)], arms: [arm(34, 12), arm(22, 12)] }), p: 3.2 },
  legBack: { a: pose({ arms: [arm(10, 10), arm(70, 10)] }), b: pose({ t: 7, legs: [leg(-28, 6), leg(0, 0)], arms: [arm(10, 10), arm(47.1, 55.5, -22.6)] }), p: 2.4, anchor: "far", props: ["wallHands"] },
  kneeLift: { a: pose({ arms: HANDS_HIPS }), b: pose({ legs: [leg(84, 92), leg(0, 0)], arms: HANDS_HIPS }), p: 3.2, anchor: "far" },
  toeRaise: { a: pose({ t: -8, legs: [leg(8, 0), leg(8, 0)] }), b: pose({ t: -8, legs: [leg(8, 0, 124), leg(8, 0, 124)] }), p: 2, props: ["wallBack"], anchor: "heels" },
  rock: { a: pose({ legs: [leg(0, 0, 118), leg(0, 0, 118)], arms: [arm(8, 14), arm(8, 14)] }), b: pose({ legs: [leg(0, 0, 55), leg(0, 0, 55)], arms: [arm(8, 14), arm(8, 14)] }), p: 2.2 },
  hop: { a: pose({ legs: [leg(4, 12, 84), leg(4, 12, 84)], arms: [arm(18, 72), arm(18, 72)] }), b: pose({ air: 0.07, legs: [leg(0, 2, 58), leg(0, 2, 58)], arms: [arm(14, 66), arm(14, 66)] }), p: 0.6 },
  stepBackReach: { a: pose({ arms: [arm(10, 10), arm(10, 10)] }), b: pose({ legs: [leg(14, 12), leg(-26, 6, 62)], arms: [arm(168, 0), arm(168, 0)] }), m: pose({ legs: [leg(8, 10), leg(-14, 34, 55)], arms: [arm(90, 10), arm(90, 10)] }), alt: true, p: 1.6 },
  chinTuck: { a: pose({ n: 22 }), b: pose({ n: -4 }), p: 2.6 },
  handsBehind: { a: pose({ arms: [arm(-28, 4), arm(-28, 4)] }), b: pose({ n: -6, arms: [arm(-44, 4), arm(-44, 4)] }), p: 4 },
  thread: { a: QUAD({ arms: [arm(150, 0), arm(0, 0)] }), b: QUAD({ t: 84, arms: [arm(-78, 0), arm(-41, 70)] }), p: 3.2, anchor: "hip" },
  kneeToWall: { a: pose({ t: 4, legs: [leg(12, 10), leg(-9, 19, 76)], arms: [arm(15, 108), arm(15, 108)] }), b: pose({ t: 8, legs: [leg(28, 62), leg(-7, 48.5, 70)], arms: [arm(9, 147), arm(9, 147)] }), p: 2.6, anchor: "near", props: ["wallHands"] },
  incline: { a: pose({ t: 36, legs: [leg(-36, 0, 40), leg(-36, 0, 40)], arms: [arm(8, 0), arm(8, 0)] }), b: pose({ t: 48, legs: [leg(-48, 0, 34), leg(-48, 0, 34)], arms: [arm(-62, 86), arm(-62, 86)] }), p: 2.4, props: ["tableHands"] },
  bicycle: { a: pose({ t: -72, curve: -0.02, legs: [leg(160, 95, 150), leg(160, 95, 150)], arms: [arm(170, 150), arm(170, 150)] }), b: pose({ t: -66, curve: -0.022, legs: [leg(212, 112, 160), leg(108, 0, 108)], arms: [arm(170, 150), arm(170, 150)] }), alt: true, p: 2.2, anchor: "hip" },
  reverseCrunch: { a: pose({ t: -90, legs: [leg(178, 92, 178), leg(178, 92, 178)], arms: [arm(90, 0), arm(90, 0)] }), b: pose({ t: -102, n: 10, legs: [leg(214, 108, 165), leg(214, 108, 165)], arms: [arm(90, 0), arm(90, 0)] }), p: 2.6, anchor: "shoulder" },
  legLower: { a: SUPINE({ legs: [leg(178, 0, 178), leg(178, 0, 178)] }), b: SUPINE({ legs: [leg(104, 0, 104), leg(178, 0, 178)] }), alt: true, p: 2.8, anchor: "hip" },
  bearHold: { a: pose({ t: 80, legs: [leg(15, 100, -60), leg(15, 100, -60)], arms: [arm(0, 0), arm(0, 0)] }) },
  shoulderTap: { a: PLANK_HIGH, b: pose({ t: 71, legs: [leg(-71, 0, -5), leg(-71, 0, -5)], arms: [arm(-20, 150), arm(3, 0)] }), alt: true, p: 1.6 },
  sidePlankKnee: { a: pose({ t: 64, legs: [leg(-64, 90, -150), leg(-64, 90, -150)], arms: [arm(0, 90), arm(180, 0)] }) },
  facePull: { a: pose({ legs: [leg(8, 12), leg(8, 12)], arms: [arm(96, 0), arm(96, 0)] }), b: pose({ legs: [leg(8, 12), leg(8, 12)], arms: [arm(78, 128), arm(78, 128)] }), p: 2.4, props: ["bandFront"] },
  swimmer: { a: pose({ t: 89, legs: [leg(-94, 0, -94), leg(-94, 0, -94)], arms: [arm(96, 0), arm(96, 0)] }), b: pose({ t: 86, legs: [leg(-104, 0, -104), leg(-92, 0, -92)], arms: [arm(94, 0), arm(110, 0)] }), alt: true, p: 1.4, anchor: "hip" },
  bandCurl: { a: pose({ arms: [arm(2, 8), arm(2, 8)] }), b: pose({ arms: [arm(8, 140), arm(8, 140)] }), p: 2.2, props: ["bandFeet"] },
  bandPressUp: { a: pose({ arms: [arm(25, 155), arm(25, 155)] }), b: pose({ arms: [arm(176, 4), arm(176, 4)] }), p: 2.4, props: ["bandFeet"] },
  seatedPunch: { a: SEATED({ arms: [arm(25, 120), arm(25, 120)] }), b: SEATED({ arms: [arm(88, 0), arm(25, 120)] }), alt: true, p: 0.9, props: ["chairA"] },
  happyBaby: { a: pose({ t: -88, legs: [leg(228, 52, 90), leg(228, 52, 90)], arms: [arm(160, 0), arm(160, 0)] }), b: pose({ t: -88, legs: [leg(234, 56, 90), leg(234, 56, 90)], arms: [arm(162, 0), arm(162, 0)] }), p: 3.6, anchor: "hip" },

  // ----- Анфас -----
  jacks: { a: fpose(), b: fpose({ air: 0.05, legs: [fleg(18), fleg(18)], arms: [farm(165, 8), farm(165, 8)] }), p: 1 },
  stepJack: { a: fpose(), b: fpose({ legs: [fleg(20), fleg(3)], arms: [farm(150, 10), farm(150, 10)] }), m: fpose({ legs: [fleg(13, 6, 0.14), fleg(3)], arms: [farm(80, 10), farm(80, 10)] }), alt: true, p: 1.4 },
  lateralRaise: { a: fpose({ arms: [farm(12, 5), farm(12, 5)] }), b: fpose({ arms: [farm(86, 5), farm(86, 5)] }), p: 2.2, w: "hands" },
  pullApart: { a: fpose({ arms: [farm(38, 45), farm(38, 45)] }), b: fpose({ arms: [farm(90, 0), farm(90, 0)] }), p: 2, props: ["bandHands"] },
  wallAngel: { a: fpose({ arms: [farm(90, 90), farm(90, 90)] }), b: fpose({ arms: [farm(150, 20), farm(150, 20)] }), p: 2.6 },
  sumo: { a: fpose({ legs: [fleg(22), fleg(22)], arms: [farm(4, 0), farm(4, 0)] }), b: fpose({ legs: [fleg(64, 73), fleg(64, 73)], arms: [farm(4, 0), farm(4, 0)] }), p: 2.6, w: "hands" },
  sideLunge: { a: fpose({ legs: [fleg(30), fleg(30)], arms: [farm(10, 90), farm(10, 90)] }), b: fpose({ t: 4, legs: [fleg(70, 110), fleg(57)], arms: [farm(10, 90), farm(10, 90)] }), alt: true, p: 2.6 },
  sideStep: { a: fpose({ legs: [fleg(4, 12), fleg(4, 12)] }), b: fpose({ legs: [fleg(18, 16), fleg(5, 16)], arms: [farm(30, 20), farm(14, 10)] }), m: fpose({ legs: [fleg(12, 16, 0.12), fleg(5, 16)], arms: [farm(22, 15), farm(10, 10)] }), alt: true, p: 1.4, props: ["bandKnees"] },
  legSide: { a: fpose({ arms: [farm(10, 6), farm(70, 10)] }), b: fpose({ legs: [fleg(4), fleg(36)], arms: [farm(10, 6), farm(70, 10)] }), p: 2.2, anchor: "near" },
  stepSide: { a: fpose({ legs: [fleg(4, 12), fleg(4, 12)] }), b: fpose({ legs: [fleg(18, 16), fleg(5, 16)], arms: [farm(30, 20), farm(14, 10)] }), m: fpose({ legs: [fleg(12, 16, 0.12), fleg(5, 16)], arms: [farm(22, 15), farm(10, 10)] }), alt: true, p: 1.4 },
  weightShift: { a: fpose({ tp: 11, legs: [fleg(5), fleg(17)], arms: [farm(22, 12), farm(22, 12)] }), b: fpose({ tp: -11, legs: [fleg(17), fleg(5)], arms: [farm(22, 12), farm(22, 12)] }), p: 3 },
  sideBendWarm: { a: fpose({ arms: [farm(6, 4), farm(6, 4)] }), b: fpose({ t: 18, arms: [farm(150, 40), farm(2, 2)] }), alt: true, p: 2.6 },
  shuffle: { a: fpose({ legs: [fleg(14, 26), fleg(14, 26)], arms: [farm(18, -130), farm(18, -130)] }), b: fpose({ air: 0.03, legs: [fleg(24, 28), fleg(6, 18)], arms: [farm(18, -130), farm(18, -130)] }), alt: true, p: 0.9 },
  bandLateral: { a: fpose({ arms: [farm(12, 5), farm(12, 5)] }), b: fpose({ arms: [farm(86, 5), farm(86, 5)] }), p: 2.2, props: ["bandFeet"] },
  sideBend: { a: fpose({ arms: [farm(170, 10), farm(170, 10)] }), b: fpose({ t: 18, arms: [farm(158, 10), farm(180, 0)] }), p: 3.2 },
  // «Дровосек»: одна гантель в обеих руках идёт по диагонали от бедра вверх, корпус поворачивается следом
  chop: { a: fpose({ t: -5, tw: -34, hd: -8, legs: [fleg(16, 20), fleg(16, 20)], arms: [{ ik: 1, tx: -0.2, ty: 0, tz: 0.27, fw: 30 }, { ik: 1, tx: -0.15, ty: 0, tz: 0.27, fw: 30 }] }), b: fpose({ t: 6, tw: 30, hd: 8, legs: [fleg(8, 4), fleg(8, 4)], arms: [{ ik: 1, tx: 0.15, ty: 0.85, tz: 0.26, fw: 30 }, { ik: 1, tx: 0.2, ty: 0.85, tz: 0.26, fw: 30 }] }), p: 2.2, w: "chest", guide: [{ at: "waist", rx: 0.26, ry: 0.06, swing: 50 }] },
  neckTilt: { a: fpose(), b: fpose({ n: 24 }), p: 3.2 },
  // ----- v1.9: вращения и движения, которые раньше показывались неточно -----
  // Повороты корпуса стоя: таз смотрит вперёд, поворачиваются грудь, плечи и голова; руки перед грудью идут следом
  turns: { seq: [fpose({ tw: 0, hd: 0, legs: [fleg(6), fleg(6)], arms: [farm(28, 91, 108), farm(28, 91, 108)] }), fpose({ tw: 48, hd: 12, legs: [fleg(6), fleg(6)], arms: [farm(28, 91, 108), farm(28, 91, 108)] }), fpose({ tw: 0, hd: 0, legs: [fleg(6), fleg(6)], arms: [farm(28, 91, 108), farm(28, 91, 108)] }), fpose({ tw: -48, hd: -12, legs: [fleg(6), fleg(6)], arms: [farm(28, 91, 108), farm(28, 91, 108)] })], p: 3.4, guide: [{ at: "waist", rx: 0.26, ry: 0.065, swing: 58 }] },
  // Круги тазом: таз ходит по кругу, стопы стоят, корпус чуть наклоняется навстречу
  hipCircle: { seq: [fpose({ t: -5, tp: -2.7, legs: [fleg(8, 0, 0, 0.985, 0.985), fleg(0, 0, 0, 0.985, 0.985)], arms: [farm(40, -100), farm(40, -100)] }), fpose({ t: -3.5, tp: -1.9, legs: [fleg(6.8, 0, 0, 0.974, 0.974), fleg(1.2, 0, 0, 0.974, 0.974)], arms: [farm(40, -100), farm(40, -100)] }), fpose({ t: 0, tp: 0, legs: [fleg(4, 0, 0, 0.97, 0.97), fleg(4, 0, 0, 0.97, 0.97)], arms: [farm(40, -100), farm(40, -100)] }), fpose({ t: 3.5, tp: 1.9, legs: [fleg(1.2, 0, 0, 0.974, 0.974), fleg(6.8, 0, 0, 0.974, 0.974)], arms: [farm(40, -100), farm(40, -100)] }), fpose({ t: 5, tp: 2.7, legs: [fleg(0, 0, 0, 0.985, 0.985), fleg(8, 0, 0, 0.985, 0.985)], arms: [farm(40, -100), farm(40, -100)] }), fpose({ t: 3.5, tp: 1.9, legs: [fleg(1.2, 0, 0, 0.996, 0.996), fleg(6.8, 0, 0, 0.996, 0.996)], arms: [farm(40, -100), farm(40, -100)] }), fpose({ t: 0, tp: 0, legs: [fleg(4, 0, 0, 1, 1), fleg(4, 0, 0, 1, 1)], arms: [farm(40, -100), farm(40, -100)] }), fpose({ t: -3.5, tp: -1.9, legs: [fleg(6.8, 0, 0, 0.996, 0.996), fleg(1.2, 0, 0, 0.996, 0.996)], arms: [farm(40, -100), farm(40, -100)] })], p: 3.2, guide: [{ at: "hip" }] },
  // Круги руками: прямые руки в стороны описывают круги — вверх, вперёд, вниз, назад
  armCircles: { seq: [fpose({ arms: [farm(88, 4, 24), farm(88, 4, 24)] }), fpose({ arms: [farm(95.1, 4, 17), farm(95.1, 4, 17)] }), fpose({ arms: [farm(98, 4, 0), farm(98, 4, 0)] }), fpose({ arms: [farm(95.1, 4, -17), farm(95.1, 4, -17)] }), fpose({ arms: [farm(88, 4, -24), farm(88, 4, -24)] }), fpose({ arms: [farm(80.9, 4, -17), farm(80.9, 4, -17)] }), fpose({ arms: [farm(78, 4, 0), farm(78, 4, 0)] }), fpose({ arms: [farm(80.9, 4, 17), farm(80.9, 4, 17)] })], p: 1.4, guide: [{ at: "hand0" }, { at: "hand1" }] },
  // Вращения стопой: носок описывает круг (вбок стопа в профиль кажется короче)
  ankleCircle: { seq: [SEATED({ legs: [leg(80, 25, 95, 40), leg(90, 90)] }), SEATED({ legs: [leg(80, 25, 112, 28.3), leg(90, 90)] }), SEATED({ legs: [leg(80, 25, 119, 0), leg(90, 90)] }), SEATED({ legs: [leg(80, 25, 112, -28.3), leg(90, 90)] }), SEATED({ legs: [leg(80, 25, 95, -40), leg(90, 90)] }), SEATED({ legs: [leg(80, 25, 78, -28.3), leg(90, 90)] }), SEATED({ legs: [leg(80, 25, 71, 0), leg(90, 90)] }), SEATED({ legs: [leg(80, 25, 78, 28.3), leg(90, 90)] })], p: 2.6, props: ["chairA"], guide: [{ at: "toe0" }] },
  // Вращения кистями: руки вперёд, кисти описывают круги
  wristCircle: { seq: [pose({ arms: [arm(55, 35, 0), arm(55, 35, 0)] }), pose({ arms: [arm(55, 35, 22.6), arm(55, 35, 22.6)] }), pose({ arms: [arm(55, 35, 32), arm(55, 35, 32)] }), pose({ arms: [arm(55, 35, 22.6), arm(55, 35, 22.6)] }), pose({ arms: [arm(55, 35, 0), arm(55, 35, 0)] }), pose({ arms: [arm(55, 35, -22.6), arm(55, 35, -22.6)] }), pose({ arms: [arm(55, 35, -32), arm(55, 35, -32)] }), pose({ arms: [arm(55, 35, -22.6), arm(55, 35, -22.6)] })], p: 1.6, guide: [{ at: "hand0" }] },
  // «Велосипед» руками сидя: кисти описывают круги перед грудью, как педали — в противофазе
  armPedal: { seq: [SEATED({ arms: [arm(24.2, 78.1), arm(-14.0, 119.3)] }), SEATED({ arms: [arm(23.2, 91.9), arm(-10.5, 104.6)] }), SEATED({ arms: [arm(14.0, 109.6), arm(2.9, 87.1)] }), SEATED({ arms: [arm(-2.0, 121.7), arm(16.7, 76.1)] }), SEATED({ arms: [arm(-14.0, 119.3), arm(24.2, 78.1)] }), SEATED({ arms: [arm(-10.5, 104.6), arm(23.2, 91.9)] }), SEATED({ arms: [arm(2.9, 87.1), arm(14.0, 109.6)] }), SEATED({ arms: [arm(16.7, 76.1), arm(-2.0, 121.7)] })], p: 1.6, props: ["chairA"], guide: [{ at: "hand0" }] },
  // Круги плечами: вверх к ушам, назад, вниз и вперёд; голова на месте
  shoulderRoll: { seq: [pose({ se: 0.045, sf: 0, arms: [arm(4, 8), arm(-2, 8)] }), pose({ se: 0.032, sf: -0.028, arms: [arm(4, 8), arm(-2, 8)] }), pose({ se: 0, sf: -0.04, arms: [arm(4, 8), arm(-2, 8)] }), pose({ se: -0.032, sf: -0.028, arms: [arm(4, 8), arm(-2, 8)] }), pose({ se: -0.045, sf: 0, arms: [arm(4, 8), arm(-2, 8)] }), pose({ se: -0.032, sf: 0.028, arms: [arm(4, 8), arm(-2, 8)] }), pose({ se: 0, sf: 0.04, arms: [arm(4, 8), arm(-2, 8)] }), pose({ se: 0.032, sf: 0.028, arms: [arm(4, 8), arm(-2, 8)] })], p: 2.4, guide: [{ at: "shoulder" }] },
  // Мягкие наклоны головы: ухо к плечу, подбородок к груди, ухо к другому плечу — без кругов
  neckTilts: { seq: [fpose({ n: 32 }), fpose({ nd: 1.15 }), fpose({ n: -32 }), fpose({ nd: 1.15 })], p: 7 },
  // «Гало»: гиря по кругу вокруг головы — перед лицом, сбоку, за головой (там её закрывает голова)
  halo: { seq: [fpose({ ox: 0, oy: 0.63, oz: 0.19, arms: [{ ik: 1, tx: -0.035, ty: 0.64, tz: 0.22, fw: 60 }, { ik: 1, tx: 0.035, ty: 0.64, tz: 0.22, fw: 60 }] }), fpose({ ox: 0.095, oy: 0.633, oz: 0.165, arms: [{ ik: 1, tx: 0.065, ty: 0.643, tz: 0.195, fw: 60 }, { ik: 1, tx: 0.125, ty: 0.643, tz: 0.195, fw: 60 }] }), fpose({ ox: 0.165, oy: 0.642, oz: 0.095, arms: [{ ik: 1, tx: 0.147, ty: 0.652, tz: 0.125, fw: 60 }, { ik: 1, tx: 0.182, ty: 0.652, tz: 0.125, fw: 60 }] }), fpose({ ox: 0.19, oy: 0.655, oz: 0, arms: [{ ik: 1, tx: 0.19, ty: 0.665, tz: 0.03, fw: 60 }, { ik: 1, tx: 0.19, ty: 0.665, tz: 0.03, fw: 60 }] }), fpose({ ox: 0.165, oy: 0.667, oz: -0.095, arms: [{ ik: 1, tx: 0.182, ty: 0.677, tz: -0.065, fw: 60 }, { ik: 1, tx: 0.147, ty: 0.677, tz: -0.065, fw: 60 }] }), fpose({ ox: 0.095, oy: 0.677, oz: -0.165, arms: [{ ik: 1, tx: 0.125, ty: 0.687, tz: -0.135, fw: 60 }, { ik: 1, tx: 0.065, ty: 0.687, tz: -0.135, fw: 60 }] }), fpose({ ox: 0, oy: 0.68, oz: -0.19, arms: [{ ik: 1, tx: 0.035, ty: 0.69, tz: -0.16, fw: 60 }, { ik: 1, tx: -0.035, ty: 0.69, tz: -0.16, fw: 60 }] }), fpose({ ox: -0.095, oy: 0.677, oz: -0.165, arms: [{ ik: 1, tx: -0.065, ty: 0.687, tz: -0.135, fw: 60 }, { ik: 1, tx: -0.125, ty: 0.687, tz: -0.135, fw: 60 }] }), fpose({ ox: -0.165, oy: 0.667, oz: -0.095, arms: [{ ik: 1, tx: -0.147, ty: 0.677, tz: -0.065, fw: 60 }, { ik: 1, tx: -0.182, ty: 0.677, tz: -0.065, fw: 60 }] }), fpose({ ox: -0.19, oy: 0.655, oz: 0, arms: [{ ik: 1, tx: -0.19, ty: 0.665, tz: 0.03, fw: 60 }, { ik: 1, tx: -0.19, ty: 0.665, tz: 0.03, fw: 60 }] }), fpose({ ox: -0.165, oy: 0.642, oz: 0.095, arms: [{ ik: 1, tx: -0.182, ty: 0.652, tz: 0.125, fw: 60 }, { ik: 1, tx: -0.147, ty: 0.652, tz: 0.125, fw: 60 }] }), fpose({ ox: -0.095, oy: 0.633, oz: 0.165, arms: [{ ik: 1, tx: -0.125, ty: 0.643, tz: 0.195, fw: 60 }, { ik: 1, tx: -0.065, ty: 0.643, tz: 0.195, fw: 60 }] })], p: 4, w: "obj", hold: "kb", guide: [{ at: "obj" }] },
  // Передача гири вокруг корпуса: из руки в руку перед животом и за спиной
  around: { seq: [fpose({ ox: 0, oy: 0.08, oz: 0.25, legs: [fleg(7), fleg(7)], arms: [{ ik: 1, tx: -0.03, ty: 0.08, tz: 0.25, fw: 40 }, { ik: 1, tx: 0.03, ty: 0.08, tz: 0.25, fw: 40 }] }), fpose({ ox: 0.177, oy: 0.08, oz: 0.177, legs: [fleg(7), fleg(7)], arms: [{ ik: 1, tx: -0.19, ty: -0.16, tz: 0.02, fw: 40 }, { ik: 1, tx: 0.198, ty: 0.08, tz: 0.156, fw: 40 }] }), fpose({ ox: 0.25, oy: 0.08, oz: 0, legs: [fleg(7), fleg(7)], arms: [{ ik: 1, tx: -0.19, ty: -0.16, tz: 0.02, fw: 40 }, { ik: 1, tx: 0.25, ty: 0.08, tz: -0.03, fw: 40 }] }), fpose({ ox: 0.177, oy: 0.08, oz: -0.177, legs: [fleg(7), fleg(7)], arms: [{ ik: 1, tx: -0.19, ty: -0.16, tz: 0.02, fw: 40 }, { ik: 1, tx: 0.156, ty: 0.08, tz: -0.198, fw: 40 }] }), fpose({ ox: 0, oy: 0.08, oz: -0.25, legs: [fleg(7), fleg(7)], arms: [{ ik: 1, tx: 0.03, ty: 0.08, tz: -0.25, fw: 40 }, { ik: 1, tx: -0.03, ty: 0.08, tz: -0.25, fw: 40 }] }), fpose({ ox: -0.177, oy: 0.08, oz: -0.177, legs: [fleg(7), fleg(7)], arms: [{ ik: 1, tx: -0.156, ty: 0.08, tz: -0.198, fw: 40 }, { ik: 1, tx: 0.19, ty: -0.16, tz: 0.02, fw: 40 }] }), fpose({ ox: -0.25, oy: 0.08, oz: 0, legs: [fleg(7), fleg(7)], arms: [{ ik: 1, tx: -0.25, ty: 0.08, tz: -0.03, fw: 40 }, { ik: 1, tx: 0.19, ty: -0.16, tz: 0.02, fw: 40 }] }), fpose({ ox: -0.177, oy: 0.08, oz: 0.177, legs: [fleg(7), fleg(7)], arms: [{ ik: 1, tx: -0.198, ty: 0.08, tz: 0.156, fw: 40 }, { ik: 1, tx: 0.19, ty: -0.16, tz: 0.02, fw: 40 }] })], p: 3.2, w: "obj", hold: "kb", guide: [{ at: "obj" }] },
  // Повороты корпуса сидя (анфас): корпус отклонён назад, гантель перед животом уходит то вправо, то влево
  twist: { seq: [fpose({ tw: 0, hd: 0, lb: 40, legs: [fleg(160, 150, 0, 0.4, 0.53), fleg(160, 150, 0, 0.4, 0.53)], arms: [farm(-1.8, 103, 114), farm(-1.8, 103, 114)] }), fpose({ tw: 46, hd: 10, lb: 40, legs: [fleg(160, 150, 0, 0.4, 0.53), fleg(160, 150, 0, 0.4, 0.53)], arms: [farm(-1.8, 103, 114), farm(-1.8, 103, 114)] }), fpose({ tw: 0, hd: 0, lb: 40, legs: [fleg(160, 150, 0, 0.4, 0.53), fleg(160, 150, 0, 0.4, 0.53)], arms: [farm(-1.8, 103, 114), farm(-1.8, 103, 114)] }), fpose({ tw: -46, hd: -10, lb: 40, legs: [fleg(160, 150, 0, 0.4, 0.53), fleg(160, 150, 0, 0.4, 0.53)], arms: [farm(-1.8, 103, 114), farm(-1.8, 103, 114)] })], p: 2.6, anchor: "hip", legsFront: true, w: "chest", guide: [{ at: "waist", rx: 0.3, ry: 0.07, swing: 55 }] },
  // Ходьба «пятка к носку»: короткие шаги, пятка ставится прямо перед носком другой ноги
  heelToe: { seq: [fpose({ legs: [{ h: -6, k: 0, lift: 0, lz: -1 }, { h: -6, k: 0, lift: 0, lz: 1 }], arms: [farm(48, 10), farm(48, 10)] }), fpose({ legs: [{ h: -2, k: 28, lift: 0.12, lz: 0.3 }, { h: -6, k: 0, lift: 0, lz: 0 }], arms: [farm(52, 12), farm(44, 10)] }), fpose({ legs: [{ h: -6, k: 0, lift: 0, lz: 1 }, { h: -6, k: 0, lift: 0, lz: -1 }], arms: [farm(48, 10), farm(48, 10)] }), fpose({ legs: [{ h: -6, k: 0, lift: 0, lz: 0 }, { h: -2, k: 28, lift: 0.12, lz: 0.3 }], arms: [farm(44, 10), farm(52, 12)] })], p: 2.8 },
  // Касания пятками пола лёжа: из положения «колени над тазом» согнутая нога опускается и касается пола пяткой
  heelTap: { a: SUPINE({ legs: [leg(180, 90, 180), leg(180, 90, 180)] }), b: SUPINE({ legs: [leg(132, 100, 95), leg(180, 90, 180)] }), alt: true, p: 2.2, anchor: "hip" },
  // Опускания пяток со ступеньки: носки на краю, пятки медленно уходят ниже ступеньки
  heelDrop: { a: pose({ legs: [leg(0, 0, 52), leg(0, 0, 52)], arms: [arm(40, 10), arm(40, 10)] }), b: pose({ legs: [leg(0, 0, 118), leg(0, 0, 118)], arms: [arm(40, 10), arm(40, 10)] }), p: 3.4, anchor: "toes", standY: 0.2, props: ["stepEdge"] },
  // Изометрия кисти и шеи — без движения: мышцы работают, суставы неподвижны
  gripHold: { a: pose({ arms: [arm(55, 35), arm(55, 35)] }) },
  neckIsoF: { a: fpose({ arms: [farm(10, 6), farm(57, 129, 143)] }) },
  // Скрёстный шаг: шаг в сторону, вторая нога заходит сзади накрест, снова шаг и приставить
  crossStep: { seq: [fpose({ legs: [fleg(4), fleg(4)], arms: [farm(14, 6), farm(14, 6)] }), fpose({ legs: [fleg(4), fleg(14, 14, 0.1)], arms: [farm(28, 10), farm(28, 10)] }), fpose({ legs: [fleg(6), fleg(20)], arms: [farm(24, 10), farm(24, 10)] }), fpose({ legs: [{ h: -12, k: 8, lift: 0.05, lz: -1 }, fleg(12)], arms: [farm(30, 10), farm(30, 10)] }), fpose({ legs: [fleg(6), fleg(20)], arms: [farm(24, 10), farm(24, 10)] }), fpose({ legs: [fleg(4), fleg(14, 14, 0.1)], arms: [farm(20, 8), farm(20, 8)] })], alt: true, p: 3.6 },
  // «Конькобежец» без прыжка: шаг в сторону на согнутую ногу, другая уходит назад накрест
  skaterX: { seq: [fpose({ legs: [fleg(5), fleg(5)], arms: [farm(14, 6), farm(14, 6)] }), fpose({ t: 3, legs: [fleg(5), fleg(12, 16, 0.1)], arms: [farm(22, 8), farm(14, 8)] }), fpose({ t: 5, legs: [fleg(6), fleg(18, 22)], arms: [farm(30, 10), farm(14, 8)] }), fpose({ t: 8, legs: [{ h: -16, k: 20, lift: 0.08, lz: -1 }, fleg(16, 26)], arms: [farm(42, 12), farm(8, 6)] }), fpose({ t: 5, legs: [fleg(6), fleg(18, 22)], arms: [farm(30, 10), farm(14, 8)] }), fpose({ t: 3, legs: [fleg(5), fleg(12, 16, 0.1)], arms: [farm(22, 8), farm(14, 8)] })], alt: true, p: 3 },
};

// Какой узор у какого упражнения
const MAP = {
  march: ["march", "fastMarch", "boxStep"], heelToe: ["heelToe"], toeWalk: ["toeWalk"], heelWalk: ["heelWalk"], highKnees: ["highKnees"],
  jog: ["jog"], heelKicks: ["heelKicks"], sway: [], neckNod: [], hipCircle: ["hipCircles"], turns: ["torsoTurns"], around: ["kbAround"], neckTilts: ["neckMob"],
  handsForward: ["wristFlex"], wristCircle: ["wristMob"], gripHold: ["gripIso", "wristExtIso"], legSwings: ["legSwings"], inchworm: ["inchworm"],
  hinge: ["hipHinge", "goodMorning", "rdl", "bbRdl"], dislocate: ["bandDislocate"], squat: ["squat", "bbSquat", "squatPause"],
  chairSquat: ["chairSquat"], goblet: ["gobletSquat", "kbGoblet"], bridge: ["bridge", "dbHipThrust", "bbHipThrust"],
  singleBridge: ["singleBridge"], bridgeMarch: ["bridgeMarch"], bridgeHold: ["bridgeHold"],
  lunge: ["splitSquat", "reverseLunge", "dbLunge", "bulgarian", "curtsyLunge"], splitHold: ["splitHold"], stepUp: ["stepUp", "dbStepUp", "stepDown"],
  deadlift: ["dbDeadlift", "kbDeadlift", "bbDeadlift"], swing: ["dbSwing", "kbSwing"],
  calfRaise: ["calfRaise", "singleCalf", "dbCalfRaise"], heelDrop: ["heelDrops"], calfHold: ["calfHold"], wallSit: ["wallSit"],
  wallSitShort: ["wallSitShort"], squatHold: ["squatHold"], squatJump: ["squatJump"], singleHinge: ["singleRdl"], nordic: ["nordic"],
  sideLying: ["sideLeg"], wallPush: ["wallPush", "fistPush"], incline: ["inclinePush"], kneePush: ["kneePush", "narrowKneePush"], pushUp: ["pushUp"],
  pikePush: ["pikePush"], dip: ["chairDip"], chestPress: ["bandPress", "pallof"], floorPress: ["floorPress", "dbFly"],
  benchPress: ["dbBench", "dbIncline", "bbBench"], skull: ["dbSkull"], pullover: ["dbPullover"],
  curl: ["bicepsCurl", "hammerCurl", "bbCurl"], tricepsDown: ["tricepsBand"], press: ["standPress", "kbPress", "bbPress"],
  seatedPress: ["ohPress", "arnoldPress"], ohTriceps: ["ohTriceps"], kickback: ["kickback"], frontRaise: ["frontRaise"],
  superman: ["superman"], backExtHold: ["backExtHold"], proneYT: ["proneYT", "proneW", "scapHold", "reverseSnowAngel"], standRow: ["bandRow"],
  row: ["dbRow", "bentRow", "kbRow", "bbRow", "chestRow"], reverseFly: ["reverseFly"], hang: ["deadHang"],
  pullUp: ["negPullUp", "pullUp", "bandPullUp"], shrug: ["dbShrug"], renegade: ["renegadeRow"], doorRow: ["doorRow"],
  deadBug: ["deadBug", "dbDeadBug"], heelTap: ["heelTaps"], deadBugHold: ["deadBugHold"], birdDog: ["birdDog"], catCow: ["catCow"],
  standingKnee: ["standingKnee"], plank: ["plank"], kneePlank: ["kneePlank"], sidePlank: ["sidePlankFull", "copenhagen"], sidePlankKnee: ["sidePlank"],
  hollow: ["hollowHold"], crunch: ["crunch"], carry: ["farmerCarry", "suitcaseCarry"], kbCarry: ["kbCarry"],
  twist: ["russianTwist"], getUp: ["kbGetUp"], seatedMarch: ["seatedMarch"], armPedal: ["armBike"],
  ankleCircle: ["ankleRolls", "ankleAlphabet"], seatedAnkle: ["towelScrunch"],
  sitIso: ["adductorSqueeze", "abductorPress", "bicepsIso", "ankleIsoOut", "ankleIsoIn"], shadowBox: ["shadowBox"], mountain: ["mountain"],
  burpee: ["burpeeLow"], thruster: ["thruster"], clean: ["kbClean"], bear: ["bearCrawl"], balance: ["singleLeg", "pillowBalance"],
  starReach: ["starReach", "clockReach"], longSit: ["quadSet"], lieIso: ["gluteSqueeze", "hamIso", "bellyBreath"],
  standIso: ["shoulderER", "shoulderIR", "shoulderAbd", "pressHold"], openBook: ["openBook"], hipFlexor: ["hipFlexor"],
  thoracicReach: ["thoracicReach"], sphinx: ["sphinx"], cobra: ["cobra"], kneesToChest: ["kneesToChest", "figure4"],
  downDog: ["downDog"], worldStretch: ["worldStretch"], childPose: ["childPose"], forwardFold: ["hamStretch"],
  strapHam: ["strapHam"], quadStretch: ["quadStretch"], calfStretch: ["calfStretch"], chestStretch: ["chestStretch"],
  tricepsStretch: ["tricepsStretch"], butterfly: ["butterfly"], seatedFold: ["seatedFold"], reachUp: ["reachUp"],
  warrior: ["warrior"], tree: ["tree"], sunFlow: ["sunFlow"],
  jacks: ["jacks"], stepJack: ["stepJack"], armCircles: ["armCircles"], lateralRaise: ["lateralRaise"], pullApart: ["pullApart"],
  wallAngel: ["wallAngel"], sumo: ["plieSquat", "dbSumo", "kbSumo"], sideLunge: ["lateralLunge", "cossack"],
  sideStep: ["bandWalk"], stepSide: ["stepTouch"], crossStep: ["grapevine"], skaterX: ["skater"], legSide: ["legSwingSide"], sideBend: ["latStretch"], chop: ["woodchop"],
  neckTilt: ["neckStretch"], neckIsoF: ["neckIso"], halo: ["kbHalo"],
  tandem: ["tandemStand"], legBack: ["backLegRaise"], kneeLift: ["kneeLiftHold"], weightShift: ["weightShift"], toeRaise: ["toeRaise"],
  rock: ["heelToeRock"], hop: ["jumpRope"], stepBackReach: ["stepBackReach"], chinTuck: ["chinTuck"], shoulderRoll: ["shoulderRolls"],
  handsBehind: ["chestBehind"], thread: ["thread"], kneeToWall: ["kneeToWall"], bicycle: ["bicycleSlow"], reverseCrunch: ["reverseCrunch"],
  legLower: ["legLowers"], bearHold: ["bearHold"], shoulderTap: ["shoulderTaps"], facePull: ["facePull"], swimmer: ["proneSwim"],
  bandCurl: ["bandCurl"], bandPressUp: ["bandOhPress"], bandLateral: ["bandLateral"], seatedPunch: ["seatedPunch"], happyBaby: ["happyBaby"],
  sideBendWarm: ["sideBends"], shuffle: ["lateralShuffle"]
};
for (const pat of Object.values(P)) if (pat.seq && !pat.a) pat.a = pat.seq[0];
const PATTERN_OF = {};
for (const [pid, list] of Object.entries(MAP)) for (const id of list) PATTERN_OF[id] = pid;
const GROUP_PATTERN = { warm: "march", legs: "squat", push: "pushUp", pull: "row", core: "plank", cardio: "march", balance: "balance", iso: "standIso", mobility: "sway", cool: "forwardFold" };
export const patternOf = id => PATTERN_OF[id] || GROUP_PATTERN[(EX[id] || {}).group] || "stand";

// ----- Кинематика -----
function sideJoints(p) {
  const hip = [0, 1];
  const sh = add(hip, upv(p.t), LEN.torso + p.sh);
  const neck = add(sh, upv(p.t + p.n), LEN.neck);
  const head = add(neck, upv(p.t + p.n), LEN.head);
  // Круги плечами: плечевой сустав уходит вперёд-назад (sf), голова остаётся на месте
  const sha = add(add(sh, [Math.cos(p.t * D), -Math.sin(p.t * D)], p.sf || 0), upv(p.t), p.se || 0);
  const legs = p.legs.map(L => {
    const knee = add(hip, down(L.h), LEN.thigh);
    const ankle = add(knee, down(L.h - L.k), LEN.shank);
    // Поворот стопы внутрь-наружу (вращения стопой) в профиль виден как её укорочение
    const q = Math.cos((L.fy || 0) * D);
    const toe = add(ankle, down(L.f), LEN.foot * q);
    const heel = add(ankle, down(L.f), -LEN.heel * q);
    return { knee, ankle, toe, heel };
  });
  const arms = p.arms.map(A => {
    const elbow = add(sha, down(A.s), LEN.upper);
    const wrist = add(elbow, down(A.s + A.e), LEN.fore);
    const hand = add(wrist, down(A.s + A.e + A.w), LEN.hand);
    return { elbow, wrist, hand };
  });
  return { hip, sh, shArm: sha, neck, head, legs, arms, shL: sh, shR: sh, hipL: hip, hipR: hip, curve: p.curve || 0 };
}
// Для объёмной схемы: глубина бедра, колена и стопы анфас — нога, которая в проекции короче своей
// длины, смотрит на зрителя (голень на полу при стоянии на коленях уходит назад); lz — шаг вперёд-назад
const legDepth3 = (hip, knee, ankle, L) => {
  const deep = (a, b, len) => Math.sqrt(Math.max(0, len * len - (b[0] - a[0]) ** 2 - (b[1] - a[1]) ** 2));
  const z0 = (L.lz || 0) * 0.1;
  const zk = z0 + deep(hip, knee, LEN.thigh);
  return [z0, zk, zk + (knee[1] < 0.16 && ankle[1] > knee[1] - 0.05 ? -1 : 1) * deep(knee, ankle, LEN.shank)];
};
function frontJoints(p) {
  const pelvis = [0, 1];
  const right = [Math.cos(p.t * D), -Math.sin(p.t * D)];
  // Таз остаётся ровным, когда корпус наклоняется в сторону (иначе одна стопа отрывается от пола);
  // перенос веса с ноги на ногу задаётся отдельным наклоном таза tp
  const tp = p.tp || 0, pr = [Math.cos(tp * D), -Math.sin(tp * D)];
  // lb — корпус отклонён назад (к зрителю или от него): в проекции торс короче
  const lk = Math.cos((p.lb || 0) * D);
  const chestTop = add(pelvis, upv(p.t), 0.46 * lk);
  const neck = add(pelvis, upv(p.t), (0.5 + LEN.neck) * lk);
  // Кивок (nd): голова наклоняется к груди и в проекции чуть опускается
  const head = add(neck, upv(p.t + p.n), LEN.head - (p.nd || 0) * 0.025);
  const hips = [-1, 1].map(sg => add(pelvis, pr, sg * 0.09));
  // Поворот корпуса вокруг вертикали (tw): плечи и руки объёмные, на экране — их проекция.
  // z — глубина: что ближе к зрителю, рисуется поверх корпуса
  const tw = (p.tw || 0) * D, cw = Math.cos(tw), sw = Math.sin(tw);
  const shw = opts.sex === "f" ? 0.16 : 0.18;
  const shs = [-1, 1].map(sg => add(chestTop, right, sg * shw * cw));
  const shz = [-1, 1].map(sg => -sg * shw * sw);
  const legs = p.legs.map((L, i) => {
    const sg = i === 0 ? -1 : 1;
    // lift — подъём стопы к зрителю; ft и fs — укорочение бедра и голени, которые смотрят на зрителя
    const lift = L.lift || 0, ft = L.ft || 1, fs = L.fs || 1;
    const dz = -(L.lz || 0) * 0.028;
    const knee = add(add(hips[i], [sg * Math.sin(L.h * D), -Math.cos(L.h * D)], LEN.thigh * ft), [0, lift * 0.5 + dz * 0.5]);
    const a2 = L.h - L.k;
    const ankle = add(add(knee, [sg * Math.sin(a2 * D), -Math.cos(a2 * D)], LEN.shank * fs), [0, lift * 0.5 + dz * 0.5]);
    const toe = add(ankle, [sg * 0.03, -0.02]);
    return { knee, ankle, toe, heel: ankle, z3: legDepth3(hips[i], knee, ankle, L) };
  });
  const arms = p.arms.map((A0, i) => {
    const sg = i === 0 ? -1 : 1;
    // ik — кисть идёт к точке (tx, ty, tz) от таза: углы руки считаются в каждом кадре,
    // поэтому руки следуют за гирей по кругу, не перекручиваясь между ключевыми позами
    const A = A0.ik ? armToward(sg, [A0.tx, A0.ty, A0.tz], shw, lk, A0.fw || 0) : A0;
    // fw — рука уходит из плоскости рисунка вперёд, к зрителю (90° — прямо вперёд)
    const fw = (A.fw || 0) * D;
    const dir = a => {
      const lx = sg * Math.sin(a * D) * Math.cos(fw), ly = -Math.cos(a * D), lz = Math.sin(a * D) * Math.sin(fw);
      return [lx * cw + lz * sw, ly, -lx * sw + lz * cw];
    };
    const d1 = dir(A.s), d2 = dir(A.s + A.e);
    const elbow = add(shs[i], d1, LEN.upper);
    const wrist = add(elbow, d2, LEN.fore);
    const hand = add(wrist, d2, LEN.hand);
    const z = shz[i] + d1[2] * LEN.upper + d2[2] * (LEN.fore + LEN.hand) * 0.6;
    const ze = shz[i] + d1[2] * LEN.upper, zw = ze + d2[2] * LEN.fore;
    return { elbow, wrist, hand, sh: shs[i], z, zh: shz[i] + d1[2] * LEN.upper + d2[2] * (LEN.fore + LEN.hand), z3: [shz[i], ze, zw, zw + d2[2] * LEN.hand] };
  });
  // lz — нога ближе (+) или дальше (−) от зрителя: при скрёстном шаге задняя нога уходит за переднюю
  legs.forEach((L, i) => { L.z = p.legs[i].lz || 0; });
  const obj = p.ox !== undefined || p.oy !== undefined ? [pelvis[0] + (p.ox || 0), pelvis[1] + (p.oy || 0)] : null;
  return { front: true, hip: pelvis, sh: chestTop, neck, head, legs, arms, hips, shs, chestTop, tw: p.tw || 0, hd: (p.tw || 0) + (p.hd || 0), nd: p.nd || 0, lb: p.lb || 0, obj, objZ: p.oz };
}
// Углы руки анфас (s, e, fw), чтобы кисть пришла в точку: плоскость руки — вертикальная, через плечо
// и точку; локоть — снизу. Когда точка почти над плечом, плоскость плавно уходит к fwDef
function armToward(sg, t, shw, lk, fwDef) {
  const S = [sg * shw, 1 + 0.46 * lk, 0];
  const dx = t[0] - S[0], dy = 1 + t[1] - S[1], dz = t[2] - S[2];
  const rho = Math.hypot(dx, dz);
  const w = Math.max(0, Math.min(1, (rho - 0.02) / 0.06));
  const aim = Math.atan2(dz, sg * dx) / D;
  let delta = ((aim - fwDef + 540) % 360) - 180;
  const fw = fwDef + delta * w;
  const a = LEN.upper, b = LEN.fore + LEN.hand;
  const d = Math.min(a + b - 1e-4, Math.max(0.06, Math.hypot(rho, dy)));
  const phi = Math.atan2(rho, -dy) / D;
  const cl = v => Math.max(-1, Math.min(1, v));
  const al = Math.acos(cl((a * a + d * d - b * b) / (2 * a * d))) / D;
  const inner = Math.acos(cl((a * a + b * b - d * d) / (2 * a * b))) / D;
  return { s: phi - al, e: 180 - inner, fw };
}

const lerp = (a, b, k) => a + (b - a) * k;
// Параметры позы, которые плавно меняются; у конечностей — значения по умолчанию
const POSE_KEYS = ["t", "n", "sh", "air", "lift", "tp", "curve", "tw", "hd", "nd", "sf", "se", "lb", "ox", "oy", "oz", "hs"];
const LIMB_DEF = { f: 90, ft: 1, fs: 1 };
const limbVal = (L, key) => (L[key] !== undefined ? L[key] : LIMB_DEF[key] !== undefined ? LIMB_DEF[key] : 0);
const limbKeys = list => [...new Set(list.flatMap(L => Object.keys(L)))];
function mix(A, B, k) {
  const o = { ...A };
  for (const key of POSE_KEYS) o[key] = lerp(A[key] || 0, B[key] || 0, k);
  const limbs = (la, lb) => la.map((L, i) => { const M = lb[i], r = {}; for (const f of limbKeys([L, M])) r[f] = lerp(limbVal(L, f), limbVal(M, f), k); return r; });
  o.legs = limbs(A.legs, B.legs);
  o.arms = limbs(A.arms, B.arms);
  return o;
}
// Плавная поза по четырём соседним (сплайн Катмулла — Рома): круговые движения без рывков на ключевых позах
function blend4(P0, P1, P2, P3, f) {
  const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
  const o = { ...P1 };
  for (const key of POSE_KEYS) o[key] = cr(P0[key] || 0, P1[key] || 0, P2[key] || 0, P3[key] || 0);
  const limbs = name => P1[name].map((L, i) => {
    const q = [P0[name][i], L, P2[name][i], P3[name][i]], r = {};
    for (const key of limbKeys(q)) r[key] = cr(...q.map(x => limbVal(x, key)));
    return r;
  });
  o.legs = limbs("legs");
  o.arms = limbs("arms");
  return o;
}
const mirrorAll = Pz => ({ ...Pz, t: Pz.front ? -Pz.t : Pz.t, n: Pz.front ? -Pz.n : Pz.n, tp: Pz.front ? -(Pz.tp || 0) : 0, tw: Pz.front ? -(Pz.tw || 0) : 0, hd: Pz.front ? -(Pz.hd || 0) : 0, ox: Pz.front ? -(Pz.ox || 0) : Pz.ox, legs: [Pz.legs[1], Pz.legs[0]], arms: [Pz.arms[1], Pz.arms[0]].map(A => (Pz.front && A.ik ? { ...A, tx: -A.tx } : A)) });

// Вторая сторона: у alt: "arms" меняются местами только руки
const mirrorOf = pat => (pat.alt === "arms" ? Pz => ({ ...Pz, arms: [Pz.arms[1], Pz.arms[0]] }) : mirrorAll);

// Точки, по которым фигура стоит на земле, и их «толщина»
function contactPoints(J) {
  const pts = [[J.hip, 0.1], [J.sh, 0.1], [J.head, LEN.head]];
  for (const L of J.legs) pts.push([L.knee, 0.06], [L.ankle, 0.035], [L.toe, 0.03], [L.heel, 0.03]);
  for (const A of J.arms) pts.push([A.elbow, 0.045], [A.wrist, 0.035], [A.hand, 0.03]);
  return pts;
}
const anchorX = (J, anchor) => {
  switch (anchor) {
    case "hip": return J.hip[0];
    case "shoulder": return J.sh[0];
    case "near": return J.legs[0].ankle[0];
    case "far": return J.legs[1].ankle[0];
    case "knees": return (J.legs[0].knee[0] + J.legs[1].knee[0]) / 2;
    case "hands": return (J.arms[0].hand[0] + J.arms[1].hand[0]) / 2;
    case "toes": return (J.legs[0].toe[0] + J.legs[1].toe[0]) / 2;
    case "heels": return (J.legs[0].heel[0] + J.legs[1].heel[0]) / 2;
    case "leg0": return J.legs[0].ankle[0];
    case "leg1": return J.legs[1].ankle[0];
    default: return (J.legs[0].ankle[0] + J.legs[1].ankle[0]) / 2;
  }
};
function place(pat, Pz) {
  const J = Pz.front ? frontJoints(Pz) : sideJoints(Pz);
  let dy;
  if (pat.hang) dy = pat.hang - J.arms[0].hand[1];
  // носки стоят на краю ступеньки высотой standY, пятки свободно опускаются ниже
  else if (pat.standY !== undefined) dy = pat.standY + 0.03 - Math.min(J.legs[0].toe[1], J.legs[1].toe[1]);
  else {
    // В профиль высоту задают тело и ноги: рука, которая опускается ниже лежащего тела (за голову,
    // к полу у груди), не приподнимает его — кисть потом сама встаёт на пол
    // (hs — доля опоры на руки: в прыжке ногами назад тело на мгновение держится на кистях)
    const pts = contactPoints(J), low = list => -Math.min(...list.map(([p, r]) => p[1] - r));
    const all = low(pts), body = Pz.front ? all : low(pts.slice(0, 11));
    dy = body + (all - body) * Math.min(1, Math.max(0, Pz.hs || 0)) + (Pz.air || 0) + (Pz.lift || 0);
  }
  return { J, dy };
}
const shiftJ = (J, dx, dy) => {
  const m = p => [p[0] + dx, p[1] + dy];
  const out = { ...J, hip: m(J.hip), sh: m(J.sh), neck: m(J.neck), head: m(J.head) };
  out.legs = J.legs.map(L => ({ knee: m(L.knee), ankle: m(L.ankle), toe: m(L.toe), heel: m(L.heel) }));
  out.arms = J.arms.map(A => ({ ...A, elbow: m(A.elbow), wrist: m(A.wrist), hand: m(A.hand), sh: A.sh && m(A.sh) }));
  if (J.shArm) out.shArm = m(J.shArm);
  if (J.obj) out.obj = m(J.obj);
  if (J.front) {
    out.hips = J.hips.map(m);
    out.shs = J.shs.map(m);
    out.chestTop = m(J.chestTop);
  }
  return out;
};

// ----- Рисование -----
// Фигура собирается из гладких форм: сужающиеся «капсулы» рук и ног, торс с грудью, спиной и ягодицами,
// голова с направлением взгляда, тень на полу. Мышцы, которые работают в упражнении, подсвечиваются.
const RAD = { thigh: [0.074, 0.05], shank: [0.05, 0.033], foot: [0.034, 0.025], upper: [0.05, 0.037], fore: [0.037, 0.027], hand: [0.026, 0.03], neck: [0.042, 0.04] };
const FRAD = { thigh: [0.08, 0.052], shank: [0.052, 0.034], foot: [0.034, 0.03], upper: [0.05, 0.038], fore: [0.038, 0.028], hand: [0.027, 0.03], neck: [0.045, 0.042] };
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const unit2 = v => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const lerp2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const sv = p => [p[0], -p[1]];
const fx = v => v.toFixed(3);
// Капсула от a до b с радиусами ra и rb — бедро, голень, плечо, предплечье
function capsulePath(a, b, ra, rb, steps = 6) {
  const A = sv(a), B = sv(b);
  let dx = B[0] - A[0], dy = B[1] - A[1];
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) { dx = 0; dy = 1; } else { dx /= L; dy /= L; }
  const nx = -dy, ny = dx;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const f = (i / steps) * Math.PI, c = Math.cos(f), sn = Math.sin(f);
    d += `${i ? "L" : "M"}${fx(B[0] + rb * (nx * c + dx * sn))} ${fx(B[1] + rb * (ny * c + dy * sn))}`;
  }
  for (let i = 0; i <= steps; i++) {
    const f = (i / steps) * Math.PI, c = Math.cos(f), sn = Math.sin(f);
    d += `L${fx(A[0] - ra * (nx * c + dx * sn))} ${fx(A[1] - ra * (ny * c + dy * sn))}`;
  }
  return `${d}Z`;
}
// Плавный замкнутый контур через точки (сплайн Катмулла — Рома)
function smoothPath(pts) {
  const n = pts.length;
  let d = `M${fx(pts[0][0])} ${fx(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${fx(p1[0] + (p2[0] - p0[0]) / 6)} ${fx(p1[1] + (p2[1] - p0[1]) / 6)} ${fx(p2[0] - (p3[0] - p1[0]) / 6)} ${fx(p2[1] - (p3[1] - p1[1]) / 6)} ${fx(p2[0])} ${fx(p2[1])}`;
  }
  return `${d}Z`;
}
// Торс в профиль: [доля длины от таза до плеч, отступ от оси]. Перед — грудь и живот, спина — ягодицы, поясница, лопатки
// ----- Телосложение: мужская и женская фигура -----
// front/back — профиль груди и спины [доля от таза до плеч, отступ от оси], half — полуширина анфас
const SHAPES = {
  m: {
    front: [[0, 0.085], [0.18, 0.095], [0.42, 0.088], [0.68, 0.114], [0.86, 0.108], [1, 0.068]],
    back: [[0, 0.102], [0.07, 0.124], [0.3, 0.084], [0.58, 0.098], [0.84, 0.11], [1, 0.08]],
    half: [[0.5, 0.055], [0.475, 0.17], [0.44, 0.2], [0.36, 0.165], [0.22, 0.125], [0.06, 0.15], [-0.04, 0.13]],
    hair: "short", sleeves: true, leggings: false
  },
  f: {
    front: [[0, 0.083], [0.18, 0.088], [0.4, 0.074], [0.58, 0.094], [0.69, 0.124], [0.79, 0.106], [0.9, 0.094], [1, 0.064]],
    back: [[0, 0.11], [0.07, 0.137], [0.3, 0.076], [0.58, 0.09], [0.84, 0.1], [1, 0.074]],
    half: [[0.5, 0.05], [0.475, 0.152], [0.44, 0.178], [0.36, 0.15], [0.22, 0.111], [0.06, 0.164], [-0.04, 0.143]],
    hair: "pony", sleeves: false, leggings: true
  }
};
const shapeOf = () => SHAPES[opts.sex] || SHAPES.m;
function torsoAxes(J) {
  const ax = sub2(J.sh, J.hip), L = Math.hypot(ax[0], ax[1]) || 1;
  const u = [ax[0] / L, ax[1] / L];
  return { L, u, f: [u[1], -u[0]] }; // f — направление груди
}
// curve — изгиб позвоночника: середина торса смещается к груди (+) или к спине (−)
const bow = (J, k) => (J.curve || 0) * Math.sin(Math.PI * Math.max(0, Math.min(1, k)));
function torsoSide(J, breath = 0, S = SHAPES.m) {
  const { L, u, f } = torsoAxes(J);
  const at = (k, off) => { const o = off + bow(J, k); return [J.hip[0] + u[0] * k * L + f[0] * o, J.hip[1] + u[1] * k * L + f[1] * o]; };
  // Грудная клетка «дышит»: верх торса чуть расширяется на вдохе
  const bw = k => 1 + breath * Math.max(0, Math.min(1, (k - 0.35) / 0.4));
  const pts = [at(-0.13, 0)];
  for (const [k, w] of S.front) pts.push(at(k, w * bw(k)));
  pts.push(at(1.06, 0));
  for (const [k, w] of S.back.slice().reverse()) pts.push(at(k, -w * bw(k)));
  return smoothPath(pts.map(sv));
}
// Поворот корпуса анфас: верх торса сужается (видна его глубина), середина груди смещается в сторону
// поворота. Таз не поворачивается — поворот нарастает от пояса к плечам
const twistAt = (J, y) => {
  const tw = (J.tw || 0) * D * Math.max(0, Math.min(1, (y - 0.08) / 0.34));
  return { k: Math.sqrt(Math.cos(tw) ** 2 + 0.3 * Math.sin(tw) ** 2), dx: 0.11 * Math.sin(tw) };
};
function frontAxes(J) {
  const u = unit2(sub2(J.chestTop, J.hip));
  return { u, r: [u[1], -u[0]] };
}
function torsoFront(J, breath = 0, S = SHAPES.m) {
  const { u, r } = frontAxes(J);
  const lk = Math.cos((J.lb || 0) * D);
  const at = (y, x) => { const t = twistAt(J, y), yy = y > 0 ? y * lk : y; return [J.hip[0] + u[0] * yy + r[0] * x * t.k, J.hip[1] + u[1] * yy + r[1] * x * t.k]; };
  const bw = y => 1 + breath * Math.max(0, Math.min(1, (y - 0.2) / 0.2));
  const pts = [];
  for (const [y, x] of S.half) pts.push(at(y, x * bw(y)));
  pts.push(at(-0.075, 0));
  for (const [y, x] of S.half.slice().reverse()) pts.push(at(y, -x * bw(y)));
  return smoothPath(pts.map(sv));
}
// Подсветка мышцы на сегменте: side 1 — передняя поверхность, -1 — задняя, 0 — весь сегмент
function musclePath(a, b, ra, rb, side, k0 = 0.06, k1 = 0.94) {
  const d = unit2(sub2(b, a)), ant = [-d[1], d[0]];
  const pa = lerp2(a, b, k0), pb = lerp2(a, b, k1);
  const r0 = ra + (rb - ra) * k0, r1 = ra + (rb - ra) * k1;
  if (!side) return capsulePath(pa, pb, r0 * 0.7, r1 * 0.7);
  return capsulePath([pa[0] + ant[0] * r0 * 0.38 * side, pa[1] + ant[1] * r0 * 0.38 * side], [pb[0] + ant[0] * r1 * 0.38 * side, pb[1] + ant[1] * r1 * 0.38 * side], r0 * 0.6, r1 * 0.6);
}
// Мышцы торса в профиль: [от, до, сдвиг к груди (+) или спине (−), радиусы]
const TORSO_PART = {
  chest: [0.6, 0.9, 0.056, 0.05, 0.044], abs: [0.14, 0.5, 0.048, 0.04, 0.042],
  upperBack: [0.58, 0.92, -0.058, 0.05, 0.05], lowerBack: [0.18, 0.5, -0.046, 0.04, 0.045], glute: [-0.02, 0.14, -0.07, 0.058, 0.05]
};
function torsoPartSide(J, part) {
  const [k0, k1, off, r0, r1] = TORSO_PART[part];
  const { L, u, f } = torsoAxes(J);
  const at = k => { const o = off + bow(J, k); return [J.hip[0] + u[0] * k * L + f[0] * o, J.hip[1] + u[1] * k * L + f[1] * o]; };
  return capsulePath(at(k0), at(k1), r0, r1);
}
// Мышцы торса анфас: грудь, пресс, низ живота и бёдра
const FRONT_PART = { chest: [[0.34, -0.1], [0.34, 0.1], 0.06], abs: [[0.08, 0], [0.27, 0], 0.052], glute: [[0.02, -0.11], [0.02, 0.11], 0.05] };
function torsoPartFront(J, part) {
  const [p0, p1, rr] = FRONT_PART[part];
  const { u, r } = frontAxes(J);
  const lk = Math.cos((J.lb || 0) * D);
  const at = ([y, x]) => { const t = twistAt(J, y), xx = x * t.k + t.dx, yy = y > 0 ? y * lk : y; return [J.hip[0] + u[0] * yy + r[0] * xx, J.hip[1] + u[1] * yy + r[1] * xx]; };
  return capsulePath(at(p0), at(p1), rr, rr);
}
// Нагрузка упражнения → что подсвечивать: [сегмент, сторона, доля яркости]
const LOAD_PARTS = {
  knee: [["thigh", 1]], hamstring: [["thigh", -1]], groin: [["thigh", 0, 0.55]], ankle: [["shank", -1]],
  hip: [["glute"]], chest: [["chest"]], abdomen: [["abs"]], upperBack: [["upperBack"]], lowerBack: [["lowerBack"]],
  shoulder: [["delt"]], elbow: [["upper", 0, 0.8]], wrist: [["fore", 0, 0.8]], neck: [["neck", 0, 0.8]]
};
const ALPHA = [0, 0.42, 0.62, 0.8];
function makePath(svg, cls, extra = {}) {
  const el = s("path", { class: cls, ...extra });
  svg.append(el);
  return el;
}
// Сборка фигуры: дальние рука и нога (бледнее), шея, торс в футболке, шорты, голова с волосами,
// ухом и лицом, ближние нога и рука. Кожа, одежда и обувь — разными цветами, на руках и ногах
// мягкая тень с теневой стороны. Мышцы, которые работают в упражнении, подсвечиваются поверх.
const LIGHT = unit2([0.55, 0.85]); // свет сверху и спереди
// Тень на сегменте: узкая капсула, сдвинутая к теневой стороне
function shadePath(a, b, ra, rb) {
  const d = unit2(sub2(b, a));
  let n = [-d[1], d[0]];
  if (n[0] * LIGHT[0] + n[1] * LIGHT[1] > 0) n = [-n[0], -n[1]];
  const pa = lerp2(a, b, 0.12), pb = lerp2(a, b, 0.86);
  const r0 = ra + (rb - ra) * 0.12, r1 = ra + (rb - ra) * 0.86;
  return capsulePath([pa[0] + n[0] * r0 * 0.45, pa[1] + n[1] * r0 * 0.45], [pb[0] + n[0] * r1 * 0.45, pb[1] + n[1] * r1 * 0.45], r0 * 0.5, r1 * 0.5);
}
// Кроссовок в профиль: пятка с задником, кант у щиколотки, язычок, шнуровка, носок и светлая
// подошва. Верх стопы всегда слева от направления «пятка → носок» (фигура смотрит вправо): раньше
// сторону выбирали по знаку, который у ровной стопы определяет погрешность вычислений, и в части
// кадров кроссовок переворачивался подошвой вверх
function shoeSide(L) {
  const f = unit2(sub2(L.toe, L.heel));
  const n = [-f[1], f[0]];
  const A = L.ankle;
  // повёрнутая стопа (вращения стопой) в профиль короче — укорачиваем и кроссовок
  const q = Math.min(1, Math.hypot(L.toe[0] - L.heel[0], L.toe[1] - L.heel[1]) / (LEN.foot + LEN.heel));
  const at = (kf, kn) => [A[0] + f[0] * kf * q + n[0] * kn, A[1] + f[1] * kf * q + n[1] * kn];
  const pts = [at(-0.06, -0.026), at(-0.074, -0.002), at(-0.066, 0.036), at(-0.036, 0.058), at(0.026, 0.06),
    at(0.096, 0.04), at(0.162, 0.026), at(0.204, 0.006), at(0.2, -0.02), at(0.12, -0.028)];
  return {
    shoe: smoothPath(pts.map(sv)), sole: capsulePath(at(-0.058, -0.025), at(0.198, -0.025), 0.0095, 0.0095, 4),
    // светлая полоска сбоку и шнуровка
    stripe: capsulePath(at(-0.035, 0.012), at(0.07, 0.03), 0.0055, 0.0045, 3),
    laces: capsulePath(at(0.035, 0.05), at(0.11, 0.034), 0.004, 0.004, 3)
  };
}
// Кроссовок анфас: носок к зрителю, чуть развёрнут наружу, снизу подошва
function shoeFront(L, sg) {
  const [x, y] = L.ankle;
  return {
    shoe: capsulePath([x - sg * 0.016, y - 0.02], [x + sg * 0.034, y - 0.022], 0.034, 0.033),
    sole: capsulePath([x - sg * 0.04, y - 0.045], [x + sg * 0.06, y - 0.045], 0.009, 0.009, 4)
  };
}
// Кисть: ладонь и большой палец со стороны груди
function handParts(A, rad) {
  const d = unit2(sub2(A.hand, A.wrist));
  let p = [-d[1], d[0]];
  if (p[0] < 0) p = [-p[0], -p[1]];
  const at = (k, s) => [A.wrist[0] + d[0] * k + p[0] * s, A.wrist[1] + d[1] * k + p[1] * s];
  return {
    palm: capsulePath(A.wrist, A.hand, rad[0], rad[1]),
    // пальцы мягко согнуты: округлый «кулак» у конца ладони со стороны ладони
    fist: capsulePath(at(0.05, 0.004), at(0.068, -0.004), rad[1] * 0.95, rad[1] * 0.78, 4),
    thumb: capsulePath(at(0.012, 0.016), at(0.046, 0.03), 0.011, 0.009, 4)
  };
}
// Волосы в профиль: шапочка от лба через макушку к затылку; хвост — у женской фигуры
function ponySide(J) {
  const hu = unit2(sub2(J.head, J.neck)), hf = [hu[1], -hu[0]];
  const at = (kf, ku) => [J.head[0] + hf[0] * kf + hu[0] * ku, J.head[1] + hf[1] * kf + hu[1] * ku];
  // хвост висит вниз под собственным весом, а не вдоль наклона головы
  const a = at(-0.09, 0.05), b = add(a, [-hf[0] * 0.03, 0], 1), c = [b[0], b[1] - 0.15];
  return smoothPath([a, at(-0.11, 0.07), add(b, [-0.035, -0.03]), add(c, [-0.012, 0]), c, add(c, [0.012, 0.01]), add(b, [0.012, -0.03]), at(-0.075, 0.03)].map(sv));
}
function hairSide(J) {
  const hu = unit2(sub2(J.head, J.neck)), hf = [hu[1], -hu[0]];
  const r = LEN.head;
  const pt = (deg, k) => { const a = deg * D; return [J.head[0] + (hf[0] * Math.cos(a) + hu[0] * Math.sin(a)) * r * k, J.head[1] + (hf[1] * Math.cos(a) + hu[1] * Math.sin(a)) * r * k]; };
  const pts = [];
  for (let deg = 52; deg <= 232; deg += 18) pts.push(pt(deg, deg > 200 ? 1.02 : 1.08));
  pts.push(pt(222, 0.72), pt(170, 0.34), pt(80, 0.62));
  return smoothPath(pts.map(sv));
}
// Волосы анфас: чёлка и макушка; при повороте головы пробор смещается, при кивке чёлка опускается
function hairFront(J, style = "short") {
  const up = unit2(sub2(J.head, J.neck)), rt = [up[1], -up[0]];
  const r = LEN.head, turn = Math.sin((J.hd || 0) * D) * 0.35, nod = (J.nd || 0) * 0.25;
  const pt = (deg, k) => { const a = deg * D; return [J.head[0] + (rt[0] * Math.cos(a) + up[0] * Math.sin(a)) * r * k, J.head[1] + (rt[1] * Math.cos(a) + up[1] * Math.sin(a)) * r * k]; };
  const pts = [];
  if (style === "pony") {
    // волосы собраны: пряди по бокам до мочек ушей и пучок хвоста над макушкой
    for (let deg = -28; deg <= 208; deg += 16) pts.push(pt(deg, deg > 60 && deg < 120 ? 1.1 : 1.08));
    pts.push(pt(212, 0.95), pt(200, 0.86), pt(165, 0.74 - nod), pt(120 - turn * 40, 0.55 - nod), pt(60 - turn * 40, 0.55 - nod), pt(15, 0.74 - nod), pt(-20, 0.86), pt(-32, 0.95));
    const bun = [];
    for (let deg = 0; deg < 360; deg += 30) { const a = deg * D; bun.push([J.head[0] + up[0] * r * 1.18 + rt[0] * turn * 0.02 + Math.cos(a) * 0.04, J.head[1] + up[1] * r * 1.18 + Math.sin(a) * 0.032]); }
    return smoothPath(pts.map(sv)) + smoothPath(bun.map(sv));
  } else {
    for (let deg = 0; deg <= 180; deg += 20) pts.push(pt(deg, 1.07));
    pts.push(pt(168, 0.78 - nod), pt(120 - turn * 40, 0.58 - nod), pt(60 - turn * 40, 0.58 - nod), pt(12, 0.78 - nod));
  }
  return smoothPath(pts.map(sv));
}
// Шорты в профиль: таз от низа до пояса, спереди и сзади чуть шире торса
function shortsSide(J, breath) {
  const { L, u, f } = torsoAxes(J);
  const at = (k, off) => { const o = off + bow(J, k); return [J.hip[0] + u[0] * k * L + f[0] * o, J.hip[1] + u[1] * k * L + f[1] * o]; };
  const w = 1.03 + breath;
  return smoothPath([at(-0.14, 0), at(0, 0.088 * w), at(0.17, 0.097 * w), at(0.19, 0), at(0.17, -0.104 * w), at(0.07, -0.12 * w), at(-0.03, -0.098 * w)].map(sv));
}
function shortsFront(J) {
  const r = unit2(sub2(J.hips[1], J.hips[0])), u = [-r[1], r[0]];
  const at = (y, x) => [J.hip[0] + u[0] * y + r[0] * x, J.hip[1] + u[1] * y + r[1] * x];
  return smoothPath([at(0.11, 0.148), at(0.06, 0.156), at(-0.04, 0.136), at(-0.08, 0), at(-0.04, -0.136), at(0.06, -0.156), at(0.11, -0.148), at(0.12, 0)].map(sv));
}
// Сборка фигуры: дальние рука и нога (бледнее), шея, торс в одежде, голова с волосами и лицом,
// ближние нога и рука. Анфас каждая рука — своя группа: при повороте корпуса рука, ушедшая назад,
// рисуется за телом, вышедшая вперёд — перед ним. legsFront — сидя анфас ноги ближе к зрителю
function buildRig(svg, front, load = {}, { legsFront = false } = {}) {
  const S = shapeOf();
  const R = { front, overlays: [], parts: [], S };
  svg.append(s("line", { class: "d-ground", x1: -1.25, y1: 0.012, x2: 1.25, y2: 0.012, "stroke-width": 0.02 }));
  R.shadow = s("ellipse", { class: "d-shadow", cx: 0, cy: 0.004, rx: 0.3, ry: 0.032 });
  svg.append(R.shadow);
  R.props = s("g", { class: "d-props" });
  svg.append(R.props);
  const work = [];
  for (const [key, lv] of Object.entries(load)) for (const [seg, side = 0, k = 1] of LOAD_PARTS[key] || []) work.push({ seg, side, alpha: ALPHA[Math.min(3, lv)] * k });
  const base = front ? FRAD : RAD;
  // у женской фигуры тоньше руки и шея, бёдра чуть полнее
  const rad = opts.sex === "f" ? { ...base, thigh: [base.thigh[0] * 1.03, base.thigh[1] * 0.96], shank: [base.shank[0] * 0.92, base.shank[1] * 0.93], upper: [base.upper[0] * 0.88, base.upper[1] * 0.9], fore: [base.fore[0] * 0.88, base.fore[1] * 0.9], hand: [base.hand[0] * 0.9, base.hand[1] * 0.9], neck: [base.neck[0] * 0.86, base.neck[1] * 0.86] } : base;
  // part(группа, класс, функция пути) — элемент, который перерисовывается каждый кадр
  const part = (g, cls, fn) => { const el = makePath(g, cls); R.parts.push({ el, fn }); return el; };
  const overlay = (g, alpha, fn) => { const el = makePath(g, "d-work", { "fill-opacity": alpha.toFixed(2) }); R.overlays.push({ el, path: fn }); };
  const limbWork = (g, i, segs) => {
    for (const p of work) {
      if (!segs.includes(p.seg)) continue;
      if (p.seg === "delt") overlay(g, p.alpha, J => { const sh = shOf(J, i); return capsulePath(sh, lerp2(sh, J.arms[i].elbow, 0.42), rad.upper[0] * 1.12, rad.upper[0] * 0.92); });
      else if (p.seg === "thigh") overlay(g, p.alpha, J => musclePath(hipOf(J, i), J.legs[i].knee, ...rad.thigh, front ? 0 : p.side));
      else if (p.seg === "shank") overlay(g, p.alpha, J => musclePath(J.legs[i].knee, J.legs[i].ankle, ...rad.shank, front ? 0 : p.side, 0.06, 0.72));
      else if (p.seg === "upper") overlay(g, p.alpha, J => musclePath(shOf(J, i), J.arms[i].elbow, ...rad.upper, 0));
      else if (p.seg === "fore") overlay(g, p.alpha, J => musclePath(J.arms[i].elbow, J.arms[i].wrist, ...rad.fore, 0));
    }
  };
  const hipOf = (J, i) => (front ? J.hips[i] : J.hip);
  const shOf = (J, i) => (front ? J.arms[i].sh : J.shArm || J.sh);
  const leg = (g, i) => {
    part(g, "d-skin", J => capsulePath(hipOf(J, i), J.legs[i].knee, ...rad.thigh));
    part(g, "d-skin", J => capsulePath(J.legs[i].knee, J.legs[i].ankle, ...rad.shank));
    part(g, "d-shade", J => shadePath(hipOf(J, i), J.legs[i].knee, ...rad.thigh));
    part(g, "d-shade", J => shadePath(J.legs[i].knee, J.legs[i].ankle, ...rad.shank));
    const sg = i === 0 ? -1 : 1;
    const shoe = front ? J => shoeFront(J.legs[i], sg) : J => shoeSide(J.legs[i]);
    part(g, "d-shoe", J => shoe(J).shoe);
    part(g, "d-sole", J => shoe(J).sole);
    if (!front) {
      part(g, "d-sole", J => shoe(J).stripe);
      part(g, "d-lace", J => shoe(J).laces);
    }
    if (S.leggings) {
      // леггинсы до середины икры
      part(g, "d-shorts", J => capsulePath(hipOf(J, i), J.legs[i].knee, rad.thigh[0] * 1.04, rad.thigh[1] * 1.06));
      part(g, "d-shorts", J => capsulePath(J.legs[i].knee, lerp2(J.legs[i].knee, J.legs[i].ankle, 0.7), rad.shank[0] * 1.07, rad.shank[1] * 1.12));
      part(g, "d-hem", J => { const a = lerp2(J.legs[i].knee, J.legs[i].ankle, 0.7); return capsulePath(a, lerp2(J.legs[i].knee, J.legs[i].ankle, 0.715), rad.shank[1] * 1.12, rad.shank[1] * 1.12, 3); });
    } else {
      part(g, "d-shorts", J => capsulePath(hipOf(J, i), lerp2(hipOf(J, i), J.legs[i].knee, 0.44), rad.thigh[0] * 1.08, rad.thigh[0] * 1.03));
      part(g, "d-hem", J => { const a = lerp2(hipOf(J, i), J.legs[i].knee, 0.43), b = lerp2(hipOf(J, i), J.legs[i].knee, 0.45); return capsulePath(a, b, rad.thigh[0] * 1.04, rad.thigh[0] * 1.03, 3); });
    }
    limbWork(g, i, ["thigh", "shank"]);
  };
  const arm = (g, i) => {
    part(g, "d-skin", J => capsulePath(shOf(J, i), J.arms[i].elbow, ...rad.upper));
    part(g, "d-skin", J => capsulePath(J.arms[i].elbow, J.arms[i].wrist, ...rad.fore));
    part(g, "d-shade", J => shadePath(J.arms[i].elbow, J.arms[i].wrist, ...rad.fore));
    part(g, "d-skin", J => handParts(J.arms[i], rad.hand).palm);
    part(g, "d-skin", J => handParts(J.arms[i], rad.hand).fist);
    part(g, "d-skin", J => handParts(J.arms[i], rad.hand).thumb);
    if (S.sleeves) {
      part(g, "d-shirt", J => capsulePath(shOf(J, i), lerp2(shOf(J, i), J.arms[i].elbow, 0.44), rad.upper[0] * (front ? 1.06 : 1.08), rad.upper[0] * 1.04));
      part(g, "d-hem", J => { const a = shOf(J, i), b = J.arms[i].elbow; return capsulePath(lerp2(a, b, 0.425), lerp2(a, b, 0.445), rad.upper[0] * 1.05, rad.upper[0] * 1.04, 3); });
    } else {
      // майка: лямка на плече
      part(g, "d-shirt", J => capsulePath(shOf(J, i), lerp2(shOf(J, i), J.arms[i].elbow, 0.1), rad.upper[0] * 0.95, rad.upper[0] * 0.8));
    }
    limbWork(g, i, ["upper", "fore", "delt"]);
  };
  const torsoWork = g => {
    for (const p of work) {
      if (!["chest", "abs", "upperBack", "lowerBack", "glute"].includes(p.seg)) continue;
      if (front && (p.seg === "upperBack" || p.seg === "lowerBack")) continue;
      overlay(g, p.alpha, J => (front ? torsoPartFront(J, p.seg) : torsoPartSide(J, p.seg)));
    }
  };
  const fig = s("g", { class: "d-fig" });
  svg.append(fig);
  R.fig = fig;
  if (front) {
    R.legG = [0, 1].map(i => { const g = s("g"); leg(g, i); return g; });
    R.bodyG = s("g");
    const b = R.bodyG;
    part(b, "d-skin", J => capsulePath(J.chestTop, J.neck, ...rad.neck));
    part(b, "d-shirt", (J, br) => torsoFront(J, br, S));
    // вырез ворота: смещается при повороте корпуса
    part(b, "d-hem", J => {
      // округлый вырез ворота вокруг шеи; при повороте корпуса смещается вместе с грудью
      const { u, r } = frontAxes(J), t = twistAt(J, 0.46), c = add(J.chestTop, r, t.dx * 0.6);
      const p = (x, y) => add(add(c, r, x * t.k), u, y);
      return smoothPath([p(-0.062, 0.03), p(-0.04, -0.012), p(0, -0.03), p(0.04, -0.012), p(0.062, 0.03), p(0.04, 0.002), p(0, -0.014), p(-0.04, 0.002)].map(sv));
    });
    part(b, "d-shorts", J => shortsFront(J));
    part(b, "d-hem", J => { const r = unit2(sub2(J.hips[1], J.hips[0])), u = [-r[1], r[0]]; const c = add(J.hip, u, 0.105); return capsulePath(add(c, r, -0.15), add(c, r, 0.15), 0.008, 0.008, 3); });
    torsoWork(b);
    R.ears = [-1, 1].map(sg => part(b, "d-skin", J => { const { r } = frontAxes(J), ct = Math.cos((J.hd || 0) * D); return capsulePath([J.head[0] + r[0] * sg * 0.098 * ct, J.head[1] + r[1] * sg * 0.098 * ct - 0.006], [J.head[0] + r[0] * sg * 0.1 * ct, J.head[1] + r[1] * sg * 0.1 * ct - 0.02], 0.02, 0.016, 4); }));
    R.head = s("circle", { class: "d-skin", r: LEN.head });
    b.append(R.head);
    part(b, "d-hair", J => hairFront(J, S.hair));
    R.eyes = [0, 1].map(() => { const e = s("circle", { class: "d-eye", r: 0.0115 }); b.append(e); return e; });
    R.brows = [0, 1].map(() => { const e = s("line", { class: "d-brow" }); b.append(e); return e; });
    R.noseF = s("line", { class: "d-brow d-nose" });
    R.mouth = s("line", { class: "d-mouth" });
    b.append(R.noseF, R.mouth);
    R.armG = [0, 1].map(i => { const g = s("g"); arm(g, i); return g; });
    R.objG = s("g", { class: "d-props" });
    R.legsFront = legsFront;
    fig.append(...(legsFront ? [] : R.legG), R.bodyG, ...(legsFront ? R.legG : []), ...R.armG, R.objG);
    R.order = "";
  } else {
    const far = s("g", { class: "d-far-g" });
    fig.append(far);
    arm(far, 1);
    leg(far, 1);
    part(fig, "d-skin", J => capsulePath(J.sh, J.neck, ...rad.neck));
    if (S.hair === "pony") part(fig, "d-hair", J => ponySide(J));
    part(fig, "d-shirt", (J, b) => torsoSide(J, b, S));
    // вырез ворота у шеи
    part(fig, "d-hem", J => { const { L, u, f } = torsoAxes(J); const a = add(J.hip, u, L * 0.995); return capsulePath(add(a, f, 0.035), add(a, f, -0.035), 0.008, 0.008, 3); });
    part(fig, "d-shorts", (J, b) => shortsSide(J, b));
    part(fig, "d-hem", J => { const { L, u, f } = torsoAxes(J); const a = add(J.hip, u, L * 0.165); return capsulePath(add(a, f, 0.092), add(a, f, -0.1), 0.008, 0.008, 3); });
    torsoWork(fig);
    if (work.some(p => p.seg === "neck")) overlay(fig, work.find(p => p.seg === "neck").alpha, J => capsulePath(J.sh, J.neck, RAD.neck[0] * 0.8, RAD.neck[1] * 0.8));
    R.head = s("circle", { class: "d-skin", r: LEN.head });
    fig.append(R.head);
    part(fig, "d-hair", J => hairSide(J));
    R.ear = s("ellipse", { class: "d-ear", rx: 0.017, ry: 0.024 });
    R.nose = makePath(fig, "d-skin");
    R.eye = s("circle", { class: "d-eye", r: 0.0125 });
    R.brow = s("line", { class: "d-brow" });
    R.mouth = s("line", { class: "d-mouth" });
    fig.append(R.ear, R.eye, R.brow, R.mouth);
    leg(fig, 0);
    arm(fig, 0);
  }
  R.attached = [];
  return R;
}
// breath — лёгкое «дыхание» торса (доля ширины)
function drawRig(R, J, breath = 0) {
  for (const p of R.parts) p.el.setAttribute("d", p.fn(J, breath));
  setCircle(R.head, J.head);
  const hu = unit2(sub2(J.head, J.neck));
  if (R.front) {
    const { r } = frontAxes(J);
    // поворот головы: черты лица смещаются, дальний глаз и ухо прячутся; кивок — лицо опускается
    const turn = Math.sin((J.hd || 0) * D), nod = (J.nd || 0) * 0.04;
    const at = (x, y) => [J.head[0] + r[0] * (x + turn * 0.055) + hu[0] * (y - nod), J.head[1] + r[1] * (x + turn * 0.055) + hu[1] * (y - nod)];
    R.eyes.forEach((e, k) => {
      const x = (k ? 0.036 : -0.036) * Math.cos((J.hd || 0) * D);
      setCircle(e, at(x, 0.006));
      e.setAttribute("opacity", (k ? -turn : turn) > 0.62 ? "0" : "1");
    });
    R.brows.forEach((e, k) => {
      const x = (k ? 0.036 : -0.036) * Math.cos((J.hd || 0) * D);
      setLine(e, at(x - 0.016, 0.034), at(x + 0.016, 0.034));
      e.setAttribute("opacity", (k ? -turn : turn) > 0.62 ? "0" : "1");
    });
    setLine(R.noseF, at(0.004, -0.008), at(0.007 + turn * 0.012, -0.03));
    setLine(R.mouth, at(-0.02, -0.052), at(0.02, -0.052));
    R.ears.forEach((e, k) => e.setAttribute("opacity", (k ? turn : -turn) > 0.42 ? "0" : "1"));
    // порядок по глубине: что дальше от зрителя — раньше
    const layer = (g, z) => ({ g, z });
    const zs = [layer(R.armG[0], J.arms[0].z), layer(R.armG[1], J.arms[1].z), layer(R.objG, J.objZ !== undefined ? J.objZ : (J.arms[0].zh + J.arms[1].zh) / 2)];
    const legOrder = (J.legs[0].z || 0) <= (J.legs[1].z || 0) ? [R.legG[0], R.legG[1]] : [R.legG[1], R.legG[0]];
    const behind = zs.filter(x => x.z < -0.03).sort((a, b) => a.z - b.z), ahead = zs.filter(x => x.z >= -0.03).sort((a, b) => a.z - b.z);
    const sig = behind.map(x => zs.indexOf(x)).join(",") + "|" + ahead.map(x => zs.indexOf(x)).join(",") + "|" + (legOrder[0] === R.legG[0] ? 0 : 1);
    if (sig !== R.order) {
      R.order = sig;
      const seq = [...(R.legsFront ? [] : legOrder), ...behind.map(x => x.g), R.bodyG, ...(R.legsFront ? legOrder : []), ...ahead.map(x => x.g)];
      for (const g of seq) R.fig.appendChild(g);
    }
  } else {
    const hf = [hu[1], -hu[0]];
    const at = (kf, ku) => [J.head[0] + hf[0] * kf + hu[0] * ku, J.head[1] + hf[1] * kf + hu[1] * ku];
    // нос — мягкий треугольник от переносицы
    R.nose.setAttribute("d", smoothPath([at(0.088, 0.012), at(0.112, -0.016), at(0.104, -0.026), at(0.086, -0.022)].map(sv)));
    setCircle(R.eye, at(0.058, 0.02));
    setLine(R.brow, at(0.044, 0.044), at(0.08, 0.042));
    setCircle(R.ear, at(-0.012, -0.004));
    R.ear.setAttribute("rx", "0.017");
    setLine(R.mouth, at(0.084, -0.05), at(0.06, -0.053));
  }
  for (const o of R.overlays) o.el.setAttribute("d", o.path(J));
  // Тень под точками опоры
  const pts = contactPoints(J).filter(([p, rr]) => p[1] - rr < 0.08).map(([p]) => p[0]);
  if (pts.length) {
    const lo = Math.min(...pts), hi = Math.max(...pts);
    R.shadow.setAttribute("cx", fx((lo + hi) / 2));
    R.shadow.setAttribute("rx", fx((hi - lo) / 2 + 0.16));
    R.shadow.setAttribute("opacity", "1");
  } else R.shadow.setAttribute("opacity", "0");
  for (const f of R.attached) f(J);
}
const setLine = (el, a, b) => {
  el.setAttribute("x1", a[0].toFixed(3));
  el.setAttribute("y1", (-a[1]).toFixed(3));
  el.setAttribute("x2", b[0].toFixed(3));
  el.setAttribute("y2", (-b[1]).toFixed(3));
};
const setCircle = (el, c, r) => {
  el.setAttribute("cx", c[0].toFixed(3));
  el.setAttribute("cy", (-c[1]).toFixed(3));
  if (r !== undefined) el.setAttribute("r", r.toFixed(3));
};

function weightKind(id) {
  const ex = EX[id];
  if (!ex) return null;
  if (ex.equip.includes("barbell")) return "bb";
  if (ex.equip.includes("kettlebell")) return "kb";
  if (ex.equip.includes("dumbbell")) return "db";
  return null;
}
function addWeights(R, kind, where, front) {
  const g = front && R.objG ? R.objG : R.props;
  if (!kind || !where) return;
  if (where === "back" && kind === "bb") {
    const plate = s("circle", { class: "d-prop-fill", r: front ? 0.05 : 0.19 });
    const bar = s("line", { class: "d-prop", "stroke-width": 0.035, "stroke-linecap": "round" });
    g.append(bar, plate);
    R.attached.push(J => {
      const c = front ? J.chestTop : add(J.sh, [-0.05, 0.05]);
      setCircle(plate, c);
      if (front) setLine(bar, add(c, [-0.55, 0]), add(c, [0.55, 0]));
      else setLine(bar, c, c);
    });
    return;
  }
  if (where === "back") return;
  if (where === "hip") {
    const el = kind === "bb" ? s("circle", { class: "d-prop-fill", r: 0.19 }) : s("circle", { class: "d-prop-fill", r: 0.06 });
    g.append(el);
    R.attached.push(J => setCircle(el, add(J.hip, [0, 0.12])));
    return;
  }
  if (where === "obj") {
    const el = s("circle", { class: "d-prop-fill", r: kind === "kb" ? 0.075 : 0.055 });
    const handle = s("line", { class: "d-prop", "stroke-width": 0.022, "stroke-linecap": "round" });
    g.append(el, handle);
    R.attached.push(J => {
      if (!J.obj) return;
      setCircle(el, J.obj);
      if (kind === "kb") setLine(handle, add(J.obj, [-0.035, 0.075]), add(J.obj, [0.035, 0.075]));
    });
    return;
  }
  if (where === "chest") {
    const el = s("circle", { class: "d-prop-fill", r: kind === "kb" ? 0.08 : 0.06 });
    g.append(el);
    R.attached.push(J => {
      const a = J.arms[0].wrist, b = J.arms[1].wrist;
      setCircle(el, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    });
    return;
  }
  const arms = where === "near" ? [0] : [0, 1];
  for (const i of arms) {
    if (kind === "bb" && !front) {
      const plate = s("circle", { class: "d-prop-fill d-plate", r: 0.18 });
      g.append(plate);
      R.attached.push(J => setCircle(plate, J.arms[i].wrist));
      break;
    }
    if (kind === "bb" && front) {
      const bar = s("line", { class: "d-prop", "stroke-width": 0.035, "stroke-linecap": "round" });
      g.append(bar);
      R.attached.push(J => {
        const a = J.arms[0].wrist, b = J.arms[1].wrist;
        const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        setLine(bar, add(c, [-0.55, 0]), add(c, [0.55, 0]));
      });
      break;
    }
    if (kind === "kb") {
      const bell = s("circle", { class: "d-prop-fill", r: 0.075 });
      g.append(bell);
      R.attached.push(J => setCircle(bell, add(J.arms[i].hand, [0, -0.07])));
    } else {
      const d1 = s("circle", { class: "d-prop-fill", r: front ? 0.04 : 0.055 });
      g.append(d1);
      R.attached.push(J => setCircle(d1, J.arms[i].hand));
    }
  }
}
function addStaticProps(R, pat, JA, JB) {
  const g = R.props;
  const rect = (x1, y1, x2, y2) => {
    const el = s("rect", { class: "d-prop", "stroke-width": 0.025, x: Math.min(x1, x2).toFixed(3), y: (-Math.max(y1, y2)).toFixed(3), width: Math.abs(x2 - x1).toFixed(3), height: Math.abs(y2 - y1).toFixed(3), rx: 0.02 });
    g.append(el);
  };
  const line = (a, b, w = 0.03, cls = "d-prop") => {
    const el = s("line", { class: cls, "stroke-width": w, "stroke-linecap": "round" });
    setLine(el, a, b);
    g.append(el);
    return el;
  };
  for (const p of pat.props || []) {
    if (p === "chairB" || p === "chairA") {
      const J = p === "chairB" ? JB : JA;
      const top = J.hip[1] - 0.11, x = J.hip[0];
      line([x - 0.2, top], [x + 0.2, top], 0.05);
      line([x - 0.18, top], [x - 0.18, 0]);
      line([x + 0.18, top], [x + 0.18, 0]);
      line([x - 0.2, top], [x - 0.2, top + 0.45], 0.04);
    } else if (p === "chairHands") {
      const h = JA.arms[0].hand;
      line([h[0] - 0.22, h[1] - 0.03], [h[0] + 0.08, h[1] - 0.03], 0.05);
      line([h[0] + 0.06, h[1] - 0.03], [h[0] + 0.06, 0]);
      line([h[0] - 0.2, h[1] - 0.03], [h[0] - 0.2, 0]);
    } else if (p === "tableHands") {
      const h = JA.arms[0].hand;
      const y = h[1] - 0.03;
      line([h[0] - 0.06, y], [h[0] + 0.38, y], 0.05);
      line([h[0] - 0.03, y], [h[0] - 0.03, 0]);
      line([h[0] + 0.35, y], [h[0] + 0.35, 0]);
    } else if (p === "bench") {
      const y = Math.min(JA.hip[1], JA.sh[1]) - 0.11;
      line([JA.sh[0] - 0.12, y], [JA.hip[0] + 0.2, y], 0.07);
      line([JA.sh[0] - 0.02, y], [JA.sh[0] - 0.02, 0]);
      line([JA.hip[0] + 0.1, y], [JA.hip[0] + 0.1, 0]);
    } else if (p === "stepEdge") {
      // край ступеньки под носками: пятки свободно опускаются ниже
      const t = JA.legs[0].toe;
      rect(t[0] - 0.08, 0, t[0] + 0.36, t[1] - 0.03);
    } else if (p === "step") {
      const a = JA.legs[0].ankle;
      rect(a[0] - 0.16, 0, a[0] + 0.28, a[1] - 0.03);
    } else if (p === "wallHands" || p === "wallFront") {
      const x = Math.max(JA.arms[0].hand[0], JA.arms[1].hand[0]) + 0.04;
      line([x, 0], [x, 2.05], 0.04);
    } else if (p === "wallBack") {
      const x = Math.min(JA.hip[0], JA.sh[0]) - 0.13;
      line([x, 0], [x, 1.95], 0.04);
    } else if (p === "door") {
      const x = JA.arms[0].hand[0] + 0.03;
      line([x, 0], [x, 2.05], 0.06);
    } else if (p === "bar") {
      const h = JA.arms[0].hand;
      line([h[0] - 0.42, h[1] + 0.01], [h[0] + 0.42, h[1] + 0.01], 0.04);
    } else if (p === "bandFront") {
      const h = JA.arms[0].hand;
      const anchor = [h[0] + 0.45, h[1]];
      line([anchor[0], 0], [anchor[0], 1.6], 0.04);
      const band = line(h, anchor, 0.015, "d-band");
      R.attached.push(J => setLine(band, J.arms[0].hand, anchor));
    } else if (p === "bandUp") {
      const anchor = [JA.sh[0] + 0.32, 2.0];
      const band = line(JA.arms[0].hand, anchor, 0.015, "d-band");
      R.attached.push(J => setLine(band, J.arms[0].hand, anchor));
    } else if (p === "band2" || p === "bandHands") {
      const band = line(JA.arms[0].hand, JA.arms[1].hand, 0.018, "d-band");
      R.attached.push(J => setLine(band, J.arms[0].hand, J.arms[1].hand));
    } else if (p === "bandFeet") {
      const foot = L => [(L.toe[0] + L.heel[0]) / 2, Math.min(L.toe[1], L.heel[1]) + 0.01];
      for (const i of [0, 1]) {
        const band = line(JA.arms[i].hand, foot(JA.legs[i]), 0.015, "d-band");
        R.attached.push(J => setLine(band, J.arms[i].hand, foot(J.legs[i])));
      }
    } else if (p === "bandKnees") {
      const band = line(JA.legs[0].knee, JA.legs[1].knee, 0.018, "d-band");
      R.attached.push(J => setLine(band, J.legs[0].knee, J.legs[1].knee));
    } else if (p === "strap") {
      const band = line(JA.arms[0].hand, JA.legs[0].toe, 0.015, "d-band");
      R.attached.push(J => setLine(band, J.arms[0].hand, J.legs[0].toe));
    }
  }
}

// ----- Время -----
const ease = x => x * x * (3 - 2 * x);
// Темп повторения: опускание (уступающая фаза) медленнее подъёма — как советуют ACE и ACSM
// (подъём 1–3 с, опускание 2–4 с). Какая фаза опускает вес, узнаём по позам: если в позе B
// гантели (или таз, если снаряда нет) ниже, чем в позе A, то A → B — опускание
function tempoOf(pat) {
  if (pat._tempo !== undefined) return pat._tempo;
  let t = 0;
  if (pat.b && !pat.alt && (pat.p || 2.6) >= 1.8 && !pat.a.front === !pat.b.front) {
    const load = J => (pat.w && pat.w !== "back" && pat.w !== "hip" ? (J.arms[0].hand[1] + J.arms[1].hand[1]) / 2 : J.hip[1]);
    const dA = load(place(pat, pat.a).J), dB = load(place(pat, pat.b).J);
    t = dB < dA - 0.05 ? 1 : dB > dA + 0.05 ? -1 : 0;
  }
  pat._tempo = t;
  return t;
}
function frameAt(pat, time) {
  if (!pat.b) return { A: pat.a, B: pat.a, k: 0 };
  const per = pat.p || 2.6;
  const cycles = pat.alt ? 2 : 1;
  let u = (time / per) % cycles;
  const second = u >= 1;
  u -= Math.floor(u);
  const B = second ? mirrorOf(pat)(pat.b) : pat.b;
  // доли цикла: пауза в A, путь A → B, пауза в B, путь B → A
  const tp = tempoOf(pat);
  const go = tp > 0 ? 0.42 : tp < 0 ? 0.3 : 0.35, back = tp > 0 ? 0.3 : tp < 0 ? 0.42 : 0.35;
  const h1 = (1 - go - back) / 2;
  let k;
  if (u < h1) k = 0;
  else if (u < h1 + go) k = ease((u - h1) / go);
  else if (u < h1 * 2 + go) k = 1;
  else k = 1 - ease((u - h1 * 2 - go) / back);
  return { A: pat.a, B, k, second };
}
// Узор по кругу: seq — ключевые позы цикла, между ними плавный сплайн без остановок (круги
// руками, тазом, повороты корпуса). alt — после цикла тот же цикл зеркально (вторая сторона)
function seqAt(pat, time) {
  const per = pat.p || 3, n = pat.seq.length, cycles = pat.alt ? 2 : 1;
  let u = (time / per) % cycles;
  if (u < 0) u += cycles;
  const second = u >= 1;
  u -= Math.floor(u);
  const x = u * n, i = Math.floor(x) % n, f = x - Math.floor(x);
  const P = second ? pat.seq.map(mirrorOf(pat)) : pat.seq;
  const Pz = blend4(P[(i - 1 + n) % n], P[i], P[(i + 1) % n], P[(i + 2) % n], f);
  return { Pz, k: { i, f, n }, second, phase: u };
}
// Поза в долю k: если у узора есть промежуточная поза m, путь идёт A → m → B
function poseAt(pat, B, k, second) {
  if (!pat.m) return mix(pat.a, B, k);
  const M = second ? mirrorOf(pat)(pat.m) : pat.m;
  return k < 0.5 ? mix(pat.a, M, ease(k * 2)) : mix(M, B, ease((k - 0.5) * 2));
}
// Для упражнений с чередованием ног опора — стоящая нога: так она не скользит, пока другая
// шагает. Опорную ногу узнаём по тому, чья лодыжка меньше смещается от позы A к позе B
function stanceLeg(pat) {
  if (!pat.alt || !pat.b || pat.anchor || pat.a.front !== pat.b.front) return -1;
  const { J: JA } = place(pat, pat.a), { J: JB } = place(pat, pat.b);
  const move = i => Math.hypot(JB.legs[i].ankle[0] - JA.legs[i].ankle[0], JB.legs[i].ankle[1] - JA.legs[i].ankle[1]);
  return move(0) <= move(1) ? 0 : 1;
}
// Сдвиг по горизонтали: опорная стопа остаётся там же, где стоит в позе A
function placeShift(pat, J, target, anchor, stance, second, JA0) {
  if (stance < 0) return target - anchorX(J, anchor);
  const sl = second ? 1 - stance : stance;
  return target - anchorX(JA0, anchor) - (J.legs[sl].ankle[0] - JA0.legs[sl].ankle[0]);
}

// ----- Опорные стопы -----
// Точка стопы (вся стопа, носок или пятка), которая во всех ключевых позах стоит на одном месте —
// на полу или на ступеньке, — остаётся там и между позами: ногу дотягиваем до неё (обратная
// кинематика «бедро — колено — лодыжка»). Иначе при смешивании углов стопа скользит или
// отрывается от пола. Маховая стопа не проходит сквозь пол — она перекатывается через носок.
const FOOT_R = 0.03; // «толщина» стопы у носка и пятки, как в contactPoints
const normDeg = a => ((((a + 180) % 360) + 360) % 360) - 180;
function footLocks(pat, placeAt, second) {
  if (!pat.b && !pat.seq) return [];
  const mirror = mirrorOf(pat);
  const keys = pat.seq ? pat.seq.map(Pz => (second ? mirror(Pz) : Pz)) : [pat.a, pat.m, pat.b].filter(Boolean).map(Pz => (second && Pz !== pat.a ? mirror(Pz) : Pz));
  const Js = keys.map(Pz => placeAt(Pz, second));
  const same = ps => ps.every(q => Math.abs(q[0] - ps[0][0]) < 0.025 && Math.abs(q[1] - ps[0][1]) < 0.025);
  const low = ps => ps.every(q => q[1] - FOOT_R < 0.3);
  const locks = [];
  for (const i of [0, 1]) {
    const on = pt => { const ps = Js.map(J => J.legs[i][pt]); return same(ps) && low(ps); };
    let pt = null;
    if (pat.a.front) pt = on("ankle") ? "ankle" : null;
    else {
      const toe = on("toe"), heel = on("heel");
      pt = toe && heel ? "ankle" : toe ? "toe" : heel ? "heel" : null;
    }
    if (pt) locks.push({ kind: "leg", i, pt, ps: Js.map(J => J.legs[i][pt]), bend: keys.every(Pz => (Pz.legs[i].k || 0) >= -0.5) ? 1 : -1 });
  }
  // Ладони, которые стоят на полу или держатся за опору, тоже остаются на месте
  if (!pat.a.front) {
    const hold = (pat.props || []).some(pr => HOLD_PROPS.includes(pr));
    for (const i of [0, 1]) {
      const ps = Js.map(J => J.arms[i].hand);
      if (same(ps) && (hold || ps.every(q => q[1] - FOOT_R < 0.06))) locks.push({ kind: "arm", i, ps, bend: keys.every(Pz => (Pz.arms[i].e || 0) >= -0.5) ? -1 : 1 });
    }
  }
  return locks;
}
const HOLD_PROPS = ["wallHands", "tableHands", "chairHands", "bar", "door"];
// Колено и лодыжка, чтобы лодыжка пришла в точку T из бедра H (sx — куда «вперёд» для этой ноги)
function reachLeg(H, T, bend, sx, a = LEN.thigh, b = LEN.shank) {
  const dx = (T[0] - H[0]) * sx, dy = T[1] - H[1];
  const d = Math.min(a + b - 1e-6, Math.max(Math.abs(a - b) + 1e-3, Math.hypot(dx, dy)));
  const cl = v => Math.max(-1, Math.min(1, v));
  const phi = Math.atan2(dx, -dy);
  const al = Math.acos(cl((a * a + d * d - b * b) / (2 * a * d)));
  const kn = Math.acos(cl((a * a + b * b - d * d) / (2 * a * b)));
  const h = phi + bend * al, sh = h - bend * (Math.PI - kn);
  const knee = [H[0] + sx * Math.sin(h) * a, H[1] - Math.cos(h) * a];
  return { knee, ankle: [knee[0] + sx * Math.sin(sh) * b, knee[1] - Math.cos(sh) * b] };
}
const footAt = (knee, ankle, front, i, f) => (front
  ? { knee, ankle, toe: add(ankle, [(i === 0 ? -1 : 1) * 0.03, -0.02]), heel: ankle }
  : { knee, ankle, toe: add(ankle, down(f), LEN.foot), heel: add(ankle, down(f), -LEN.heel) });
// Кадр с опорами: высоту фигуры задают опоры (стопы и ладони стоят на своих местах), а не самая
// низкая точка — иначе маховая нога или свободная рука, опускаясь, приподнимает всё тело
function lockLimbs(J0, Pz, locks, k, front, dx) {
  const tgt = ps => (typeof k === "object"
    ? lerp2(ps[k.i % ps.length], ps[(k.i + 1) % ps.length], k.f)
    : ps.length === 3
      ? (k < 0.5 ? lerp2(ps[0], ps[1], ease(k * 2)) : lerp2(ps[1], ps[2], ease((k - 0.5) * 2)))
      : lerp2(ps[0], ps[ps.length - 1], k));
  const pointOf = (J, g) => (g.kind === "arm" ? J.arms[g.i].hand : J.legs[g.i][g.pt]);
  const goals = locks.map(g => ({ ...g, T: tgt(g.ps) }));
  // Самая «короткая» опора встаёт точно на место, остальные конечности потом чуть сгибаются
  let dy = Infinity;
  for (const g of goals) dy = Math.min(dy, g.T[1] - pointOf(J0, g)[1]);
  let J = shiftJ(J0, dx, dy);
  // Тело, колени свободных ног и локти свободных рук не уходят под пол
  const legs = new Set(goals.filter(g => g.kind === "leg").map(g => g.i));
  const arms = new Set(goals.filter(g => g.kind === "arm").map(g => g.i));
  const body = [[J.hip, 0.1], [J.sh, 0.1], [J.head, LEN.head]];
  J.legs.forEach((L, i) => { if (!legs.has(i)) body.push([L.knee, 0.06], [L.ankle, 0.035]); });
  J.arms.forEach((A, i) => { if (!arms.has(i)) body.push([A.elbow, 0.045]); });
  const under = Math.max(0, ...body.map(([q, r]) => r - q[1] - 0.003));
  if (under > 0) J = shiftJ(J, 0, under);
  // Заперты только ладони на полу (отжимания с колен): колени не зависают над полом между позами
  else if (!front && !(Pz.hs > 0.01) && goals.length && goals.every(g => g.kind === "arm" && g.T[1] - FOOT_R < 0.06)) {
    const pts = [[J.hip, 0.1], [J.sh, 0.1], [J.head, LEN.head]];
    J.legs.forEach(L => pts.push([L.knee, 0.06], [L.ankle, 0.035], [L.toe, FOOT_R], [L.heel, FOOT_R]));
    const over = Math.min(...pts.map(([q, r]) => q[1] - r));
    if (over > 0.003 && over < 0.2) J = shiftJ(J, 0, -over);
  }
  const outLegs = J.legs.slice(), outArms = J.arms.slice();
  for (const g of goals) {
    if (g.kind === "leg") {
      const f = front ? 0 : Pz.legs[g.i].f;
      const ankle = front || g.pt === "ankle" ? g.T : g.pt === "toe" ? add(g.T, down(f), -LEN.foot) : add(g.T, down(f), LEN.heel);
      const sx = front ? (g.i === 0 ? -1 : 1) : 1;
      const Lg = Pz.legs[g.i];
      const r = front
        ? reachLeg(J.hips[g.i], ankle, g.bend, sx, LEN.thigh * (Lg.ft || 1), LEN.shank * (Lg.fs || 1))
        : reachLeg(J.hip, ankle, g.bend, sx);
      outLegs[g.i] = footAt(r.knee, r.ankle, front, g.i, f);
      if (front) outLegs[g.i].z3 = legDepth3(J.hips[g.i], r.knee, r.ankle, Lg);
    } else {
      // Ладонь на опоре: руку дотягиваем до точки, кисть сохраняет угол из позы
      const A = Pz.arms[g.i], ha = A.s + A.e + (A.w || 0);
      const r = reachLeg(J.sh, add(g.T, down(ha), -LEN.hand), g.bend, 1, LEN.upper, LEN.fore);
      outArms[g.i] = { ...outArms[g.i], elbow: r.knee, wrist: r.ankle, hand: add(r.ankle, down(ha), LEN.hand) };
    }
  }
  return { ...J, legs: outLegs, arms: outArms };
}
function handAboveFloor(J, i, A) {
  const arm = J.arms[i];
  if (arm.hand[1] - FOOT_R > -0.003 && arm.wrist[1] - 0.035 > -0.003) return arm;
  const build = e => {
    const wrist = add(arm.elbow, down(A.s + e), LEN.fore);
    return { ...arm, wrist, hand: add(wrist, down(A.s + e + (A.w || 0)), LEN.hand) };
  };
  for (let d = 3; d <= 150; d += 3) {
    for (const sg of [1, -1]) {
      const c = build(A.e + sg * d);
      if (c.hand[1] - FOOT_R > -0.003 && c.wrist[1] - 0.035 > -0.003) return c;
    }
  }
  return arm;
}
// Маховая стопа у пола: поворачиваем её в голеностопе ровно настолько, чтобы носок и пятка
// остались над полом, — как при настоящем шаге, когда пятка уже поднялась, а носок ещё на полу
function keepAboveFloor(L, f) {
  if (L.toe[1] - FOOT_R > -0.003 && L.heel[1] - FOOT_R > -0.003) return L;
  let ff = normDeg(f);
  const c = (L.ankle[1] - FOOT_R) / LEN.foot;
  if (c > -1 && c < 1) { const lim = Math.acos(c) / D; if (Math.abs(ff) < lim) ff = (ff < 0 ? -1 : 1) * lim; }
  const c2 = (FOOT_R - L.ankle[1]) / LEN.heel;
  if (c2 > -1 && c2 < 1) { const lim = Math.acos(c2) / D; if (Math.abs(ff) > lim) ff = (ff < 0 ? -1 : 1) * lim; }
  return { ...L, toe: add(L.ankle, down(ff), LEN.foot), heel: add(L.ankle, down(ff), -LEN.heel) };
}

// Положение по горизонтали: опорная точка неподвижна, движение — по центру кадра
// Высокие предметы: стена, дверь, крепление эспандера — для них нужна полная высота кадра
const TALL_PROPS = ["wallHands", "wallFront", "wallBack", "door", "bandUp", "bandFront"];
function layout(pat) {
  const anchor = pat.anchor || "feet";
  const mirror = mirrorOf(pat);
  const poses = pat.seq ? [...pat.seq, ...(pat.alt ? pat.seq.map(mirror) : [])] : [pat.a, pat.b || pat.a];
  if (pat.alt && pat.b) poses.push(mirror(pat.b));
  if (pat.seq) for (let t = 0; t < 1; t += 1 / 24) poses.push(seqAt(pat, t * (pat.p || 3)).Pz);
  let lo = Infinity, hi = -Infinity, top = 0;
  for (const Pz of poses) {
    const { J, dy } = place(pat, Pz);
    const ax = anchorX(J, anchor);
    for (const [p, r] of contactPoints(J)) {
      lo = Math.min(lo, p[0] - ax - r);
      hi = Math.max(hi, p[0] - ax + r);
      top = Math.max(top, p[1] + dy + r);
    }
  }
  // Промежуточные кадры бывают выше крайних (нога идёт по дуге) — их тоже учитываем
  if (pat.b) {
    for (const k of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      for (const B of pat.alt ? [pat.b, mirror(pat.b)] : [pat.b]) {
        const { J, dy } = place(pat, poseAt(pat, B, k, B !== pat.b));
        for (const [p, r] of contactPoints(J)) top = Math.max(top, p[1] + dy + r);
      }
    }
  }
  if ((pat.props || []).some(p => TALL_PROPS.includes(p))) top = Math.max(top, 2.05);
  return { anchor, target: -(lo + hi) / 2, top };
}
// Кадр по высоте движения: у упражнений лёжа нет пустого места сверху
const viewBoxFor = top => {
  const t = Math.min(2.4, Math.max(1, top + 0.22));
  return `-1.25 ${(-t).toFixed(2)} 2.5 ${(t + 0.12).toFixed(2)}`;
};

// ----- Общий цикл анимации для всех показанных фигур -----
const active = new Set();
let raf = 0;
// Настройки из персонализации: скорость показа и «меньше анимации»
const opts = { speed: 1, still: false, sex: "m" };
let clock = 0, lastNow = 0;
export function setOptions({ speed, still, sex } = {}) {
  if (typeof speed === "number" && speed >= 0.25 && speed <= 2) opts.speed = speed;
  if (typeof still === "boolean") opts.still = still;
  if (sex === "m" || sex === "f") opts.sex = sex;
}
function loop(now) {
  raf = 0;
  // Своё время анимации: скорость меняется плавно, без рывка фигуры
  clock += (lastNow ? Math.min(now - lastNow, 100) : 0) * opts.speed;
  lastNow = now;
  for (const d of active) {
    if (!d.svg.isConnected) {
      if (d.seen || now - d.born > 4000) active.delete(d);
      continue;
    }
    d.seen = true;
    d.update((clock - d.start) / 1000);
  }
  if (active.size) raf = requestAnimationFrame(loop);
  else lastNow = 0;
}

const reduced = () => { if (opts.still) return true; try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

// Кадр целиком: поза → суставы → место в кадре → опорные стопы. Считается один раз для узора
// и телосложения (у женской фигуры уже плечи — руки и кадр чуть другие)
const SOLVERS = { m: new Map(), f: new Map() };
function solver(pat) {
  const cache = SOLVERS[opts.sex] || SOLVERS.m;
  if (cache.has(pat)) return cache.get(pat);
  const front = !!pat.a.front;
  const { anchor, target, top } = layout(pat);
  const stance = stanceLeg(pat);
  const JA0 = place(pat, pat.a).J;
  const placeAt = (Pz, second = false) => {
    const { J, dy } = place(pat, Pz);
    return shiftJ(J, placeShift(pat, J, target, anchor, stance, second, JA0), dy);
  };
  const locks = [footLocks(pat, placeAt, false), pat.alt ? footLocks(pat, placeAt, true) : []];
  // k — доля пути от позы A к позе B (у узоров-кругов — номер отрезка и доля в нём)
  const at = (Pz, k = 0, second = false) => {
    const L = locks[second ? 1 : 0];
    let J;
    if (L.length) {
      const J0 = front ? frontJoints(Pz) : sideJoints(Pz);
      J = lockLimbs(J0, Pz, L, k, front, placeShift(pat, J0, target, anchor, stance, second, JA0));
    } else J = placeAt(Pz, second);
    if (!front) {
      const locked = new Set(L.filter(g => g.kind === "leg").map(g => g.i));
      const held = new Set(L.filter(g => g.kind === "arm").map(g => g.i));
      J = { ...J, legs: J.legs.map((Lg, i) => (locked.has(i) ? Lg : keepAboveFloor(Lg, Pz.legs[i].f))) };
      J = { ...J, arms: J.arms.map((Ar, i) => (held.has(i) ? Ar : handAboveFloor(J, i, Pz.arms[i]))) };
    }
    return J;
  };
  const S = { front, top, at, locks };
  cache.set(pat, S);
  return S;
}
// Поза в момент времени для любого узора: неподвижный, «туда-обратно» (A ↔ B) или по кругу (seq)
function cycleFrame(pat, time) {
  if (pat.seq) return seqAt(pat, time);
  if (!pat.b) return { Pz: mix(pat.a, { ...pat.a, t: pat.a.t + (pat.a.front ? 0 : 1.2) }, (1 - Math.cos(time * Math.PI / 2)) / 2), k: 0, second: false, phase: 0 };
  const f = frameAt(pat, time), per = pat.p || 2.6;
  return { Pz: poseAt(pat, f.B, f.k, f.second), k: f.k, second: f.second, phase: (((time / per) % 1) + 1) % 1 };
}
const keyK = (pat, i) => (pat.seq ? { i: i % pat.seq.length, f: 0, n: pat.seq.length } : i ? 1 : 0);
const keyPose = (pat, i) => (pat.seq ? pat.seq[i % pat.seq.length] : i ? pat.b || pat.a : pat.a);

// Подсказка траектории у круговых движений: пунктирный эллипс и точка, которая бежит по нему.
// at — какая точка тела движется по кругу; rx/ry — свой эллипс (вращение корпуса вокруг талии)
const guidePoint = (J, at) => {
  if (at === "obj") return J.obj || J.hip;
  if (at === "shoulder") return J.shArm || J.sh;
  if (at === "hands") return lerp2(J.arms[0].hand, J.arms[1].hand, 0.5);
  if (at === "hand0" || at === "hand1") return J.arms[+at[4]].hand;
  if (at === "toe0" || at === "toe1") return J.legs[+at[3]].toe;
  if (at === "head") return J.head;
  if (at === "waist") return lerp2(J.hip, J.sh, 0.3);
  return J.hip;
};
function addGuides(svg, pat, S) {
  if (!pat.guide) return [];
  const per = pat.p || 3;
  return pat.guide.map(gd => {
    const pts = [];
    for (let t = 0; t < 1; t += 1 / 36) { const f = cycleFrame(pat, t * per); pts.push(guidePoint(S.at(f.Pz, f.k, f.second), gd.at)); }
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2 + (gd.dy || 0);
    const rx = gd.rx || Math.max(0.05, (Math.max(...xs) - Math.min(...xs)) / 2 + 0.035);
    const ry = gd.ry || Math.max(0.04, (Math.max(...ys) - Math.min(...ys)) / 2 + 0.035);
    // качание (повороты корпуса туда-обратно) — только передняя дуга, вращение по кругу — эллипс
    const sw = (gd.swing || 0) * D;
    const ring = gd.swing
      ? s("path", { class: "d-guide", d: `M${fx(cx + rx * Math.cos(-Math.PI / 2 - sw))} ${fx(-(cy + ry * Math.sin(-Math.PI / 2 - sw)))}A${fx(rx)} ${fx(ry)} 0 0 0 ${fx(cx + rx * Math.cos(-Math.PI / 2 + sw))} ${fx(-(cy + ry * Math.sin(-Math.PI / 2 + sw)))}` })
      : s("ellipse", { class: "d-guide", cx: fx(cx), cy: fx(-cy), rx: fx(rx), ry: fx(ry) });
    const dot = s("circle", { class: "d-guide-dot", r: 0.017 });
    svg.append(ring, dot);
    return { gd, cx, cy, rx, ry, dot };
  });
}
function drawGuides(guides, J, phase) {
  for (const g of guides) {
    let a;
    if (g.gd.swing) a = -Math.PI / 2 + (J.tw || 0) * D;
    else if (g.gd.rx) a = (g.gd.start || 0) + (g.gd.dir || 1) * phase * Math.PI * 2;
    else { const q = guidePoint(J, g.gd.at); a = Math.atan2((q[1] - g.cy) / g.ry, (q[0] - g.cx) / g.rx); }
    setCircle(g.dot, [g.cx + g.rx * Math.cos(a), g.cy + g.ry * Math.sin(a)]);
    // у вращения вокруг талии задняя половина пути — «за телом»: точка бледнее
    g.dot.setAttribute("opacity", g.gd.rx && Math.sin(a) > 0.15 ? "0.35" : "1");
  }
}

// Демонстрация техники: SVG-фигура, которая повторяет движение упражнения
export function exerciseDemo(id, { label, paused = false } = {}) {
  const pid = patternOf(id);
  const pat = P[pid] || P.stand;
  const S = solver(pat);
  const front = S.front;
  const svg = s("svg", { class: "demo-svg", viewBox: viewBoxFor(S.top), role: "img", "aria-label": label || `Схема движения: ${(EX[id] || { name: "" }).name}` });
  const R = buildRig(svg, front, (EX[id] || {}).load || {}, { legsFront: !!pat.legsFront });
  const JA = S.at(pat.a, keyK(pat, 0)), JB = S.at(keyPose(pat, 1), keyK(pat, 1));
  addStaticProps(R, pat, JA, JB);
  addWeights(R, weightKind(id) || pat.hold || null, id === "bbSquat" ? "back" : pat.w, front);
  const guides = addGuides(svg, pat, S);
  const still = reduced();
  const update = time => {
    const f = still ? { Pz: keyPose(pat, 1), k: keyK(pat, 1), second: false, phase: 0.25 } : cycleFrame(pat, time);
    const J = S.at(f.Pz, f.k, f.second);
    // Спокойное дыхание: грудная клетка чуть расширяется раз в 3,6 секунды
    drawRig(R, J, still ? 0 : 0.014 * Math.sin(time * 2 * Math.PI / 3.6));
    drawGuides(guides, J, f.phase);
  };
  update(0);
  svg.lpFrame = update; // для проверки: кадр в заданное время
  svg.lpPeriod = pat.p || 2.6;
  if (!still && !paused) {
    active.add({ svg, update, born: performance.now(), seen: false, start: clock });
    if (!raf) raf = requestAnimationFrame(loop);
  }
  return svg;
}

// Для объёмной схемы (demo3d.js): то же движение, что у рисунка, — суставы в каждый момент времени,
// фаза цикла, снаряды и опоры узора
export function motionOf(id) {
  const pid = patternOf(id);
  const pat = P[pid] || P.stand;
  const S = solver(pat);
  const keys = pat.seq ? pat.seq.length : pat.b ? 2 : 1;
  return {
    id, pid, pat, front: S.front, period: pat.p || 2.6, cycle: (pat.p || 2.6) * (pat.alt ? 2 : 1),
    weight: weightKind(id) || pat.hold || null, where: id === "bbSquat" ? "back" : pat.w || null,
    props: pat.props || [], hang: pat.hang || 0, legsFront: !!pat.legsFront, keys,
    frame(time, still = false) {
      const f = still ? { Pz: keyPose(pat, 1), k: keyK(pat, 1), second: false, phase: 0.25 } : cycleFrame(pat, time);
      return { J: S.at(f.Pz, f.k, f.second), Pz: f.Pz, phase: f.phase, k: f.k, second: f.second };
    },
    key(i) { return S.at(keyPose(pat, i), keyK(pat, i)); },
    // какие кисти узор держит на опоре (пол, стена, стул) — в объёме они лежат на ней ладонью
    held(second) { return S.locks[second ? 1 : 0].filter(g => g.kind === "arm").map(g => g.i); },
    keyPz(i) { return keyPose(pat, i); }
  };
}
export const LEN2D = LEN;

// Для проверки: статичный кадр узора (0 — поза A, 1 — поза B)
export function patternFrame(pid, k = 0) {
  const pat = P[pid];
  const S = solver(pat);
  const svg = s("svg", { class: "demo-svg", viewBox: viewBoxFor(S.top) });
  const R = buildRig(svg, S.front, {}, { legsFront: !!pat.legsFront });
  addStaticProps(R, pat, S.at(pat.a, keyK(pat, 0)), S.at(keyPose(pat, 1), keyK(pat, 1)));
  addWeights(R, pat.w ? "db" : null, pat.w, S.front);
  const f = pat.seq ? seqAt(pat, k * (pat.p || 3)) : { Pz: pat.b ? poseAt(pat, pat.b, k, false) : pat.a, k, second: false };
  drawRig(R, S.at(f.Pz, f.k, f.second));
  return svg;
}
export const PATTERN_IDS = Object.keys(P);
export const patternDef = pid => P[pid];
// Для проверки: суставы фигуры в кадре k (0 — поза A, 1 — поза B; mirrored — вторая сторона).
// У узоров-кругов k — доля цикла
export function patternJoints(pid, k = 0, mirrored = false) {
  const pat = P[pid];
  if (mirrored && !pat.alt) return null;
  if (pat.seq) { const f = seqAt(pat, (k % 1 + (mirrored ? 1 : 0)) * (pat.p || 3)); return solver(pat).at(f.Pz, f.k, f.second); }
  const B = pat.b ? (mirrored ? mirrorOf(pat)(pat.b) : pat.b) : pat.a;
  return solver(pat).at(pat.b ? poseAt(pat, B, k, mirrored) : pat.a, k, mirrored);
}
// Для проверки: какие стопы узор держит на месте
export const patternLocks = pid => solver(P[pid]).locks.map(L => L.map(g => (g.kind === "arm" ? `hand${g.i}` : `leg${g.i}:${g.pt}`)));
