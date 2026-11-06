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
const fleg = (h = 4, k = 0) => ({ h, k });
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
  inchworm: { a: pose({ t: 108, legs: [leg(-8, 0), leg(-8, 0)], arms: [arm(6, 0), arm(6, 0)] }), b: PLANK_HIGH, p: 3 },
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
  calfRaise: { a: STAND, b: pose({ legs: [leg(0, 0, 50), leg(0, 0, 50)] }), p: 2, w: "hands" },
  calfHold: { a: pose({ legs: [leg(0, 0, 60), leg(0, 0, 60)] }) },
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
  pullover: { a: SUPINE({ arms: [arm(178, 4), arm(178, 4)] }), b: SUPINE({ arms: [arm(-78, 6), arm(-78, 6)] }), p: 2.8, anchor: "hip", w: "hands" },
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
  hang: { a: pose({ t: -2, legs: [leg(4, 20), leg(4, 20)], arms: [arm(178, 0), arm(178, 0)] }), hang: 1.98, props: ["bar"] },
  pullUp: { a: pose({ t: -2, legs: [leg(4, 20), leg(4, 20)], arms: [arm(178, 0), arm(178, 0)] }), b: pose({ t: -6, legs: [leg(14, 40), leg(14, 40)], arms: [arm(-12, 186), arm(-12, 186)] }), p: 2.8, hang: 1.98, props: ["bar"] },
  shrug: { a: pose({ arms: [arm(2, 0), arm(2, 0)] }), b: pose({ sh: 0.05, arms: [arm(2, 0), arm(2, 0)] }), p: 1.8, w: "hands" },
  renegade: { a: PLANK_HIGH, b: pose({ t: 71, legs: [leg(-71, 0, -5), leg(-71, 0, -5)], arms: [arm(-72, 82), arm(3, 0)] }), alt: true, p: 2.2, w: "hands" },
  doorRow: { a: pose({ t: -28, legs: [leg(28, 0), leg(28, 0)], arms: [arm(100, 0), arm(100, 0)] }), b: pose({ t: -12, legs: [leg(12, 0), leg(12, 0)], arms: [arm(-25, 115), arm(-25, 115)] }), p: 2.4, props: ["door"] },
  deadBug: { a: SUPINE({ legs: [leg(180, 90, 180), leg(180, 90, 180)], arms: [arm(180, 0), arm(180, 0)] }), b: SUPINE({ legs: [leg(180, 90, 180), leg(100, 0, 100)], arms: [arm(-75, 0), arm(180, 0)] }), alt: true, p: 2.4, anchor: "hip", w: "hands" },
  deadBugHold: { a: SUPINE({ legs: [leg(180, 90, 180), leg(180, 90, 180)], arms: [arm(180, 0), arm(180, 0)] }), anchor: "hip" },
  birdDog: { a: QUAD(), b: QUAD({ legs: [leg(0, 90, -90), leg(-90, 0, -90)], arms: [arm(92, 0), arm(0, 0)] }), alt: true, p: 2.6, anchor: "hip" },
  catCow: { a: QUAD({ n: -28, t: 73 }), b: QUAD({ n: 45, t: 80 }), p: 3.2, anchor: "hip" },
  standingKnee: { a: STAND, b: pose({ t: 16, legs: [leg(100, 95), leg(0, 0)], arms: [arm(-10, 30), arm(35, 110)] }), alt: true, p: 1.8 },
  plank: { a: pose({ t: 84, legs: [leg(-84, 0, -5), leg(-84, 0, -5)], arms: [arm(0, 90), arm(0, 90)] }) },
  kneePlank: { a: pose({ t: 64, legs: [leg(-64, 90, -150), leg(-64, 90, -150)], arms: [arm(0, 90), arm(0, 90)] }) },
  sidePlank: { a: pose({ t: 78, legs: [leg(-78, 0, -12), leg(-78, 0, -12)], arms: [arm(0, 90), arm(180, 0)] }) },
  hollow: { a: pose({ t: -76, legs: [leg(105, 0, 105), leg(105, 0, 105)], arms: [arm(-108, 0), arm(-108, 0)] }), anchor: "hip" },
  crunch: { a: SUPINE({ arms: [arm(110, 60), arm(110, 60)] }), b: SUPINE({ t: -68, arms: [arm(100, 20), arm(100, 20)] }), p: 2.2, anchor: "hip" },
  carry: { a: pose({ arms: [arm(0, 0), arm(0, 0)] }), b: pose({ legs: [leg(30, 35), leg(-12, 8)], arms: [arm(0, 0), arm(0, 0)] }), alt: true, p: 1.4, w: "hands" },
  kbCarry: { a: pose({ arms: [arm(20, 140), arm(20, 140)] }), b: pose({ legs: [leg(30, 35), leg(-12, 8)], arms: [arm(20, 140), arm(20, 140)] }), alt: true, p: 1.4, w: "chest" },
  twist: { a: pose({ t: -35, legs: [leg(70, 95), leg(70, 95)], arms: [arm(60, 70), arm(60, 70)] }), b: pose({ t: -35, legs: [leg(70, 95), leg(70, 95)], arms: [arm(40, 90), arm(80, 50)] }), alt: true, p: 1.8, anchor: "hip", w: "hands" },
  getUp: { a: SUPINE({ legs: [leg(130, 95), leg(90, 0, 90)], arms: [arm(180, 0), arm(135, 0)] }), b: SUPINE({ t: -62, legs: [leg(130, 95), leg(90, 0, 90)], arms: [arm(180, 0), arm(0, 90)] }), p: 3.2, anchor: "hip", w: "near" },
  seatedMarch: { a: SEATED(), b: SEATED({ legs: [leg(115, 95), leg(90, 90)], arms: [arm(-15, 80), arm(40, 80)] }), alt: true, p: 1.4, props: ["chairA"] },
  armBike: { a: SEATED({ arms: [arm(60, 70), arm(100, 40)] }), b: SEATED({ arms: [arm(100, 40), arm(60, 70)] }), p: 1.2, props: ["chairA"] },
  seatedAnkle: { a: SEATED({ legs: [leg(80, 25, 70), leg(90, 90)] }), b: SEATED({ legs: [leg(80, 25, 125), leg(90, 90)] }), p: 2, props: ["chairA"] },
  sitIso: { a: SEATED({ arms: [arm(30, 80), arm(30, 80)] }), props: ["chairA"] },
  shadowBox: { a: pose({ t: 5, legs: [leg(12, 15), leg(-12, 15)], arms: [arm(25, 120), arm(25, 120)] }), b: pose({ t: 8, legs: [leg(12, 15), leg(-12, 15)], arms: [arm(88, 0), arm(25, 120)] }), alt: true, p: 1 },
  mountain: { a: PLANK_HIGH, b: pose({ t: 71, legs: [leg(32, 112, 0), leg(-71, 0, -5)], arms: [arm(3, 0), arm(3, 0)] }), alt: true, p: 0.9 },
  burpee: { a: pose({ t: 55, legs: [leg(100, 130), leg(100, 130)], arms: [arm(2, 0), arm(2, 0)] }), b: PLANK_HIGH, p: 2.4 },
  thruster: { a: SQUAT_LOW({ arms: [arm(25, 155), arm(25, 155)] }), b: pose({ arms: [arm(176, 4), arm(176, 4)] }), p: 2.4, w: "hands" },
  clean: { a: pose({ t: 62, legs: [leg(25, 32), leg(25, 32)], arms: [arm(-25, 0), arm(-25, 0)] }), b: pose({ arms: [arm(15, 150), arm(4, 0)] }), p: 2, w: "near" },
  bear: { a: pose({ t: 80, legs: [leg(15, 100, -60), leg(15, 100, -60)], arms: [arm(0, 0), arm(0, 0)] }), b: pose({ t: 80, legs: [leg(15, 100, -60), leg(32, 100, -50)], arms: [arm(18, 0), arm(0, 0)] }), alt: true, p: 1.2 },
  balance: { a: BALANCE({ t: -2 }), b: BALANCE({ t: 2 }), p: 3, anchor: "near" },
  starReach: { a: BALANCE(), b: pose({ t: -8, legs: [leg(15, 30), leg(55, 5, 80)], arms: [arm(40, 10), arm(40, 10)] }), p: 2.6, anchor: "near" },
  longSit: { a: pose({ t: -8, legs: [leg(90, 0, 175), leg(90, 0, 175)], arms: [arm(-25, 0), arm(-25, 0)] }), b: pose({ t: -8, legs: [leg(90, 0, 160), leg(90, 0, 160)], arms: [arm(-25, 0), arm(-25, 0)] }), p: 2.4, anchor: "hip" },
  lieIso: { a: SUPINE({ arms: [arm(100, 80), arm(90, 0)] }), b: SUPINE({ t: -89, arms: [arm(100, 80), arm(90, 0)] }), p: 4, anchor: "hip" },
  standIso: { a: pose({ arms: [arm(0, 90), arm(20, 90)] }), b: pose({ arms: [arm(0, 88), arm(20, 92)] }), p: 3 },
  openBook: { a: pose({ t: -90, legs: [leg(130, 100), leg(130, 100)], arms: [arm(178, 0), arm(178, 0)] }), b: pose({ t: -90, legs: [leg(130, 100), leg(130, 100)], arms: [arm(-80, 0), arm(178, 0)] }), p: 3, anchor: "hip" },
  hipFlexor: { a: pose({ t: -4, legs: [leg(80, 80), leg(-15, 92, -120)], arms: [arm(10, 0), arm(10, 0)] }), b: pose({ t: -10, legs: [leg(90, 85), leg(-25, 92, -120)], arms: [arm(10, 0), arm(10, 0)] }), p: 3.2, anchor: "far" },
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

  // ----- Анфас -----
  jacks: { a: fpose(), b: fpose({ air: 0.05, legs: [fleg(18), fleg(18)], arms: [farm(165, 8), farm(165, 8)] }), p: 1 },
  stepJack: { a: fpose(), b: fpose({ legs: [fleg(20), fleg(3)], arms: [farm(150, 10), farm(150, 10)] }), alt: true, p: 1.4 },
  armCircles: { a: fpose({ arms: [farm(82, 0), farm(82, 0)] }), b: fpose({ arms: [farm(102, 0), farm(102, 0)] }), p: 0.9 },
  lateralRaise: { a: fpose({ arms: [farm(12, 5), farm(12, 5)] }), b: fpose({ arms: [farm(86, 5), farm(86, 5)] }), p: 2.2, w: "hands" },
  pullApart: { a: fpose({ arms: [farm(38, 45), farm(38, 45)] }), b: fpose({ arms: [farm(90, 0), farm(90, 0)] }), p: 2, props: ["bandHands"] },
  wallAngel: { a: fpose({ arms: [farm(90, 90), farm(90, 90)] }), b: fpose({ arms: [farm(150, 20), farm(150, 20)] }), p: 2.6 },
  sumo: { a: fpose({ legs: [fleg(22), fleg(22)], arms: [farm(4, 0), farm(4, 0)] }), b: fpose({ legs: [fleg(64, 88), fleg(64, 88)], arms: [farm(4, 0), farm(4, 0)] }), p: 2.6, w: "hands" },
  sideLunge: { a: fpose({ legs: [fleg(30), fleg(30)], arms: [farm(10, 90), farm(10, 90)] }), b: fpose({ t: 4, legs: [fleg(66, 104), fleg(40)], arms: [farm(10, 90), farm(10, 90)] }), alt: true, p: 2.6 },
  sideStep: { a: fpose({ legs: [fleg(4, 12), fleg(4, 12)] }), b: fpose({ legs: [fleg(18, 16), fleg(5, 16)], arms: [farm(30, 20), farm(14, 10)] }), alt: true, p: 1.4, props: ["bandKnees"] },
  legSide: { a: fpose({ arms: [farm(10, 6), farm(70, 10)] }), b: fpose({ legs: [fleg(4), fleg(36)], arms: [farm(10, 6), farm(70, 10)] }), p: 2.2 },
  sideBend: { a: fpose({ arms: [farm(170, 10), farm(170, 10)] }), b: fpose({ t: 18, arms: [farm(158, 10), farm(180, 0)] }), p: 3.2 },
  chop: { a: fpose({ t: -6, legs: [fleg(16, 20), fleg(16, 20)], arms: [farm(35, 0), farm(-25, 0)] }), b: fpose({ t: 8, legs: [fleg(16, 6), fleg(16, 6)], arms: [farm(-140, 0), farm(150, 0)] }), p: 2.2, w: "hands" },
  neckTilt: { a: fpose(), b: fpose({ n: 24 }), p: 3.2 },
  halo: { a: fpose({ arms: [farm(150, 75), farm(150, 75)] }), b: fpose({ t: 5, arms: [farm(120, 110), farm(165, 50)] }), alt: true, p: 2.4, w: "chest" }
};

// Какой узор у какого упражнения
const MAP = {
  march: ["march", "fastMarch", "heelToe", "boxStep"], toeWalk: ["toeWalk"], heelWalk: ["heelWalk"], highKnees: ["highKnees"],
  jog: ["jog"], heelKicks: ["heelKicks"], sway: ["hipCircles", "torsoTurns", "kbAround"], neckNod: ["neckMob"],
  handsForward: ["wristMob", "wristFlex", "gripIso", "wristExtIso"], legSwings: ["legSwings"], inchworm: ["inchworm"],
  hinge: ["hipHinge", "goodMorning", "rdl", "bbRdl"], dislocate: ["bandDislocate"], squat: ["squat", "bbSquat"],
  chairSquat: ["chairSquat"], goblet: ["gobletSquat", "kbGoblet"], bridge: ["bridge", "dbHipThrust", "bbHipThrust"],
  singleBridge: ["singleBridge"], bridgeMarch: ["bridgeMarch"], bridgeHold: ["bridgeHold"],
  lunge: ["splitSquat", "reverseLunge", "dbLunge", "bulgarian"], splitHold: ["splitHold"], stepUp: ["stepUp", "dbStepUp"],
  deadlift: ["dbDeadlift", "kbDeadlift", "bbDeadlift"], swing: ["dbSwing", "kbSwing"],
  calfRaise: ["calfRaise", "singleCalf", "heelDrops", "dbCalfRaise"], calfHold: ["calfHold"], wallSit: ["wallSit"],
  wallSitShort: ["wallSitShort"], squatHold: ["squatHold"], squatJump: ["squatJump"], singleHinge: ["singleRdl"], nordic: ["nordic"],
  sideLying: ["sideLeg"], wallPush: ["wallPush", "fistPush", "inclinePush"], kneePush: ["kneePush"], pushUp: ["pushUp"],
  pikePush: ["pikePush"], dip: ["chairDip"], chestPress: ["bandPress", "pallof"], floorPress: ["floorPress", "dbFly"],
  benchPress: ["dbBench", "dbIncline", "bbBench"], skull: ["dbSkull"], pullover: ["dbPullover"],
  curl: ["bicepsCurl", "hammerCurl", "bbCurl"], tricepsDown: ["tricepsBand"], press: ["standPress", "kbPress", "bbPress"],
  seatedPress: ["ohPress", "arnoldPress"], ohTriceps: ["ohTriceps"], kickback: ["kickback"], frontRaise: ["frontRaise"],
  superman: ["superman"], backExtHold: ["backExtHold"], proneYT: ["proneYT", "proneW", "scapHold"], standRow: ["bandRow"],
  row: ["dbRow", "bentRow", "kbRow", "bbRow", "chestRow"], reverseFly: ["reverseFly"], hang: ["deadHang"],
  pullUp: ["negPullUp", "pullUp", "bandPullUp"], shrug: ["dbShrug"], renegade: ["renegadeRow"], doorRow: ["doorRow"],
  deadBug: ["deadBug", "heelTaps", "dbDeadBug"], deadBugHold: ["deadBugHold"], birdDog: ["birdDog"], catCow: ["catCow"],
  standingKnee: ["standingKnee"], plank: ["plank"], kneePlank: ["kneePlank"], sidePlank: ["sidePlank", "copenhagen"],
  hollow: ["hollowHold"], crunch: ["crunch"], carry: ["farmerCarry", "suitcaseCarry"], kbCarry: ["kbCarry"],
  twist: ["russianTwist"], getUp: ["kbGetUp"], seatedMarch: ["seatedMarch"], armBike: ["armBike"],
  seatedAnkle: ["ankleRolls", "ankleAlphabet", "towelScrunch", "ankleIsoOut", "ankleIsoIn"],
  sitIso: ["adductorSqueeze", "abductorPress", "bicepsIso"], shadowBox: ["shadowBox"], mountain: ["mountain"],
  burpee: ["burpeeLow"], thruster: ["thruster"], clean: ["kbClean"], bear: ["bearCrawl"], balance: ["singleLeg", "pillowBalance"],
  starReach: ["starReach"], longSit: ["quadSet"], lieIso: ["gluteSqueeze", "hamIso", "bellyBreath"],
  standIso: ["shoulderER", "shoulderIR", "shoulderAbd", "pressHold"], openBook: ["openBook"], hipFlexor: ["hipFlexor"],
  thoracicReach: ["thoracicReach"], sphinx: ["sphinx"], cobra: ["cobra"], kneesToChest: ["kneesToChest", "figure4"],
  downDog: ["downDog"], worldStretch: ["worldStretch"], childPose: ["childPose"], forwardFold: ["hamStretch"],
  strapHam: ["strapHam"], quadStretch: ["quadStretch"], calfStretch: ["calfStretch"], chestStretch: ["chestStretch"],
  tricepsStretch: ["tricepsStretch"], butterfly: ["butterfly"], seatedFold: ["seatedFold"], reachUp: ["reachUp"],
  warrior: ["warrior"], tree: ["tree"], sunFlow: ["sunFlow"],
  jacks: ["jacks"], stepJack: ["stepJack"], armCircles: ["armCircles"], lateralRaise: ["lateralRaise"], pullApart: ["pullApart"],
  wallAngel: ["wallAngel"], sumo: ["plieSquat", "dbSumo", "kbSumo"], sideLunge: ["lateralLunge", "cossack"],
  sideStep: ["bandWalk", "stepTouch", "skater"], legSide: ["legSwingSide"], sideBend: ["latStretch"], chop: ["woodchop"],
  neckTilt: ["neckIso", "neckStretch"], halo: ["kbHalo"]
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
    const knee = add(hips[i], [sg * Math.sin(L.h * D), -Math.cos(L.h * D)], LEN.thigh);
    const a2 = L.h - L.k;
    const ankle = add(knee, [sg * Math.sin(a2 * D), -Math.cos(a2 * D)], LEN.shank);
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
const SEG_W = { thigh: 0.12, shank: 0.095, foot: 0.06, torso: 0.2, neck: 0.075, upper: 0.085, fore: 0.07, hand: 0.05 };
function makeLine(svg, cls, w) {
  const el = s("line", { class: cls, "stroke-width": w, "stroke-linecap": "round" });
  svg.append(el);
  return el;
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

function buildRig(svg, front) {
  const R = { front };
  svg.append(s("line", { class: "d-ground", x1: -1.25, y1: 0.012, x2: 1.25, y2: 0.012, "stroke-width": 0.02 }));
  R.props = s("g", { class: "d-props" });
  svg.append(R.props);
  if (front) {
    R.legs = [0, 1].map(() => ({ thigh: makeLine(svg, "d-near", SEG_W.thigh), shank: makeLine(svg, "d-near", SEG_W.shank), foot: makeLine(svg, "d-near", SEG_W.foot) }));
    R.pelvis = makeLine(svg, "d-body", 0.15);
    R.torso = makeLine(svg, "d-body", 0.3);
    R.shoulders = makeLine(svg, "d-body", 0.11);
    R.neck = makeLine(svg, "d-body", SEG_W.neck);
    R.head = s("circle", { class: "d-head", r: LEN.head });
    svg.append(R.head);
    R.arms = [0, 1].map(() => ({ upper: makeLine(svg, "d-near", SEG_W.upper), fore: makeLine(svg, "d-near", SEG_W.fore), hand: makeLine(svg, "d-near", SEG_W.hand) }));
  } else {
    const limb = cls => ({
      arm: { upper: null, fore: null, hand: null },
      leg: { thigh: null, shank: null, foot: null },
      cls
    });
    const far = limb("d-far"), near = limb("d-near");
    far.arm = { upper: makeLine(svg, "d-far", SEG_W.upper), fore: makeLine(svg, "d-far", SEG_W.fore), hand: makeLine(svg, "d-far", SEG_W.hand) };
    far.leg = { thigh: makeLine(svg, "d-far", SEG_W.thigh), shank: makeLine(svg, "d-far", SEG_W.shank), foot: makeLine(svg, "d-far", SEG_W.foot) };
    R.torso = makeLine(svg, "d-body", SEG_W.torso);
    R.neck = makeLine(svg, "d-body", SEG_W.neck);
    R.head = s("circle", { class: "d-head", r: LEN.head });
    svg.append(R.head);
    near.leg = { thigh: makeLine(svg, "d-near", SEG_W.thigh), shank: makeLine(svg, "d-near", SEG_W.shank), foot: makeLine(svg, "d-near", SEG_W.foot) };
    near.arm = { upper: makeLine(svg, "d-near", SEG_W.upper), fore: makeLine(svg, "d-near", SEG_W.fore), hand: makeLine(svg, "d-near", SEG_W.hand) };
    R.limbs = [near, far];
  }
  R.attached = [];
  return R;
}

function drawRig(R, J) {
  if (R.front) {
    J.legs.forEach((L, i) => {
      setLine(R.legs[i].thigh, J.hips[i], L.knee);
      setLine(R.legs[i].shank, L.knee, L.ankle);
      setLine(R.legs[i].foot, L.ankle, L.toe);
    });
    setLine(R.pelvis, J.hips[0], J.hips[1]);
    setLine(R.torso, add(J.hip, [0, 0.06]), add(J.chestTop, [0, -0.06]));
    setLine(R.shoulders, J.shs[0], J.shs[1]);
    setLine(R.neck, J.chestTop, J.neck);
    setCircle(R.head, J.head);
    J.arms.forEach((A, i) => {
      setLine(R.arms[i].upper, J.shs[i], A.elbow);
      setLine(R.arms[i].fore, A.elbow, A.wrist);
      setLine(R.arms[i].hand, A.wrist, A.hand);
    });
  } else {
    R.limbs.forEach((limb, i) => {
      const L = J.legs[i], A = J.arms[i];
      setLine(limb.leg.thigh, J.hip, L.knee);
      setLine(limb.leg.shank, L.knee, L.ankle);
      setLine(limb.leg.foot, L.heel, L.toe);
      setLine(limb.arm.upper, J.sh, A.elbow);
      setLine(limb.arm.fore, A.elbow, A.wrist);
      setLine(limb.arm.hand, A.wrist, A.hand);
    });
    setLine(R.torso, J.hip, J.sh);
    setLine(R.neck, J.sh, J.neck);
    setCircle(R.head, J.head);
  }
  for (const f of R.attached) f(J);
}

// ----- Инвентарь и опоры -----
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
  return { A: pat.a, B, k };
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
        const { J, dy } = place(pat, mix(pat.a, B, k));
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
function loop(now) {
  raf = 0;
  for (const d of active) {
    if (!d.svg.isConnected) {
      if (d.seen || now - d.born > 4000) active.delete(d);
      continue;
    }
    d.seen = true;
    d.update(now / 1000);
  }
  if (active.size) raf = requestAnimationFrame(loop);
}

const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

// Демонстрация техники: SVG-фигура, которая повторяет движение упражнения
export function exerciseDemo(id, { label } = {}) {
  const pid = patternOf(id);
  const pat = P[pid] || P.stand;
  const front = !!pat.a.front;
  const { anchor, target, top } = layout(pat);
  const svg = s("svg", { class: "demo-svg", viewBox: viewBoxFor(top), role: "img", "aria-label": label || `Схема движения: ${(EX[id] || { name: "" }).name}` });
  const R = buildRig(svg, front);
  const placeAt = Pz => {
    const { J, dy } = place(pat, Pz);
    return shiftJ(J, target - anchorX(J, anchor), dy);
  };
  const JA = placeAt(pat.a), JB = placeAt(pat.b || pat.a);
  addStaticProps(R, pat, JA, JB);
  addWeights(R, weightKind(id), id === "bbSquat" ? "back" : pat.w, front);
  const still = reduced();
  const update = time => {
    let Pz;
    if (still) Pz = pat.b || pat.a;
    else if (!pat.b) Pz = mix(pat.a, { ...pat.a, t: pat.a.t + (front ? 0 : 1.2) }, (Math.sin(time * Math.PI / 2) + 1) / 2);
    else {
      const { A, B, k } = frameAt(pat, time);
      Pz = mix(A, B, k);
    }
    drawRig(R, placeAt(Pz));
  };
  update(0);
  if (!still) {
    active.add({ svg, update, born: performance.now(), seen: false });
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
