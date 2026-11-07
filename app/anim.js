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
const leg = (h = 0, k = 0, f = 90) => ({ h, k, f });
const arm = (sA = 0, e = 0, w = 0) => ({ s: sA, e, w });
const pose = (o = {}) => ({ t: 0, n: 0, sh: 0, air: 0, lift: 0, legs: [leg(), leg()], arms: [arm(6, 12), arm(-4, 12)], ...o });
// lift — подъём стопы к зрителю (колено сгибается вперёд, а не вбок)
const fleg = (h = 4, k = 0, lift = 0) => ({ h, k, lift });
const farm = (sA = 10, e = 6) => ({ s: sA, e });
const fpose = (o = {}) => ({ front: true, t: 0, n: 0, air: 0, lift: 0, legs: [fleg(), fleg()], arms: [farm(), farm()], ...o });

const STAND = pose();
const SUPINE_KNEES = [leg(130, 95, 90), leg(130, 95, 90)];
const SUPINE = (o = {}) => pose({ t: -90, legs: SUPINE_KNEES, arms: [arm(90, 0), arm(90, 0)], ...o });
const QUAD = (o = {}) => pose({ t: 76, legs: [leg(0, 90, -90), leg(0, 90, -90)], arms: [arm(0, 0), arm(0, 0)], ...o });
const PLANK_HIGH = pose({ t: 71, legs: [leg(-71, 0, -5), leg(-71, 0, -5)], arms: [arm(3, 0), arm(3, 0)] });
const SEATED = (o = {}) => pose({ t: -2, legs: [leg(90, 90), leg(90, 90)], arms: [arm(25, 70), arm(25, 70)], ...o });
const HINGE = (o = {}) => pose({ t: 70, legs: [leg(18, 24), leg(18, 24)], arms: [arm(0, 0), arm(0, 0)], ...o });
const SQUAT_LOW = (o = {}) => pose({ t: 38, legs: [leg(95, 115), leg(95, 115)], arms: [arm(88, 0), arm(88, 0)], ...o });
const LUNGE_LOW = (o = {}) => pose({ t: 3, legs: [leg(80, 85), leg(-10, 95, 40)], arms: [arm(4, 6), arm(-4, 6)], ...o });
const HANDS_HIPS = [arm(-15, 100), arm(-15, 100)];
const BALANCE = (o = {}) => pose({ legs: [leg(0, 0), leg(25, 70, 70)], arms: [arm(30, 10), arm(30, 10)], ...o });

// Узоры движений: a и b — ключевые позы, alt — чередование сторон, p — период в секундах,
// anchor — что стоит на месте, w — где вес (руки, грудь, таз, спина), props — опоры
const P = {
  stand: { a: STAND },
  march: { a: STAND, b: pose({ legs: [leg(62, 85), leg(-4, 6)], arms: [arm(-28, 30), arm(38, 40)] }), alt: true, p: 1.4, w: "hands" },
  toeWalk: { a: pose({ legs: [leg(0, 0, 55), leg(0, 0, 55)] }), b: pose({ legs: [leg(35, 45, 55), leg(-8, 6, 55)], arms: [arm(-20, 20), arm(25, 30)] }), alt: true, p: 1.4 },
  heelWalk: { a: pose({ legs: [leg(0, 0, 125), leg(0, 0, 125)] }), b: pose({ legs: [leg(30, 20, 125), leg(-8, 0, 125)], arms: [arm(-20, 20), arm(25, 30)] }), alt: true, p: 1.4 },
  highKnees: { a: STAND, b: pose({ legs: [leg(88, 100), leg(0, 5, 60)], arms: [arm(-35, 80), arm(55, 85)] }), alt: true, p: 1.1 },
  jog: { a: pose({ arms: [arm(-10, 90), arm(10, 90)] }), b: pose({ air: 0.04, legs: [leg(42, 95), leg(-18, 35)], arms: [arm(-35, 90), arm(35, 90)] }), alt: true, p: 0.9 },
  heelKicks: { a: STAND, b: pose({ legs: [leg(-6, 125, -40), leg(0, 0)], arms: [arm(20, 70), arm(-20, 70)] }), alt: true, p: 1.1 },
  sway: { a: pose({ t: -3, arms: HANDS_HIPS }), b: pose({ t: 5, arms: HANDS_HIPS }), p: 2.4 },
  neckNod: { a: pose({ n: -12 }), b: pose({ n: 32 }), p: 3 },
  handsForward: { a: pose({ arms: [arm(55, 35, -35), arm(55, 35, -35)] }), b: pose({ arms: [arm(55, 35, 35), arm(55, 35, 35)] }), p: 1.8 },
  legSwings: { a: pose({ legs: [leg(-32, 8), leg(0, 0)], arms: [arm(10, 10), arm(70, 10)] }), b: pose({ legs: [leg(55, 5), leg(0, 0)], arms: [arm(10, 10), arm(70, 10)] }), p: 1.6, anchor: "far" },
  inchworm: { a: pose({ t: 108, legs: [leg(-8, 0), leg(-8, 0)], arms: [arm(6, 0), arm(6, 0)] }), b: PLANK_HIGH, p: 3, anchor: "toes" },
  hinge: { a: pose({ arms: [arm(2, 0), arm(2, 0)] }), b: HINGE(), p: 2.8, w: "hands" },
  dislocate: { a: pose({ arms: [arm(60, 0), arm(60, 0)] }), b: pose({ arms: [arm(200, 0), arm(200, 0)] }), p: 2.6, props: ["band2"] },
  squat: { a: pose({ arms: [arm(8, 10), arm(8, 10)] }), b: SQUAT_LOW(), p: 2.6, w: "back" },
  chairSquat: { a: pose({ arms: [arm(30, 10), arm(30, 10)] }), b: pose({ t: 28, legs: [leg(85, 90), leg(85, 90)], arms: [arm(85, 0), arm(85, 0)] }), p: 2.6, props: ["chairB"] },
  goblet: { a: pose({ arms: [arm(25, 135), arm(25, 135)] }), b: SQUAT_LOW({ arms: [arm(30, 130), arm(30, 130)] }), p: 2.6, w: "chest" },
  bridge: { a: SUPINE(), b: SUPINE({ t: -115, legs: [leg(112, 112), leg(112, 112)] }), p: 2.6, anchor: "shoulder", w: "hip" },
  singleBridge: { a: SUPINE({ legs: [leg(130, 95), leg(150, 15, 160)] }), b: SUPINE({ t: -115, legs: [leg(112, 112), leg(116, 0, 120)] }), p: 2.6, anchor: "shoulder" },
  bridgeMarch: { a: SUPINE({ t: -115, legs: [leg(112, 112), leg(112, 112)] }), b: SUPINE({ t: -115, legs: [leg(160, 110, 150), leg(112, 112)] }), alt: true, p: 1.8, anchor: "shoulder" },
  bridgeHold: { a: SUPINE({ t: -115, legs: [leg(112, 112), leg(112, 112)] }), anchor: "shoulder" },
  lunge: { a: pose({ legs: [leg(22, 0), leg(-24, 0, 70)] }), b: LUNGE_LOW(), p: 2.6, w: "hands" },
  splitHold: { a: LUNGE_LOW({ legs: [leg(60, 60), leg(-12, 70, 45)] }) },
  stepUp: { a: pose({ legs: [leg(60, 70), leg(0, 0)] }), b: pose({ lift: 0.24, legs: [leg(0, 0), leg(35, 70, 60)] }), p: 2.6, props: ["step"], w: "hands" },
  deadlift: { a: pose({ t: 62, legs: [leg(60, 80), leg(60, 80)], arms: [arm(0, 0), arm(0, 0)] }), b: pose({ arms: [arm(0, 0), arm(0, 0)] }), p: 2.8, w: "hands" },
  swing: { a: pose({ t: 62, legs: [leg(25, 32), leg(25, 32)], arms: [arm(-32, 0), arm(-32, 0)] }), b: pose({ t: -4, arms: [arm(86, 0), arm(86, 0)] }), p: 1.6, w: "hands" },
  calfRaise: { a: STAND, b: pose({ legs: [leg(0, 0, 50), leg(0, 0, 50)] }), p: 2, w: "hands", anchor: "toes" },
  calfHold: { a: pose({ legs: [leg(0, 0, 60), leg(0, 0, 60)] }), anchor: "toes" },
  wallSit: { a: pose({ legs: [leg(90, 90), leg(90, 90)], arms: [arm(6, 8), arm(6, 8)] }), props: ["wallBack"] },
  wallSitShort: { a: pose({ legs: [leg(40, 45), leg(40, 45)], arms: [arm(6, 8), arm(6, 8)] }), props: ["wallBack"] },
  squatHold: { a: pose({ t: 22, legs: [leg(55, 70), leg(55, 70)], arms: [arm(88, 0), arm(88, 0)] }) },
  squatJump: { a: SQUAT_LOW({ arms: [arm(-35, 0), arm(-35, 0)] }), b: pose({ air: 0.18, legs: [leg(0, 0, 40), leg(0, 0, 40)], arms: [arm(160, 0), arm(160, 0)] }), p: 1.6 },
  singleHinge: { a: pose({ legs: [leg(0, 0), leg(-10, 15)] }), b: pose({ t: 82, legs: [leg(12, 18), leg(-86, 0, -80)], arms: [arm(0, 0), arm(0, 0)] }), p: 3, anchor: "near", w: "hands" },
  nordic: { a: pose({ legs: [leg(0, 90, -90), leg(0, 90, -90)], arms: [arm(20, 110), arm(20, 110)] }), b: pose({ t: 32, legs: [leg(-32, 58, -90), leg(-32, 58, -90)], arms: [arm(55, 20), arm(55, 20)] }), p: 3, anchor: "knees" },
  sideLying: { a: pose({ t: -90, legs: [leg(90, 0, 90), leg(90, 0, 90)], arms: [arm(90, 0), arm(-90, 0)] }), b: pose({ t: -90, legs: [leg(122, 0, 122), leg(90, 0, 90)], arms: [arm(90, 0), arm(-90, 0)] }), p: 2.4, anchor: "hip" },
  wallPush: { a: pose({ t: 22, legs: [leg(-14, 0), leg(-14, 0)], arms: [arm(75, 0), arm(75, 0)] }), b: pose({ t: 30, legs: [leg(-20, 0), leg(-20, 0)], arms: [arm(40, 50), arm(40, 50)] }), p: 2.4, props: ["wallHands"] },
  kneePush: { a: pose({ t: 52, legs: [leg(-52, 90, -150), leg(-52, 90, -150)], arms: [arm(3, 0), arm(3, 0)] }), b: pose({ t: 72, legs: [leg(-72, 90, -170), leg(-72, 90, -170)], arms: [arm(-80, 80), arm(-80, 80)] }), p: 2.4 },
  pushUp: { a: PLANK_HIGH, b: pose({ t: 84, legs: [leg(-84, 0, -5), leg(-84, 0, -5)], arms: [arm(-80, 80), arm(-80, 80)] }), p: 2.4 },
  pikePush: { a: pose({ t: 132, legs: [leg(-38, 0, 66), leg(-38, 0, 66)], arms: [arm(48, 0), arm(48, 0)] }), b: pose({ t: 150, legs: [leg(-30, 0, 66), leg(-30, 0, 66)], arms: [arm(-20, 85), arm(-20, 85)] }), p: 2.6 },
  dip: { a: pose({ t: 2, legs: [leg(72, 62), leg(72, 62)], arms: [arm(-16, 0), arm(-16, 0)] }), b: pose({ t: 10, legs: [leg(84, 92), leg(84, 92)], arms: [arm(-78, 82), arm(-78, 82)] }), p: 2.4, props: ["chairHands"] },
  chestPress: { a: pose({ legs: [leg(10, 0), leg(-10, 0)], arms: [arm(-30, 120), arm(-30, 120)] }), b: pose({ legs: [leg(10, 0), leg(-10, 0)], arms: [arm(88, 0), arm(88, 0)] }), p: 2.2 },
  floorPress: { a: SUPINE({ arms: [arm(90, 90), arm(90, 90)] }), b: SUPINE({ arms: [arm(180, 0), arm(180, 0)] }), p: 2.4, anchor: "hip", w: "hands" },
  benchPress: { a: pose({ t: -90, legs: [leg(90, 90), leg(90, 90)], arms: [arm(20, 160), arm(20, 160)] }), b: pose({ t: -90, legs: [leg(90, 90), leg(90, 90)], arms: [arm(180, 0), arm(180, 0)] }), p: 2.4, anchor: "hip", props: ["bench"], w: "hands" },
  skull: { a: SUPINE({ arms: [arm(165, 120), arm(165, 120)] }), b: SUPINE({ arms: [arm(178, 2), arm(178, 2)] }), p: 2.2, anchor: "hip", w: "hands" },
  pullover: { a: SUPINE({ arms: [arm(178, 4), arm(178, 4)] }), b: SUPINE({ arms: [arm(282, 6), arm(282, 6)] }), p: 2.8, anchor: "hip", w: "hands" },
  curl: { a: pose({ arms: [arm(2, 8), arm(2, 8)] }), b: pose({ arms: [arm(8, 140), arm(8, 140)] }), p: 2.2, w: "hands" },
  tricepsDown: { a: pose({ arms: [arm(-8, 120), arm(-8, 120)] }), b: pose({ arms: [arm(-6, 4), arm(-6, 4)] }), p: 2, props: ["bandUp"] },
  press: { a: pose({ arms: [arm(25, 155), arm(25, 155)] }), b: pose({ arms: [arm(176, 4), arm(176, 4)] }), p: 2.4, w: "hands" },
  seatedPress: { a: SEATED({ arms: [arm(25, 155), arm(25, 155)] }), b: SEATED({ arms: [arm(176, 4), arm(176, 4)] }), p: 2.4, props: ["chairA"], w: "hands" },
  ohTriceps: { a: SEATED({ arms: [arm(165, 140), arm(165, 140)] }), b: SEATED({ arms: [arm(174, 4), arm(174, 4)] }), p: 2.2, props: ["chairA"], w: "hands" },
  kickback: { a: HINGE({ t: 75, arms: [arm(-75, 75), arm(28, 0)] }), b: HINGE({ t: 75, arms: [arm(-75, 0), arm(28, 0)] }), p: 2, w: "near" },
  frontRaise: { a: pose({ arms: [arm(3, 5), arm(3, 5)] }), b: pose({ arms: [arm(88, 5), arm(88, 5)] }), p: 2.2, w: "hands" },
  superman: { a: pose({ t: 90, legs: [leg(-90, 0, -90), leg(-90, 0, -90)], arms: [arm(90, 0), arm(90, 0)] }), b: pose({ t: 84, legs: [leg(-100, 0, -100), leg(-100, 0, -100)], arms: [arm(102, 0), arm(102, 0)] }), p: 2.6, anchor: "hip" },
  backExtHold: { a: pose({ t: 84, legs: [leg(-98, 0, -98), leg(-98, 0, -98)], arms: [arm(100, 0), arm(100, 0)] }), anchor: "hip" },
  proneYT: { a: pose({ t: 90, legs: [leg(-90, 0, -90), leg(-90, 0, -90)], arms: [arm(92, 0), arm(92, 0)] }), b: pose({ t: 88, legs: [leg(-90, 0, -90), leg(-90, 0, -90)], arms: [arm(108, 0), arm(108, 0)] }), p: 2.4, anchor: "hip" },
  standRow: { a: pose({ legs: [leg(8, 12), leg(8, 12)], arms: [arm(88, 0), arm(88, 0)] }), b: pose({ legs: [leg(8, 12), leg(8, 12)], arms: [arm(-35, 125), arm(-35, 125)] }), p: 2.2, props: ["bandFront"] },
  row: { a: HINGE({ t: 65, legs: [leg(20, 28), leg(20, 28)] }), b: HINGE({ t: 65, legs: [leg(20, 28), leg(20, 28)], arms: [arm(-75, 75), arm(-75, 75)] }), p: 2.2, w: "hands" },
  reverseFly: { a: HINGE({ t: 72 }), b: HINGE({ t: 72, arms: [arm(-72, 6), arm(-72, 6)] }), p: 2.4, w: "hands" },
  hang: { a: pose({ t: -2, legs: [leg(4, 20), leg(4, 20)], arms: [arm(178, 0), arm(178, 0)] }), hang: 2.24, props: ["bar"] },
  pullUp: { a: pose({ t: -2, legs: [leg(4, 20), leg(4, 20)], arms: [arm(178, 0), arm(178, 0)] }), b: pose({ t: -6, legs: [leg(14, 40), leg(14, 40)], arms: [arm(-12, 186), arm(-12, 186)] }), p: 2.8, hang: 2.24, props: ["bar"] },
  shrug: { a: pose({ arms: [arm(2, 0), arm(2, 0)] }), b: pose({ sh: 0.05, arms: [arm(2, 0), arm(2, 0)] }), p: 1.8, w: "hands" },
  renegade: { a: PLANK_HIGH, b: pose({ t: 71, legs: [leg(-71, 0, -5), leg(-71, 0, -5)], arms: [arm(-72, 82), arm(3, 0)] }), alt: true, p: 2.2, w: "hands" },
  doorRow: { a: pose({ t: -28, legs: [leg(28, 0), leg(28, 0)], arms: [arm(100, 0), arm(100, 0)] }), b: pose({ t: -12, legs: [leg(12, 0), leg(12, 0)], arms: [arm(-25, 115), arm(-25, 115)] }), p: 2.4, props: ["door"] },
  deadBug: { a: SUPINE({ legs: [leg(180, 90, 180), leg(180, 90, 180)], arms: [arm(180, 0), arm(180, 0)] }), b: SUPINE({ legs: [leg(180, 90, 180), leg(100, 0, 100)], arms: [arm(285, 0), arm(180, 0)] }), alt: true, p: 2.4, anchor: "hip", w: "hands" },
  deadBugHold: { a: SUPINE({ legs: [leg(180, 90, 180), leg(180, 90, 180)], arms: [arm(180, 0), arm(180, 0)] }), anchor: "hip" },
  birdDog: { a: QUAD(), b: QUAD({ legs: [leg(0, 90, -90), leg(-90, 0, -90)], arms: [arm(92, 0), arm(0, 0)] }), alt: true, p: 2.6, anchor: "hip" },
  catCow: { a: QUAD({ n: -28, t: 73 }), b: QUAD({ n: 45, t: 80 }), p: 3.2, anchor: "hip" },
  standingKnee: { a: STAND, b: pose({ t: 16, legs: [leg(100, 95), leg(0, 0)], arms: [arm(-10, 30), arm(35, 110)] }), alt: true, p: 1.8 },
  plank: { a: pose({ t: 84, legs: [leg(-84, 0, -5), leg(-84, 0, -5)], arms: [arm(0, 90), arm(0, 90)] }) },
  kneePlank: { a: pose({ t: 64, legs: [leg(-64, 90, -150), leg(-64, 90, -150)], arms: [arm(0, 90), arm(0, 90)] }) },
  sidePlank: { a: pose({ t: 78, legs: [leg(-78, 0, -12), leg(-78, 0, -12)], arms: [arm(0, 90), arm(180, 0)] }) },
  hollow: { a: pose({ t: -76, legs: [leg(105, 0, 105), leg(105, 0, 105)], arms: [arm(-108, 0), arm(-108, 0)] }), anchor: "hip" },
  crunch: { a: SUPINE({ arms: [arm(110, 60), arm(110, 60)] }), b: SUPINE({ t: -68, arms: [arm(100, 20), arm(100, 20)] }), p: 2.2, anchor: "hip" },
  carry: { a: pose({ arms: [arm(0, 0), arm(0, 0)] }), b: pose({ legs: [leg(42, 64), leg(0, 0)], arms: [arm(0, 0), arm(0, 0)] }), alt: true, p: 1.3, w: "hands" },
  kbCarry: { a: pose({ arms: [arm(20, 140), arm(20, 140)] }), b: pose({ legs: [leg(42, 64), leg(0, 0)], arms: [arm(20, 140), arm(20, 140)] }), alt: true, p: 1.3, w: "chest" },
  twist: { a: pose({ t: -35, legs: [leg(70, 95), leg(70, 95)], arms: [arm(60, 70), arm(60, 70)] }), b: pose({ t: -35, legs: [leg(70, 95), leg(70, 95)], arms: [arm(40, 90), arm(80, 50)] }), alt: true, p: 1.8, anchor: "hip", w: "hands" },
  getUp: { a: SUPINE({ legs: [leg(130, 95), leg(90, 0, 90)], arms: [arm(180, 0), arm(135, 0)] }), b: SUPINE({ t: -62, legs: [leg(130, 95), leg(90, 0, 90)], arms: [arm(180, 0), arm(0, 90)] }), p: 3.2, anchor: "hip", w: "near" },
  seatedMarch: { a: SEATED(), b: SEATED({ legs: [leg(115, 95), leg(90, 90)], arms: [arm(-15, 80), arm(40, 80)] }), alt: true, p: 1.4, props: ["chairA"] },
  armBike: { a: SEATED({ arms: [arm(60, 70), arm(100, 40)] }), b: SEATED({ arms: [arm(100, 40), arm(60, 70)] }), p: 1.2, props: ["chairA"] },
  seatedAnkle: { a: SEATED({ legs: [leg(80, 25, 70), leg(90, 90)] }), b: SEATED({ legs: [leg(80, 25, 125), leg(90, 90)] }), p: 2, props: ["chairA"] },
  sitIso: { a: SEATED({ arms: [arm(30, 80), arm(30, 80)] }), props: ["chairA"] },
  shadowBox: { a: pose({ t: 5, legs: [leg(12, 15), leg(-12, 15)], arms: [arm(25, 120), arm(25, 120)] }), b: pose({ t: 8, legs: [leg(12, 15), leg(-12, 15)], arms: [arm(88, 0), arm(25, 120)] }), alt: true, p: 1 },
  mountain: { a: PLANK_HIGH, b: pose({ t: 71, legs: [leg(60, 130, -80), leg(-71, 0, -5)], arms: [arm(3, 0), arm(3, 0)] }), alt: true, p: 0.9 },
  burpee: { a: pose({ t: 55, legs: [leg(100, 130), leg(100, 130)], arms: [arm(2, 0), arm(2, 0)] }), b: PLANK_HIGH, p: 2.4 },
  thruster: { a: SQUAT_LOW({ arms: [arm(25, 155), arm(25, 155)] }), b: pose({ arms: [arm(176, 4), arm(176, 4)] }), p: 2.4, w: "hands" },
  clean: { a: pose({ t: 62, legs: [leg(25, 32), leg(25, 32)], arms: [arm(-25, 0), arm(-25, 0)] }), b: pose({ arms: [arm(15, 150), arm(4, 0)] }), p: 2, w: "near" },
  bear: { a: pose({ t: 80, legs: [leg(15, 100, -60), leg(15, 100, -60)], arms: [arm(0, 0), arm(0, 0)] }), b: pose({ t: 80, legs: [leg(15, 100, -60), leg(32, 100, -50)], arms: [arm(18, 0), arm(0, 0)] }), m: pose({ t: 80, legs: [leg(15, 100, -60), leg(30, 122, -36)], arms: [arm(9, 0), arm(0, 0)] }), alt: true, p: 1.2 },
  balance: { a: BALANCE({ t: -2 }), b: BALANCE({ t: 2 }), p: 3, anchor: "near" },
  starReach: { a: BALANCE(), b: pose({ t: -8, legs: [leg(15, 30), leg(55, 5, 80)], arms: [arm(40, 10), arm(40, 10)] }), p: 2.6, anchor: "near" },
  longSit: { a: pose({ t: -8, legs: [leg(90, 0, 175), leg(90, 0, 175)], arms: [arm(-25, 0), arm(-25, 0)] }), b: pose({ t: -8, legs: [leg(90, 0, 160), leg(90, 0, 160)], arms: [arm(-25, 0), arm(-25, 0)] }), p: 2.4, anchor: "hip" },
  lieIso: { a: SUPINE({ arms: [arm(100, 80), arm(90, 0)] }), b: SUPINE({ t: -89, arms: [arm(100, 80), arm(90, 0)] }), p: 4, anchor: "hip" },
  standIso: { a: pose({ arms: [arm(0, 90), arm(20, 90)] }), b: pose({ arms: [arm(0, 88), arm(20, 92)] }), p: 3 },
  openBook: { a: pose({ t: -90, legs: [leg(130, 100), leg(130, 100)], arms: [arm(178, 0), arm(178, 0)] }), b: pose({ t: -90, legs: [leg(130, 100), leg(130, 100)], arms: [arm(280, 0), arm(178, 0)] }), p: 3, anchor: "hip" },
  hipFlexor: { a: pose({ t: -4, legs: [leg(80, 80), leg(-15, 92, -120)], arms: [arm(10, 0), arm(10, 0)] }), b: pose({ t: -10, legs: [leg(90, 85), leg(-25, 92, -120)], arms: [arm(10, 0), arm(10, 0)] }), p: 3.2, anchor: "near" },
  thoracicReach: { a: pose({ arms: [arm(150, 30), arm(150, 30)] }), b: pose({ arms: [arm(178, 5), arm(178, 5)] }), p: 2.6, props: ["wallFront"] },
  sphinx: { a: pose({ t: 58, legs: [leg(-90, 0, -90), leg(-90, 0, -90)], arms: [arm(0, 90), arm(0, 90)] }), anchor: "hip" },
  cobra: { a: pose({ t: 74, legs: [leg(-90, 0, -90), leg(-90, 0, -90)], arms: [arm(-60, 70), arm(-60, 70)] }), b: pose({ t: 52, legs: [leg(-90, 0, -90), leg(-90, 0, -90)], arms: [arm(10, 35), arm(10, 35)] }), p: 3.2, anchor: "hip" },
  kneesToChest: { a: pose({ t: -90, legs: [leg(215, 120, 150), leg(215, 120, 150)], arms: [arm(160, 40), arm(160, 40)] }), b: pose({ t: -84, legs: [leg(222, 120, 150), leg(222, 120, 150)], arms: [arm(160, 40), arm(160, 40)] }), p: 3, anchor: "hip" },
  downDog: { a: pose({ t: 132, legs: [leg(-38, 0, 66), leg(-38, 0, 66)], arms: [arm(48, 0), arm(48, 0)] }), b: pose({ t: 136, legs: [leg(-36, 8, 72), leg(-38, 0, 66)], arms: [arm(48, 0), arm(48, 0)] }), p: 3 },
  worldStretch: { a: LUNGE_LOW({ t: 30, arms: [arm(10, 0), arm(10, 0)] }), b: LUNGE_LOW({ t: 25, arms: [arm(176, 0), arm(10, 0)] }), p: 3 },
  childPose: { a: pose({ t: 115, legs: [leg(35, 125, -90), leg(35, 125, -90)], arms: [arm(80, 0), arm(80, 0)] }), b: pose({ t: 118, legs: [leg(38, 128, -90), leg(38, 128, -90)], arms: [arm(82, 0), arm(82, 0)] }), p: 4 },
  forwardFold: { a: pose({ t: 98, legs: [leg(-6, 0), leg(-6, 0)], arms: [arm(0, 0), arm(0, 0)] }), b: pose({ t: 104, legs: [leg(-6, 0), leg(-6, 0)], arms: [arm(0, 0), arm(0, 0)] }), p: 4 },
  strapHam: { a: pose({ t: -90, legs: [leg(185, 0, 100), leg(90, 0, 90)], arms: [arm(172, 0), arm(172, 0)] }), b: pose({ t: -90, legs: [leg(195, 0, 105), leg(90, 0, 90)], arms: [arm(178, 0), arm(178, 0)] }), p: 4, anchor: "hip", props: ["strap"] },
  quadStretch: { a: pose({ legs: [leg(-8, 160, -170), leg(0, 0)], arms: [arm(-15, 0), arm(20, 10)] }), anchor: "far" },
  calfStretch: { a: pose({ t: 15, legs: [leg(30, 35), leg(-25, 0)], arms: [arm(75, 0), arm(75, 0)] }), props: ["wallHands"] },
  chestStretch: { a: pose({ t: 8, legs: [leg(15, 0), leg(-15, 0)], arms: [arm(-70, 160), arm(-70, 160)] }), b: pose({ t: 12, legs: [leg(15, 0), leg(-15, 0)], arms: [arm(-80, 165), arm(-80, 165)] }), p: 4 },
  tricepsStretch: { a: pose({ arms: [arm(172, 160), arm(150, 60)] }) },
  butterfly: { a: pose({ t: -5, legs: [leg(118, 150, 90), leg(118, 150, 90)], arms: [arm(40, 20), arm(40, 20)] }), b: pose({ t: 12, legs: [leg(112, 150, 90), leg(112, 150, 90)], arms: [arm(50, 15), arm(50, 15)] }), p: 3.2, anchor: "hip" },
  seatedFold: { a: pose({ t: -6, legs: [leg(90, 0, 175), leg(90, 0, 175)], arms: [arm(170, 0), arm(170, 0)] }), b: pose({ t: 58, legs: [leg(90, 0, 170), leg(90, 0, 170)], arms: [arm(82, 0), arm(82, 0)] }), p: 3.6, anchor: "hip" },
  reachUp: { a: pose({ arms: [arm(4, 6), arm(4, 6)] }), b: pose({ legs: [leg(0, 0, 70), leg(0, 0, 70)], arms: [arm(178, 0), arm(178, 0)] }), p: 3 },
  warrior: { a: pose({ t: -4, legs: [leg(72, 72), leg(-28, 0, 70)], arms: [arm(176, 0), arm(176, 0)] }) },
  tree: { a: pose({ legs: [leg(0, 0), leg(30, 125, 30)], arms: [arm(178, 0), arm(178, 0)] }), b: pose({ t: 2, legs: [leg(0, 0), leg(30, 125, 30)], arms: [arm(178, 0), arm(178, 0)] }), p: 3, anchor: "near" },
  sunFlow: { a: pose({ arms: [arm(178, 0), arm(178, 0)] }), b: pose({ t: 100, legs: [leg(-6, 0), leg(-6, 0)], arms: [arm(2, 0), arm(2, 0)] }), p: 4 },
  // v1.5: равновесие, осанка, эспандер, корпус. Позы с опорой подобраны так, чтобы кисти
  // оставались на стене или столе, а обе стопы — на полу
  tandem: { a: pose({ legs: [leg(7, 2), leg(-7, 2)], arms: [arm(28, 12), arm(28, 12)] }), b: pose({ t: 2, legs: [leg(7, 2), leg(-7, 2)], arms: [arm(34, 12), arm(22, 12)] }), p: 3.2 },
  legBack: { a: pose({ arms: [arm(10, 10), arm(70, 10)] }), b: pose({ t: 7, legs: [leg(-28, 6), leg(0, 0)], arms: [arm(10, 10), arm(74, 10)] }), p: 2.4, anchor: "far", props: ["wallHands"] },
  kneeLift: { a: pose({ arms: HANDS_HIPS }), b: pose({ legs: [leg(84, 92), leg(0, 0)], arms: HANDS_HIPS }), p: 3.2, anchor: "far" },
  toeRaise: { a: pose({ t: -8, legs: [leg(8, 0), leg(8, 0)] }), b: pose({ t: -8, legs: [leg(8, 0, 124), leg(8, 0, 124)] }), p: 2, props: ["wallBack"], anchor: "heels" },
  rock: { a: pose({ legs: [leg(0, 0, 118), leg(0, 0, 118)], arms: [arm(8, 14), arm(8, 14)] }), b: pose({ legs: [leg(0, 0, 55), leg(0, 0, 55)], arms: [arm(8, 14), arm(8, 14)] }), p: 2.2 },
  hop: { a: pose({ legs: [leg(4, 12, 84), leg(4, 12, 84)], arms: [arm(18, 72), arm(18, 72)] }), b: pose({ air: 0.07, legs: [leg(0, 2, 58), leg(0, 2, 58)], arms: [arm(14, 66), arm(14, 66)] }), p: 0.6 },
  stepBackReach: { a: pose({ arms: [arm(10, 10), arm(10, 10)] }), b: pose({ legs: [leg(14, 12), leg(-26, 6, 62)], arms: [arm(168, 0), arm(168, 0)] }), m: pose({ legs: [leg(8, 10), leg(-14, 34, 82)], arms: [arm(90, 10), arm(90, 10)] }), alt: true, p: 1.6 },
  chinTuck: { a: pose({ n: 22 }), b: pose({ n: -4 }), p: 2.6 },
  shoulderRoll: { a: pose({ arms: [arm(6, 10), arm(6, 10)] }), b: pose({ sh: 0.05, arms: [arm(-10, 10), arm(-10, 10)] }), p: 1.6 },
  handsBehind: { a: pose({ arms: [arm(-28, 4), arm(-28, 4)] }), b: pose({ n: -6, arms: [arm(-44, 4), arm(-44, 4)] }), p: 4 },
  thread: { a: QUAD({ arms: [arm(150, 0), arm(0, 0)] }), b: QUAD({ t: 84, arms: [arm(-78, 0), arm(-31, 55)] }), p: 3.2, anchor: "hip" },
  kneeToWall: { a: pose({ t: 4, legs: [leg(12, 10), leg(-9, 19, 76)], arms: [arm(15, 108), arm(15, 108)] }), b: pose({ t: 8, legs: [leg(28, 62), leg(-7, 48.5, 70)], arms: [arm(9, 147), arm(9, 147)] }), p: 2.6, anchor: "near", props: ["wallHands"] },
  incline: { a: pose({ t: 36, legs: [leg(-36, 0, 40), leg(-36, 0, 40)], arms: [arm(8, 0), arm(8, 0)] }), b: pose({ t: 48, legs: [leg(-48, 0, 34), leg(-48, 0, 34)], arms: [arm(-62, 86), arm(-62, 86)] }), p: 2.4, props: ["tableHands"] },
  bicycle: { a: pose({ t: -72, legs: [leg(160, 95, 150), leg(160, 95, 150)], arms: [arm(170, 150), arm(170, 150)] }), b: pose({ t: -66, legs: [leg(212, 112, 160), leg(108, 0, 108)], arms: [arm(170, 150), arm(170, 150)] }), alt: true, p: 2.2, anchor: "hip" },
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
  armCircles: { a: fpose({ arms: [farm(82, 0), farm(82, 0)] }), b: fpose({ arms: [farm(102, 0), farm(102, 0)] }), p: 0.9 },
  lateralRaise: { a: fpose({ arms: [farm(12, 5), farm(12, 5)] }), b: fpose({ arms: [farm(86, 5), farm(86, 5)] }), p: 2.2, w: "hands" },
  pullApart: { a: fpose({ arms: [farm(38, 45), farm(38, 45)] }), b: fpose({ arms: [farm(90, 0), farm(90, 0)] }), p: 2, props: ["bandHands"] },
  wallAngel: { a: fpose({ arms: [farm(90, 90), farm(90, 90)] }), b: fpose({ arms: [farm(150, 20), farm(150, 20)] }), p: 2.6 },
  sumo: { a: fpose({ legs: [fleg(22), fleg(22)], arms: [farm(4, 0), farm(4, 0)] }), b: fpose({ legs: [fleg(64, 73), fleg(64, 73)], arms: [farm(4, 0), farm(4, 0)] }), p: 2.6, w: "hands" },
  sideLunge: { a: fpose({ legs: [fleg(30), fleg(30)], arms: [farm(10, 90), farm(10, 90)] }), b: fpose({ t: 4, legs: [fleg(70, 110), fleg(57)], arms: [farm(10, 90), farm(10, 90)] }), alt: true, p: 2.6 },
  sideStep: { a: fpose({ legs: [fleg(4, 12), fleg(4, 12)] }), b: fpose({ legs: [fleg(18, 16), fleg(5, 16)], arms: [farm(30, 20), farm(14, 10)] }), m: fpose({ legs: [fleg(12, 16, 0.12), fleg(5, 16)], arms: [farm(22, 15), farm(10, 10)] }), alt: true, p: 1.4, props: ["bandKnees"] },
  legSide: { a: fpose({ arms: [farm(10, 6), farm(70, 10)] }), b: fpose({ legs: [fleg(4), fleg(36)], arms: [farm(10, 6), farm(70, 10)] }), p: 2.2, anchor: "near" },
  stepSide: { a: fpose({ legs: [fleg(4, 12), fleg(4, 12)] }), b: fpose({ legs: [fleg(18, 16), fleg(5, 16)], arms: [farm(30, 20), farm(14, 10)] }), m: fpose({ legs: [fleg(12, 16, 0.12), fleg(5, 16)], arms: [farm(22, 15), farm(10, 10)] }), alt: true, p: 1.4 },
  weightShift: { a: fpose({ legs: [fleg(5), fleg(17)], arms: [farm(22, 12), farm(22, 12)] }), b: fpose({ legs: [fleg(17), fleg(5)], arms: [farm(22, 12), farm(22, 12)] }), p: 3 },
  sideBendWarm: { a: fpose({ arms: [farm(6, 4), farm(6, 4)] }), b: fpose({ t: 18, arms: [farm(150, 40), farm(2, 2)] }), alt: true, p: 2.6 },
  shuffle: { a: fpose({ legs: [fleg(14, 26), fleg(14, 26)], arms: [farm(18, -130), farm(18, -130)] }), b: fpose({ air: 0.03, legs: [fleg(24, 28), fleg(6, 18)], arms: [farm(18, -130), farm(18, -130)] }), alt: true, p: 0.9 },
  bandLateral: { a: fpose({ arms: [farm(12, 5), farm(12, 5)] }), b: fpose({ arms: [farm(86, 5), farm(86, 5)] }), p: 2.2, props: ["bandFeet"] },
  sideBend: { a: fpose({ arms: [farm(170, 10), farm(170, 10)] }), b: fpose({ t: 18, arms: [farm(158, 10), farm(180, 0)] }), p: 3.2 },
  chop: { a: fpose({ t: -6, legs: [fleg(16, 20), fleg(16, 20)], arms: [farm(35, 0), farm(-25, 0)] }), b: fpose({ t: 8, legs: [fleg(8, 4), fleg(8, 4)], arms: [farm(-140, 0), farm(150, 0)] }), p: 2.2, w: "hands" },
  neckTilt: { a: fpose(), b: fpose({ n: 24 }), p: 3.2 },
  halo: { a: fpose({ arms: [farm(150, 75), farm(150, 75)] }), b: fpose({ t: 5, arms: [farm(120, 110), farm(165, 50)] }), alt: true, p: 2.4, w: "chest" }
};

// Какой узор у какого упражнения
const MAP = {
  march: ["march", "fastMarch", "heelToe", "boxStep"], toeWalk: ["toeWalk"], heelWalk: ["heelWalk"], highKnees: ["highKnees"],
  jog: ["jog"], heelKicks: ["heelKicks"], sway: ["hipCircles", "torsoTurns", "kbAround"], neckNod: ["neckMob"],
  handsForward: ["wristMob", "wristFlex", "gripIso", "wristExtIso"], legSwings: ["legSwings"], inchworm: ["inchworm"],
  hinge: ["hipHinge", "goodMorning", "rdl", "bbRdl"], dislocate: ["bandDislocate"], squat: ["squat", "bbSquat", "squatPause"],
  chairSquat: ["chairSquat"], goblet: ["gobletSquat", "kbGoblet"], bridge: ["bridge", "dbHipThrust", "bbHipThrust"],
  singleBridge: ["singleBridge"], bridgeMarch: ["bridgeMarch"], bridgeHold: ["bridgeHold"],
  lunge: ["splitSquat", "reverseLunge", "dbLunge", "bulgarian", "curtsyLunge"], splitHold: ["splitHold"], stepUp: ["stepUp", "dbStepUp", "stepDown"],
  deadlift: ["dbDeadlift", "kbDeadlift", "bbDeadlift"], swing: ["dbSwing", "kbSwing"],
  calfRaise: ["calfRaise", "singleCalf", "heelDrops", "dbCalfRaise"], calfHold: ["calfHold"], wallSit: ["wallSit"],
  wallSitShort: ["wallSitShort"], squatHold: ["squatHold"], squatJump: ["squatJump"], singleHinge: ["singleRdl"], nordic: ["nordic"],
  sideLying: ["sideLeg"], wallPush: ["wallPush", "fistPush"], incline: ["inclinePush"], kneePush: ["kneePush", "narrowKneePush"], pushUp: ["pushUp"],
  pikePush: ["pikePush"], dip: ["chairDip"], chestPress: ["bandPress", "pallof"], floorPress: ["floorPress", "dbFly"],
  benchPress: ["dbBench", "dbIncline", "bbBench"], skull: ["dbSkull"], pullover: ["dbPullover"],
  curl: ["bicepsCurl", "hammerCurl", "bbCurl"], tricepsDown: ["tricepsBand"], press: ["standPress", "kbPress", "bbPress"],
  seatedPress: ["ohPress", "arnoldPress"], ohTriceps: ["ohTriceps"], kickback: ["kickback"], frontRaise: ["frontRaise"],
  superman: ["superman"], backExtHold: ["backExtHold"], proneYT: ["proneYT", "proneW", "scapHold", "reverseSnowAngel"], standRow: ["bandRow"],
  row: ["dbRow", "bentRow", "kbRow", "bbRow", "chestRow"], reverseFly: ["reverseFly"], hang: ["deadHang"],
  pullUp: ["negPullUp", "pullUp", "bandPullUp"], shrug: ["dbShrug"], renegade: ["renegadeRow"], doorRow: ["doorRow"],
  deadBug: ["deadBug", "heelTaps", "dbDeadBug"], deadBugHold: ["deadBugHold"], birdDog: ["birdDog"], catCow: ["catCow"],
  standingKnee: ["standingKnee"], plank: ["plank"], kneePlank: ["kneePlank"], sidePlank: ["sidePlankFull", "copenhagen"], sidePlankKnee: ["sidePlank"],
  hollow: ["hollowHold"], crunch: ["crunch"], carry: ["farmerCarry", "suitcaseCarry"], kbCarry: ["kbCarry"],
  twist: ["russianTwist"], getUp: ["kbGetUp"], seatedMarch: ["seatedMarch"], armBike: ["armBike"],
  seatedAnkle: ["ankleRolls", "ankleAlphabet", "towelScrunch", "ankleIsoOut", "ankleIsoIn"],
  sitIso: ["adductorSqueeze", "abductorPress", "bicepsIso"], shadowBox: ["shadowBox"], mountain: ["mountain"],
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
  sideStep: ["bandWalk"], stepSide: ["stepTouch", "skater", "grapevine"], legSide: ["legSwingSide"], sideBend: ["latStretch"], chop: ["woodchop"],
  neckTilt: ["neckIso", "neckStretch"], halo: ["kbHalo"],
  tandem: ["tandemStand"], legBack: ["backLegRaise"], kneeLift: ["kneeLiftHold"], weightShift: ["weightShift"], toeRaise: ["toeRaise"],
  rock: ["heelToeRock"], hop: ["jumpRope"], stepBackReach: ["stepBackReach"], chinTuck: ["chinTuck"], shoulderRoll: ["shoulderRolls"],
  handsBehind: ["chestBehind"], thread: ["thread"], kneeToWall: ["kneeToWall"], bicycle: ["bicycleSlow"], reverseCrunch: ["reverseCrunch"],
  legLower: ["legLowers"], bearHold: ["bearHold"], shoulderTap: ["shoulderTaps"], facePull: ["facePull"], swimmer: ["proneSwim"],
  bandCurl: ["bandCurl"], bandPressUp: ["bandOhPress"], bandLateral: ["bandLateral"], seatedPunch: ["seatedPunch"], happyBaby: ["happyBaby"],
  sideBendWarm: ["sideBends"], shuffle: ["lateralShuffle"]
};
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
  const legs = p.legs.map(L => {
    const knee = add(hip, down(L.h), LEN.thigh);
    const ankle = add(knee, down(L.h - L.k), LEN.shank);
    const toe = add(ankle, down(L.f), LEN.foot);
    const heel = add(ankle, down(L.f), -LEN.heel);
    return { knee, ankle, toe, heel };
  });
  const arms = p.arms.map(A => {
    const elbow = add(sh, down(A.s), LEN.upper);
    const wrist = add(elbow, down(A.s + A.e), LEN.fore);
    const hand = add(wrist, down(A.s + A.e + A.w), LEN.hand);
    return { elbow, wrist, hand };
  });
  return { hip, sh, neck, head, legs, arms, shL: sh, shR: sh, hipL: hip, hipR: hip };
}
function frontJoints(p) {
  const pelvis = [0, 1];
  const right = [Math.cos(p.t * D), -Math.sin(p.t * D)];
  const chestTop = add(pelvis, upv(p.t), 0.46);
  const neck = add(pelvis, upv(p.t), 0.5 + LEN.neck);
  const head = add(neck, upv(p.t + p.n), LEN.head);
  const hips = [-1, 1].map(sg => add(pelvis, right, sg * 0.09));
  const shs = [-1, 1].map(sg => add(chestTop, right, sg * 0.18));
  const legs = p.legs.map((L, i) => {
    const sg = i === 0 ? -1 : 1;
    const lift = L.lift || 0;
    const knee = add(add(hips[i], [sg * Math.sin(L.h * D), -Math.cos(L.h * D)], LEN.thigh), [0, lift * 0.5]);
    const a2 = L.h - L.k;
    const ankle = add(add(knee, [sg * Math.sin(a2 * D), -Math.cos(a2 * D)], LEN.shank), [0, lift * 0.5]);
    const toe = add(ankle, [sg * 0.07, -0.02]);
    return { knee, ankle, toe, heel: ankle };
  });
  const arms = p.arms.map((A, i) => {
    const sg = i === 0 ? -1 : 1;
    const elbow = add(shs[i], [sg * Math.sin(A.s * D), -Math.cos(A.s * D)], LEN.upper);
    const a2 = A.s + A.e;
    const wrist = add(elbow, [sg * Math.sin(a2 * D), -Math.cos(a2 * D)], LEN.fore);
    const hand = add(wrist, [sg * Math.sin(a2 * D), -Math.cos(a2 * D)], LEN.hand);
    return { elbow, wrist, hand, sh: shs[i] };
  });
  return { front: true, hip: pelvis, sh: chestTop, neck, head, legs, arms, hips, shs, chestTop };
}

const lerp = (a, b, k) => a + (b - a) * k;
function mix(A, B, k) {
  const o = { ...A };
  for (const key of ["t", "n", "sh", "air", "lift"]) o[key] = lerp(A[key] || 0, B[key] || 0, k);
  o.legs = A.legs.map((L, i) => { const M = B.legs[i]; const r = {}; for (const f in L) r[f] = lerp(L[f], M[f], k); return r; });
  o.arms = A.arms.map((L, i) => { const M = B.arms[i]; const r = {}; for (const f in L) r[f] = lerp(L[f], M[f], k); return r; });
  return o;
}
const mirror = Pz => ({ ...Pz, t: Pz.front ? -Pz.t : Pz.t, n: Pz.front ? -Pz.n : Pz.n, legs: [Pz.legs[1], Pz.legs[0]], arms: [Pz.arms[1], Pz.arms[0]] });

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
  else dy = -Math.min(...contactPoints(J).map(([p, r]) => p[1] - r)) + (Pz.air || 0) + (Pz.lift || 0);
  return { J, dy };
}
const shiftJ = (J, dx, dy) => {
  const m = p => [p[0] + dx, p[1] + dy];
  const out = { ...J, hip: m(J.hip), sh: m(J.sh), neck: m(J.neck), head: m(J.head) };
  out.legs = J.legs.map(L => ({ knee: m(L.knee), ankle: m(L.ankle), toe: m(L.toe), heel: m(L.heel) }));
  out.arms = J.arms.map(A => ({ elbow: m(A.elbow), wrist: m(A.wrist), hand: m(A.hand), sh: A.sh && m(A.sh) }));
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
const TORSO_FRONT = [[0, 0.085], [0.18, 0.095], [0.42, 0.088], [0.68, 0.114], [0.86, 0.108], [1, 0.068]];
const TORSO_BACK = [[0, 0.102], [0.07, 0.124], [0.3, 0.084], [0.58, 0.098], [0.84, 0.11], [1, 0.08]];
function torsoAxes(J) {
  const ax = sub2(J.sh, J.hip), L = Math.hypot(ax[0], ax[1]) || 1;
  const u = [ax[0] / L, ax[1] / L];
  return { L, u, f: [u[1], -u[0]] }; // f — направление груди
}
function torsoSide(J, breath = 0) {
  const { L, u, f } = torsoAxes(J);
  const at = (k, off) => [J.hip[0] + u[0] * k * L + f[0] * off, J.hip[1] + u[1] * k * L + f[1] * off];
  // Грудная клетка «дышит»: верх торса чуть расширяется на вдохе
  const bw = k => 1 + breath * Math.max(0, Math.min(1, (k - 0.35) / 0.4));
  const pts = [at(-0.13, 0)];
  for (const [k, w] of TORSO_FRONT) pts.push(at(k, w * bw(k)));
  pts.push(at(1.06, 0));
  for (const [k, w] of TORSO_BACK.slice().reverse()) pts.push(at(k, -w * bw(k)));
  return smoothPath(pts.map(sv));
}
// Торс анфас: [высота от таза, полуширина] — плечи, подмышки, талия, бёдра
const TORSO_HALF = [[0.5, 0.055], [0.475, 0.17], [0.44, 0.2], [0.36, 0.165], [0.22, 0.125], [0.06, 0.15], [-0.04, 0.13]];
function frontAxes(J) {
  const u = unit2(sub2(J.chestTop, J.hip));
  return { u, r: [u[1], -u[0]] };
}
function torsoFront(J, breath = 0) {
  const { u, r } = frontAxes(J);
  const at = (y, x) => [J.hip[0] + u[0] * y + r[0] * x, J.hip[1] + u[1] * y + r[1] * x];
  const bw = y => 1 + breath * Math.max(0, Math.min(1, (y - 0.2) / 0.2));
  const pts = [];
  for (const [y, x] of TORSO_HALF) pts.push(at(y, x * bw(y)));
  pts.push(at(-0.075, 0));
  for (const [y, x] of TORSO_HALF.slice().reverse()) pts.push(at(y, -x * bw(y)));
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
  const at = k => [J.hip[0] + u[0] * k * L + f[0] * off, J.hip[1] + u[1] * k * L + f[1] * off];
  return capsulePath(at(k0), at(k1), r0, r1);
}
// Мышцы торса анфас: грудь, пресс, низ живота и бёдра
const FRONT_PART = { chest: [[0.34, -0.1], [0.34, 0.1], 0.06], abs: [[0.08, 0], [0.27, 0], 0.052], glute: [[0.02, -0.11], [0.02, 0.11], 0.05] };
function torsoPartFront(J, part) {
  const [p0, p1, rr] = FRONT_PART[part];
  const { u, r } = frontAxes(J);
  const at = ([y, x]) => [J.hip[0] + u[0] * y + r[0] * x, J.hip[1] + u[1] * y + r[1] * x];
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
// Кроссовок в профиль: пятка, подошва, носок, подъём и голенище до щиколотки
function shoeSide(L) {
  const f = unit2(sub2(L.toe, L.heel));
  let n = [-f[1], f[0]];
  if (n[0] * (L.ankle[0] - L.heel[0]) + n[1] * (L.ankle[1] - L.heel[1]) < 0) n = [-n[0], -n[1]];
  const at = (p, kf, kn) => [p[0] + f[0] * kf + n[0] * kn, p[1] + f[1] * kf + n[1] * kn];
  const mid = lerp2(L.heel, L.toe, 0.62);
  const pts = [at(L.heel, 0.002, -0.026), at(L.toe, 0.02, -0.026), at(L.toe, 0.028, 0.004), at(L.toe, -0.008, 0.034), at(mid, 0, 0.062), at(L.ankle, 0.04, 0.03), at(L.ankle, -0.036, 0.022), at(L.heel, -0.02, 0.026)];
  return { shoe: smoothPath(pts.map(sv)), sole: capsulePath(at(L.heel, 0.004, -0.021), at(L.toe, 0.02, -0.021), 0.011, 0.011, 4) };
}
// Кисть: ладонь и большой палец со стороны груди
function handParts(A, rad) {
  const d = unit2(sub2(A.hand, A.wrist));
  let p = [-d[1], d[0]];
  if (p[0] < 0) p = [-p[0], -p[1]];
  const at = (k, s) => [A.wrist[0] + d[0] * k + p[0] * s, A.wrist[1] + d[1] * k + p[1] * s];
  return { palm: capsulePath(A.wrist, A.hand, rad[0], rad[1]), thumb: capsulePath(at(0.012, 0.016), at(0.046, 0.03), 0.011, 0.009, 4) };
}
// Волосы в профиль: шапочка от лба через макушку к затылку
function hairSide(J) {
  const hu = unit2(sub2(J.head, J.neck)), hf = [hu[1], -hu[0]];
  const r = LEN.head;
  const pt = (deg, k) => { const a = deg * D; return [J.head[0] + (hf[0] * Math.cos(a) + hu[0] * Math.sin(a)) * r * k, J.head[1] + (hf[1] * Math.cos(a) + hu[1] * Math.sin(a)) * r * k]; };
  const pts = [];
  for (let deg = 52; deg <= 232; deg += 18) pts.push(pt(deg, deg > 200 ? 1.02 : 1.08));
  pts.push(pt(222, 0.72), pt(170, 0.34), pt(80, 0.62));
  return smoothPath(pts.map(sv));
}
// Волосы анфас: чёлка и макушка
function hairFront(J) {
  const up = unit2(sub2(J.head, J.neck)), rt = [up[1], -up[0]];
  const r = LEN.head;
  const pt = (deg, k) => { const a = deg * D; return [J.head[0] + (rt[0] * Math.cos(a) + up[0] * Math.sin(a)) * r * k, J.head[1] + (rt[1] * Math.cos(a) + up[1] * Math.sin(a)) * r * k]; };
  const pts = [];
  for (let deg = 0; deg <= 180; deg += 20) pts.push(pt(deg, 1.07));
  pts.push(pt(168, 0.78), pt(120, 0.58), pt(60, 0.58), pt(12, 0.78));
  return smoothPath(pts.map(sv));
}
// Шорты в профиль: таз от низа до пояса, спереди и сзади чуть шире торса
function shortsSide(J, breath) {
  const { L, u, f } = torsoAxes(J);
  const at = (k, off) => [J.hip[0] + u[0] * k * L + f[0] * off, J.hip[1] + u[1] * k * L + f[1] * off];
  const w = 1.03 + breath;
  return smoothPath([at(-0.14, 0), at(0, 0.088 * w), at(0.17, 0.097 * w), at(0.19, 0), at(0.17, -0.104 * w), at(0.07, -0.12 * w), at(-0.03, -0.098 * w)].map(sv));
}
function shortsFront(J) {
  const { u, r } = frontAxes(J);
  const at = (y, x) => [J.hip[0] + u[0] * y + r[0] * x, J.hip[1] + u[1] * y + r[1] * x];
  return smoothPath([at(0.11, 0.148), at(0.06, 0.156), at(-0.04, 0.136), at(-0.08, 0), at(-0.04, -0.136), at(0.06, -0.156), at(0.11, -0.148), at(0.12, 0)].map(sv));
}
function buildRig(svg, front, load = {}) {
  const R = { front, overlays: [], parts: [] };
  svg.append(s("line", { class: "d-ground", x1: -1.25, y1: 0.012, x2: 1.25, y2: 0.012, "stroke-width": 0.02 }));
  R.shadow = s("ellipse", { class: "d-shadow", cx: 0, cy: 0.004, rx: 0.3, ry: 0.032 });
  svg.append(R.shadow);
  R.props = s("g", { class: "d-props" });
  svg.append(R.props);
  const work = [];
  for (const [key, lv] of Object.entries(load)) for (const [seg, side = 0, k = 1] of LOAD_PARTS[key] || []) work.push({ seg, side, alpha: ALPHA[Math.min(3, lv)] * k });
  const rad = front ? FRAD : RAD;
  // part(группа, класс, функция пути) — элемент, который перерисовывается каждый кадр
  const part = (g, cls, fn) => { const el = makePath(g, cls); R.parts.push({ el, fn }); return el; };
  const overlay = (g, alpha, fn) => { const el = makePath(g, "d-work", { "fill-opacity": alpha.toFixed(2) }); R.overlays.push({ el, path: fn }); };
  const limbWork = (g, i, segs) => {
    for (const p of work) {
      if (!segs.includes(p.seg)) continue;
      if (p.seg === "delt") overlay(g, p.alpha, J => { const A = J.arms[i], sh = front ? A.sh : J.sh; return capsulePath(sh, lerp2(sh, A.elbow, 0.42), rad.upper[0] * 1.12, rad.upper[0] * 0.92); });
      else if (p.seg === "thigh") overlay(g, p.alpha, J => musclePath(front ? J.hips[i] : J.hip, J.legs[i].knee, ...rad.thigh, front ? 0 : p.side));
      else if (p.seg === "shank") overlay(g, p.alpha, J => musclePath(J.legs[i].knee, J.legs[i].ankle, ...rad.shank, front ? 0 : p.side, 0.06, 0.72));
      else if (p.seg === "upper") overlay(g, p.alpha, J => musclePath(front ? J.arms[i].sh : J.sh, J.arms[i].elbow, ...rad.upper, 0));
      else if (p.seg === "fore") overlay(g, p.alpha, J => musclePath(J.arms[i].elbow, J.arms[i].wrist, ...rad.fore, 0));
    }
  };
  const hipOf = (J, i) => (front ? J.hips[i] : J.hip);
  const shOf = (J, i) => (front ? J.arms[i].sh : J.sh);
  const leg = (g, i) => {
    part(g, "d-skin", J => capsulePath(hipOf(J, i), J.legs[i].knee, ...rad.thigh));
    part(g, "d-skin", J => capsulePath(J.legs[i].knee, J.legs[i].ankle, ...rad.shank));
    part(g, "d-shade", J => shadePath(hipOf(J, i), J.legs[i].knee, ...rad.thigh));
    part(g, "d-shade", J => shadePath(J.legs[i].knee, J.legs[i].ankle, ...rad.shank));
    if (front) part(g, "d-shoe", J => capsulePath([J.legs[i].ankle[0], J.legs[i].ankle[1] - 0.012], J.legs[i].toe, 0.04, 0.034));
    else {
      part(g, "d-shoe", J => shoeSide(J.legs[i]).shoe);
      part(g, "d-sole", J => shoeSide(J.legs[i]).sole);
    }
    part(g, "d-shorts", J => capsulePath(hipOf(J, i), lerp2(hipOf(J, i), J.legs[i].knee, 0.44), rad.thigh[0] * 1.08, rad.thigh[0] * 1.03));
    limbWork(g, i, ["thigh", "shank"]);
  };
  const arm = (g, i) => {
    part(g, "d-skin", J => capsulePath(shOf(J, i), J.arms[i].elbow, ...rad.upper));
    part(g, "d-skin", J => capsulePath(J.arms[i].elbow, J.arms[i].wrist, ...rad.fore));
    part(g, "d-shade", J => shadePath(J.arms[i].elbow, J.arms[i].wrist, ...rad.fore));
    part(g, "d-skin", J => handParts(J.arms[i], rad.hand).palm);
    part(g, "d-skin", J => handParts(J.arms[i], rad.hand).thumb);
    part(g, "d-shirt", J => capsulePath(shOf(J, i), lerp2(shOf(J, i), J.arms[i].elbow, 0.44), rad.upper[0] * (front ? 1.06 : 1.08), rad.upper[0] * 1.04));
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
  if (front) {
    leg(fig, 0);
    leg(fig, 1);
    part(fig, "d-skin", J => capsulePath(J.chestTop, J.neck, ...rad.neck));
    part(fig, "d-shirt", (J, b) => torsoFront(J, b));
    part(fig, "d-shorts", J => shortsFront(J));
    torsoWork(fig);
    const ear = sg => J => { const { r } = frontAxes(J); return capsulePath([J.head[0] + r[0] * sg * 0.098, J.head[1] + r[1] * sg * 0.098 - 0.006], [J.head[0] + r[0] * sg * 0.1, J.head[1] + r[1] * sg * 0.1 - 0.02], 0.02, 0.016, 4); };
    part(fig, "d-skin", ear(-1));
    part(fig, "d-skin", ear(1));
    R.head = s("circle", { class: "d-skin", r: LEN.head });
    fig.append(R.head);
    part(fig, "d-hair", J => hairFront(J));
    R.eyes = [0, 1].map(() => { const e = s("circle", { class: "d-eye", r: 0.0115 }); fig.append(e); return e; });
    R.mouth = s("line", { class: "d-mouth" });
    fig.append(R.mouth);
    arm(fig, 0);
    arm(fig, 1);
  } else {
    const far = s("g", { class: "d-far-g" });
    fig.append(far);
    arm(far, 1);
    leg(far, 1);
    part(fig, "d-skin", J => capsulePath(J.sh, J.neck, ...rad.neck));
    part(fig, "d-shirt", (J, b) => torsoSide(J, b));
    part(fig, "d-shorts", (J, b) => shortsSide(J, b));
    torsoWork(fig);
    if (work.some(p => p.seg === "neck")) overlay(fig, work.find(p => p.seg === "neck").alpha, J => capsulePath(J.sh, J.neck, RAD.neck[0] * 0.8, RAD.neck[1] * 0.8));
    R.head = s("circle", { class: "d-skin", r: LEN.head });
    fig.append(R.head);
    part(fig, "d-hair", J => hairSide(J));
    R.ear = s("ellipse", { class: "d-ear", rx: 0.017, ry: 0.024 });
    R.nose = s("circle", { class: "d-skin", r: 0.02 });
    R.eye = s("circle", { class: "d-eye", r: 0.0125 });
    R.mouth = s("line", { class: "d-mouth" });
    fig.append(R.ear, R.nose, R.eye, R.mouth);
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
    R.eyes.forEach((e, k) => setCircle(e, [J.head[0] + r[0] * (k ? 0.036 : -0.036) + hu[0] * 0.006, J.head[1] + r[1] * (k ? 0.036 : -0.036) + hu[1] * 0.006]));
    setLine(R.mouth, [J.head[0] - r[0] * 0.022 - hu[0] * 0.05, J.head[1] - r[1] * 0.022 - hu[1] * 0.05], [J.head[0] + r[0] * 0.022 - hu[0] * 0.05, J.head[1] + r[1] * 0.022 - hu[1] * 0.05]);
  } else {
    const hf = [hu[1], -hu[0]];
    const at = (kf, ku) => [J.head[0] + hf[0] * kf + hu[0] * ku, J.head[1] + hf[1] * kf + hu[1] * ku];
    setCircle(R.nose, at(0.098, -0.012));
    setCircle(R.eye, at(0.058, 0.02));
    setCircle(R.ear, at(-0.012, -0.004));
    R.ear.setAttribute("rx", "0.017");
    setLine(R.mouth, at(0.084, -0.05), at(0.058, -0.054));
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
  const g = R.props;
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
function frameAt(pat, time) {
  if (!pat.b) return { A: pat.a, B: pat.a, k: 0 };
  const per = pat.p || 2.6;
  const cycles = pat.alt ? 2 : 1;
  let u = (time / per) % cycles;
  const second = u >= 1;
  u -= Math.floor(u);
  const B = second ? mirror(pat.b) : pat.b;
  let k;
  if (u < 0.15) k = 0;
  else if (u < 0.5) k = ease((u - 0.15) / 0.35);
  else if (u < 0.65) k = 1;
  else k = 1 - ease((u - 0.65) / 0.35);
  return { A: pat.a, B, k, second };
}
// Поза в долю k: если у узора есть промежуточная поза m, путь идёт A → m → B
function poseAt(pat, B, k, second) {
  if (!pat.m) return mix(pat.a, B, k);
  const M = second ? mirror(pat.m) : pat.m;
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

// Положение по горизонтали: опорная точка неподвижна, движение — по центру кадра
// Высокие предметы: стена, дверь, крепление эспандера — для них нужна полная высота кадра
const TALL_PROPS = ["wallHands", "wallFront", "wallBack", "door", "bandUp", "bandFront"];
function layout(pat) {
  const anchor = pat.anchor || "feet";
  const poses = [pat.a, pat.b || pat.a];
  if (pat.alt && pat.b) poses.push(mirror(pat.b));
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
const opts = { speed: 1, still: false };
let clock = 0, lastNow = 0;
export function setOptions({ speed, still } = {}) {
  if (typeof speed === "number" && speed >= 0.25 && speed <= 2) opts.speed = speed;
  if (typeof still === "boolean") opts.still = still;
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

// Демонстрация техники: SVG-фигура, которая повторяет движение упражнения
export function exerciseDemo(id, { label, paused = false } = {}) {
  const pid = patternOf(id);
  const pat = P[pid] || P.stand;
  const front = !!pat.a.front;
  const { anchor, target, top } = layout(pat);
  const stance = stanceLeg(pat);
  const JA0 = place(pat, pat.a).J;
  const svg = s("svg", { class: "demo-svg", viewBox: viewBoxFor(top), role: "img", "aria-label": label || `Схема движения: ${(EX[id] || { name: "" }).name}` });
  const R = buildRig(svg, front, (EX[id] || {}).load || {});
  const placeAt = (Pz, second = false) => {
    const { J, dy } = place(pat, Pz);
    return shiftJ(J, placeShift(pat, J, target, anchor, stance, second, JA0), dy);
  };
  const JA = placeAt(pat.a), JB = placeAt(pat.b || pat.a);
  addStaticProps(R, pat, JA, JB);
  addWeights(R, weightKind(id), id === "bbSquat" ? "back" : pat.w, front);
  const still = reduced();
  const update = time => {
    let Pz, second = false;
    if (still) Pz = pat.b || pat.a;
    else if (!pat.b) Pz = mix(pat.a, { ...pat.a, t: pat.a.t + (front ? 0 : 1.2) }, (1 - Math.cos(time * Math.PI / 2)) / 2);
    else {
      const f = frameAt(pat, time);
      Pz = poseAt(pat, f.B, f.k, f.second);
      second = f.second;
    }
    // Спокойное дыхание: грудная клетка чуть расширяется раз в 3,6 секунды
    drawRig(R, placeAt(Pz, second), still ? 0 : 0.014 * Math.sin(time * 2 * Math.PI / 3.6));
  };
  update(0);
  svg.lpFrame = update; // для проверки: кадр в заданное время
  if (!still && !paused) {
    active.add({ svg, update, born: performance.now(), seen: false, start: clock });
    if (!raf) raf = requestAnimationFrame(loop);
  }
  return svg;
}

// Для проверки: статичный кадр узора (0 — поза A, 1 — поза B)
export function patternFrame(pid, k = 0) {
  const pat = P[pid];
  const front = !!pat.a.front;
  const { anchor, target, top } = layout(pat);
  const svg = s("svg", { class: "demo-svg", viewBox: viewBoxFor(top) });
  const R = buildRig(svg, front);
  const placeAt = Pz => { const { J, dy } = place(pat, Pz); return shiftJ(J, target - anchorX(J, anchor), dy); };
  const JA = placeAt(pat.a), JB = placeAt(pat.b || pat.a);
  addStaticProps(R, pat, JA, JB);
  addWeights(R, pat.w ? "db" : null, pat.w, front);
  drawRig(R, placeAt(pat.b ? mix(pat.a, pat.b, k) : pat.a));
  return svg;
}
export const PATTERN_IDS = Object.keys(P);
export const patternDef = pid => P[pid];
// Для проверки: суставы фигуры в кадре k (0 — поза A, 1 — поза B; mirrored — вторая сторона)
export function patternJoints(pid, k = 0, mirrored = false) {
  const pat = P[pid];
  if (mirrored && !pat.alt) return null;
  const { anchor, target } = layout(pat);
  const stance = stanceLeg(pat);
  const B = pat.b ? (mirrored ? mirror(pat.b) : pat.b) : pat.a;
  const { J, dy } = place(pat, pat.b ? poseAt(pat, B, k, mirrored) : pat.a);
  return shiftJ(J, placeShift(pat, J, target, anchor, stance, mirrored, place(pat, pat.a).J), dy);
}
