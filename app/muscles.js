// ===== Листопульс: мышцы =====
// Карта мышц для 3D-модели и схем упражнений: какие мышцы видны на фигуре, как они называются
// и что делают, к какой зоне боли относятся, и какие мышцы работают в каждом упражнении.
// Нагрузка упражнения в data.js задана по ключам (сустав или область), поэтому мышцы выводятся
// из ключей с учётом характера упражнения (жим или тяга, руки над головой, упор на руки),
// а там, где этого мало — например, подъём рук в стороны грузит именно среднюю дельту, —
// мышцы заданы для упражнения явно.

import { EXERCISES, EX } from "./data.js";

export const MUSCLE_GROUPS = [
  { id: "neck", name: "Шея" },
  { id: "shoulders", name: "Плечи" },
  { id: "arms", name: "Руки" },
  { id: "chest", name: "Грудь" },
  { id: "core", name: "Живот" },
  { id: "back", name: "Спина" },
  { id: "glutes", name: "Таз и ягодицы" },
  { id: "thighs", name: "Бёдра" },
  { id: "shins", name: "Голени" }
];

// id, name — название, latin — анатомическое название (если отличается), group — группа,
// region — зона боли на модели, key — ключ нагрузки упражнений, tone — оттенок на атласе
// (у соседних мышц разные, чтобы границы читались), does — что делает.
// Последняя запись — «сухожилия и кости»: места, где мышцы нет (надколенник, гребень голени,
// ключицы, локоть, ахилл); на атласе они светлые
export const MUSCLES = [
  { id: "scm", name: "Грудино-ключично-сосцевидная", short: "шея спереди", group: "neck", region: "neck", key: "neck", tone: 1,
    does: "Поворачивает и наклоняет голову, помогает глубокому вдоху. Устаёт от смартфона и долгого взгляда вниз." },
  { id: "trapUpper", name: "Верхняя трапеция", group: "neck", region: "trapezius", key: "neck", tone: 3,
    does: "Поднимает плечи и держит голову. Чаще всего затекает за компьютером и за рулём." },
  { id: "deltFront", name: "Передняя дельта", group: "shoulders", region: "shoulder", key: "shoulder", tone: 2,
    does: "Поднимает руку вперёд. Работает во всех жимах и отжиманиях." },
  { id: "deltSide", name: "Средняя дельта", group: "shoulders", region: "shoulder", key: "shoulder", tone: 0,
    does: "Поднимает руку в сторону — даёт ширину плеч. Главная в подъёмах рук в стороны." },
  { id: "deltRear", name: "Задняя дельта", group: "shoulders", region: "shoulder", key: "shoulder", tone: 1,
    does: "Отводит руку назад. Работает в тягах и разведениях в наклоне, помогает осанке." },
  { id: "infraspinatus", name: "Подостная и малая круглая", short: "задняя поверхность лопатки", group: "shoulders", region: "shoulderBlade", key: "shoulder", tone: 2,
    does: "Вращают плечо наружу и держат головку плечевой кости в суставе — часть вращательной манжеты." },
  { id: "biceps", name: "Бицепс", latin: "двуглавая мышца плеча", group: "arms", region: "upperArm", key: "elbow", tone: 1,
    does: "Сгибает локоть и поворачивает ладонь вверх. Работает в сгибаниях рук, тягах и подтягиваниях." },
  { id: "brachialis", name: "Плечевая мышца", group: "arms", region: "upperArm", key: "elbow", tone: 3,
    does: "Лежит под бицепсом и сгибает локоть при любом хвате. Видна сбоку между бицепсом и трицепсом." },
  { id: "triceps", name: "Трицепс", latin: "трёхглавая мышца плеча", group: "arms", region: "triceps", key: "elbow", tone: 2,
    does: "Разгибает локоть — две трети объёма плеча. Работает в отжиманиях, жимах и разгибаниях рук." },
  { id: "forearmExt", name: "Разгибатели предплечья", group: "arms", region: "forearm", key: "wrist", tone: 0,
    does: "Разгибают кисть и пальцы, держат запястье в упорах. Болят при «локте теннисиста»." },
  { id: "forearmFlex", name: "Сгибатели предплечья", group: "arms", region: "forearm", key: "wrist", tone: 1,
    does: "Сгибают кисть и пальцы — это сила хвата: висы, тяги, прогулки с весом." },
  { id: "pecUpper", name: "Верх груди", latin: "ключичная часть большой грудной", group: "chest", region: "chest", key: "chest", tone: 1,
    does: "Поднимает руку вперёд-вверх. Больше всего работает в жимах на наклонной скамье и отжиманиях ногами вниз." },
  { id: "pecLower", name: "Большая грудная", latin: "грудинная часть", group: "chest", region: "chest", key: "chest", tone: 0,
    does: "Сводит руки перед грудью: отжимания, жимы, разведения." },
  { id: "serratus", name: "Передняя зубчатая", group: "chest", region: "ribs", key: "chest", tone: 2,
    does: "Прижимает лопатку к рёбрам и выводит её вперёд. Работает в отжиманиях, планках и ударах." },
  { id: "rectus", name: "Прямая мышца живота", short: "пресс", group: "core", region: "abdomen", key: "abdomen", tone: 2,
    does: "Сгибает корпус и не даёт пояснице прогибаться в планке. Те самые «кубики»." },
  { id: "obliques", name: "Косые мышцы живота", group: "core", region: "obliques", key: "abdomen", tone: 1,
    does: "Поворачивают и наклоняют корпус, держат его в боковой планке и при переносе веса в одной руке." },
  { id: "trapMid", name: "Средняя и нижняя трапеция", group: "back", region: "upperBack", key: "upperBack", tone: 0,
    does: "Сводят и опускают лопатки — основа осанки. Работают в тягах, «Y» и «T» лёжа, тяге к лицу." },
  { id: "lats", name: "Широчайшая", group: "back", region: "upperBack", key: "upperBack", tone: 3,
    does: "Тянет руку вниз и назад: подтягивания, тяги, пуловер. Самая большая мышца спины." },
  { id: "erectors", name: "Разгибатели спины", group: "back", region: "lowerBack", key: "lowerBack", tone: 1,
    does: "Держат позвоночник прямым в наклонах, тягах и приседаниях. Работают в «супермене»." },
  { id: "gluteMax", name: "Большая ягодичная", group: "glutes", region: "glute", key: "hip", tone: 0,
    does: "Разгибает бедро: приседания, мосты, выпады, подъём по лестнице. Разгружает поясницу и колени." },
  { id: "gluteMed", name: "Средняя ягодичная", group: "glutes", region: "hip", key: "hip", tone: 2,
    does: "Отводит бедро и держит таз ровно на одной ноге — равновесие, ходьба, бег." },
  { id: "tfl", name: "Напрягатель широкой фасции", group: "glutes", region: "thighOuter", key: "hip", tone: 1,
    does: "Сгибает и отводит бедро, натягивает сухожильную полосу по наружной стороне бедра." },
  { id: "hipFlex", name: "Сгибатели бедра", latin: "подвздошно-поясничная и гребенчатая", group: "glutes", region: "groin", key: "hip", tone: 0,
    does: "Поднимают колено к груди. Укорачиваются от долгого сидения — отсюда тянущая поясница." },
  { id: "sartorius", name: "Портняжная", group: "thighs", region: "thighFront", key: "knee", tone: 4,
    does: "Самая длинная мышца тела — косая лента от таза к внутренней стороне колена. Сгибает и разворачивает бедро." },
  { id: "quadRF", name: "Прямая мышца бедра", short: "квадрицепс, центр", group: "thighs", region: "thighFront", key: "knee", tone: 3,
    does: "Разгибает колено и сгибает бедро — средняя головка квадрицепса." },
  { id: "quadVL", name: "Латеральная широкая", short: "квадрицепс снаружи", group: "thighs", region: "thighFront", key: "knee", tone: 2,
    does: "Разгибает колено — наружная головка квадрицепса. Самая объёмная мышца бедра." },
  { id: "quadVM", name: "Медиальная широкая", short: "квадрицепс изнутри", group: "thighs", region: "thighFront", key: "knee", tone: 0,
    does: "Разгибает колено и держит надколенник ровно — «капля» над коленом с внутренней стороны." },
  { id: "adductors", name: "Приводящие мышцы", group: "thighs", region: "thighInner", key: "groin", tone: 1,
    does: "Сводят ноги: выпады в сторону, приседания плие, сжатие подушки коленями." },
  { id: "hamOuter", name: "Двуглавая мышца бедра", short: "задняя поверхность бедра снаружи", group: "thighs", region: "hamstring", key: "hamstring", tone: 3,
    does: "Сгибает колено и разгибает бедро — наружная часть задней поверхности бедра." },
  { id: "hamInner", name: "Полусухожильная и полуперепончатая", short: "задняя поверхность бедра изнутри", group: "thighs", region: "hamstring", key: "hamstring", tone: 2,
    does: "Сгибают колено и разгибают бедро — внутренняя часть задней поверхности бедра." },
  { id: "tibialis", name: "Передняя большеберцовая", group: "shins", region: "shin", key: "ankle", tone: 1,
    does: "Поднимает носок стопы. Работает при каждом шаге и ноет при «расколотой голени»." },
  { id: "peroneals", name: "Малоберцовые", group: "shins", region: "shin", key: "ankle", tone: 2,
    does: "Держат голеностоп сбоку и не дают стопе подворачиваться — равновесие на одной ноге." },
  { id: "gastroc", name: "Икроножная", group: "shins", region: "calf", key: "ankle", tone: 0,
    does: "Поднимает на носки, толкает в беге и прыжках. Две головки видны под коленом." },
  { id: "soleus", name: "Камбаловидная", group: "shins", region: "calf", key: "ankle", tone: 3,
    does: "Лежит под икроножной и работает при ходьбе и долгом стоянии. Нагружается в подъёмах на носки с согнутым коленом." },
  { id: "tendon", name: "Сухожилия и кости", group: "", region: "", key: "", tone: -1, bone: true,
    does: "Здесь мышцы нет: сухожилие или кость у самой кожи — ключица, грудина, надколенник, гребень голени, локоть, ахиллово сухожилие." }
];
export const MUSCLE = Object.fromEntries(MUSCLES.map(m => [m.id, m]));
export const MUSCLE_IDS = MUSCLES.map(m => m.id);

// ----- Какие мышцы работают в упражнении -----
const LVL = { 1: 0.35, 2: 0.72, 3: 1 };
// Ключ нагрузки → мышцы с долями (0…1). Для плеч, локтей и спины — по характеру упражнения:
// жимы и отжимания грузят переднюю дельту и трицепс, тяги — заднюю дельту, широчайшие и бицепс
function keyMuscles(key, ex) {
  const pull = ex.group === "pull";
  const overhead = ex.tags.includes("overhead");
  const support = (ex.load.wrist || 0) >= 2 && !ex.weighted; // упор на руки: планки, отжимания, «медведь»
  switch (key) {
    case "neck": return [["trapUpper", 1], ["scm", 0.6]];
    case "shoulder":
      if (pull) return [["deltRear", 1], ["deltSide", 0.5], ["infraspinatus", 0.7]];
      if (overhead) return [["deltFront", 1], ["deltSide", 0.9], ["trapUpper", 0.5]];
      return [["deltFront", 1], ["deltSide", 0.45], ["serratus", support ? 0.6 : 0.2]];
    case "elbow": return pull ? [["biceps", 1], ["brachialis", 0.8], ["forearmFlex", 0.45]] : [["triceps", 1], ["brachialis", 0.2]];
    case "wrist": return [["forearmFlex", 1], ["forearmExt", 0.8]];
    case "upperBack": return pull ? [["lats", 1], ["trapMid", 0.9], ["deltRear", 0.6], ["infraspinatus", 0.5]] : [["trapMid", 1], ["erectors", 0.45], ["lats", 0.3]];
    case "lowerBack": return [["erectors", 1]];
    case "hip": return [["gluteMax", 1], ["gluteMed", 0.6], ["hipFlex", 0.3]];
    case "knee": return [["quadRF", 1], ["quadVL", 1], ["quadVM", 0.9], ["sartorius", 0.3]];
    case "ankle": return [["gastroc", 1], ["soleus", 0.8], ["tibialis", 0.4], ["peroneals", 0.3]];
    case "chest": return [["pecLower", 1], ["pecUpper", 0.7], ["serratus", 0.4], ["deltFront", 0.5]];
    case "abdomen": return [["rectus", 1], ["obliques", 0.7], ["hipFlex", 0.3]];
    case "groin": return [["adductors", 1], ["hipFlex", 0.4]];
    case "hamstring": return [["hamOuter", 1], ["hamInner", 1], ["gluteMax", 0.3]];
    default: return [];
  }
}

// Сокращения для таблицы: квадрицепс, задняя поверхность бедра, все три дельты, жим, тяга
const QUAD = (k = 1) => ({ quadRF: k, quadVL: k, quadVM: k });
const HAMS = (k = 1) => ({ hamOuter: k, hamInner: k });
const CALF = (k = 1) => ({ gastroc: k, soleus: k * 0.8 });
const PRESS = (k = 1) => ({ pecLower: k, pecUpper: k * 0.5, deltFront: k * 0.7, triceps: k * 0.8 });
const PUSHUP = (k = 1) => ({ pecLower: k, pecUpper: k * 0.4, deltFront: k * 0.65, triceps: k * 0.7, serratus: k * 0.45, rectus: k * 0.35 });
const ROW = (k = 1) => ({ lats: k, trapMid: k * 0.85, deltRear: k * 0.7, biceps: k * 0.7, brachialis: k * 0.5, forearmFlex: k * 0.5, infraspinatus: k * 0.3 });
const OHPRESS = (k = 1) => ({ deltFront: k, deltSide: k * 0.8, triceps: k * 0.8, trapUpper: k * 0.5, serratus: k * 0.4 });
const DEADLIFT = (k = 1) => ({ erectors: k * 0.9, gluteMax: k * 0.9, ...HAMS(k * 0.8), ...QUAD(k * 0.55), trapMid: k * 0.5, trapUpper: k * 0.4, forearmFlex: k * 0.5, lats: k * 0.4 });
const SQUAT = (k = 1) => ({ ...QUAD(k), gluteMax: k * 0.7, adductors: k * 0.4, erectors: k * 0.35, gastroc: k * 0.2 });
const LUNGE = (k = 1) => ({ ...QUAD(k * 0.8), gluteMax: k * 0.7, gluteMed: k * 0.45, adductors: k * 0.3, hipFlex: k * 0.25 });
const BALANCE = { gluteMed: 0.45, peroneals: 0.45, tibialis: 0.3, soleus: 0.3 };

// Явные соответствия — там, где ключей нагрузки недостаточно
const OVERRIDES = {
  // разминка
  march: { hipFlex: 0.35, gastroc: 0.3, tibialis: 0.3 },
  armCircles: { deltSide: 0.45, deltFront: 0.3, deltRear: 0.3 },
  neckMob: { scm: 0.3, trapUpper: 0.3 },
  hipCircles: { obliques: 0.3, erectors: 0.3, gluteMed: 0.3 },
  torsoTurns: { obliques: 0.35, erectors: 0.3 },
  ankleRolls: { tibialis: 0.3, peroneals: 0.3 },
  stepJack: { deltSide: 0.45, gastroc: 0.3, quadRF: 0.3, gluteMed: 0.3 },
  catCow: { erectors: 0.35, rectus: 0.3 },
  wristMob: { forearmFlex: 0.3, forearmExt: 0.3 },
  legSwings: { hipFlex: 0.45, gluteMax: 0.4, ...HAMS(0.3) },
  kbHalo: { deltFront: 0.5, deltSide: 0.5, triceps: 0.5, trapUpper: 0.4, obliques: 0.3 },
  inchworm: { ...HAMS(0.5), rectus: 0.5, deltFront: 0.5, erectors: 0.3, triceps: 0.3 },
  hipHinge: { ...HAMS(0.5), gluteMax: 0.5, erectors: 0.4 },
  bandDislocate: { deltRear: 0.4, infraspinatus: 0.4, pecLower: 0.3 },
  reachUp: { lats: 0.3, deltFront: 0.3, gastroc: 0.35, erectors: 0.25 },
  shoulderRolls: { trapUpper: 0.4, deltSide: 0.2 },
  sideBends: { obliques: 0.5, erectors: 0.25 },
  heelToeRock: { tibialis: 0.6, gastroc: 0.6 },
  // ноги
  squat: SQUAT(0.85), squatPause: SQUAT(0.9), chairSquat: SQUAT(0.5), wallSit: { ...QUAD(1), gluteMax: 0.3 },
  bridge: { gluteMax: 0.8, ...HAMS(0.5), erectors: 0.3 },
  singleBridge: { gluteMax: 1, ...HAMS(0.7), gluteMed: 0.5, erectors: 0.3 },
  bridgeMarch: { gluteMax: 0.9, gluteMed: 0.6, ...HAMS(0.5), rectus: 0.4 },
  splitSquat: LUNGE(0.9), reverseLunge: LUNGE(0.9), dbLunge: LUNGE(1), curtsyLunge: { ...LUNGE(0.9), gluteMed: 0.8, adductors: 0.4 },
  bulgarian: { ...QUAD(1), gluteMax: 0.85, gluteMed: 0.5, adductors: 0.3, hipFlex: 0.3 },
  lateralLunge: { adductors: 0.9, ...QUAD(0.7), gluteMax: 0.5, gluteMed: 0.5 },
  cossack: { adductors: 0.9, ...QUAD(0.8), gluteMax: 0.5, gluteMed: 0.5 },
  plieSquat: { adductors: 0.9, ...QUAD(0.7), gluteMax: 0.6 },
  dbSumo: { adductors: 0.9, ...QUAD(0.8), gluteMax: 0.7, erectors: 0.4, forearmFlex: 0.3 },
  kbSumo: { adductors: 0.9, ...QUAD(0.8), gluteMax: 0.7, erectors: 0.4, forearmFlex: 0.3 },
  calfRaise: CALF(1), singleCalf: { ...CALF(1), peroneals: 0.3 }, heelDrops: { gastroc: 1, soleus: 0.9 }, dbCalfRaise: { ...CALF(1), forearmFlex: 0.3 },
  toeRaise: { tibialis: 1 },
  sideLeg: { gluteMed: 0.9, tfl: 0.6 },
  bandWalk: { gluteMed: 1, tfl: 0.5, quadVL: 0.3 },
  stepUp: { ...QUAD(0.8), gluteMax: 0.7, gluteMed: 0.4, gastroc: 0.3 },
  dbStepUp: { ...QUAD(0.85), gluteMax: 0.75, gluteMed: 0.45, gastroc: 0.3 },
  stepDown: { quadVM: 0.9, quadRF: 0.7, quadVL: 0.7, gluteMed: 0.6, gluteMax: 0.5 },
  goodMorning: { ...HAMS(0.8), erectors: 0.7, gluteMax: 0.6 },
  gobletSquat: { ...SQUAT(0.85), erectors: 0.5, forearmFlex: 0.3, deltFront: 0.2 },
  kbGoblet: { ...SQUAT(0.85), erectors: 0.5, forearmFlex: 0.3, deltFront: 0.2 },
  rdl: { ...HAMS(0.9), gluteMax: 0.75, erectors: 0.7, forearmFlex: 0.4, trapMid: 0.3 },
  bbRdl: { ...HAMS(1), gluteMax: 0.8, erectors: 0.8, forearmFlex: 0.4, trapMid: 0.3 },
  singleRdl: { ...HAMS(0.9), gluteMax: 0.8, gluteMed: 0.6, erectors: 0.6 },
  squatJump: { ...QUAD(1), gluteMax: 0.8, ...CALF(0.8) },
  dbHipThrust: { gluteMax: 1, ...HAMS(0.5), erectors: 0.3 }, bbHipThrust: { gluteMax: 1, ...HAMS(0.5), erectors: 0.3 },
  dbDeadlift: DEADLIFT(0.9), kbDeadlift: DEADLIFT(0.8), bbDeadlift: DEADLIFT(1),
  bbSquat: { ...SQUAT(1), erectors: 0.6, adductors: 0.5 },
  nordic: { ...HAMS(1), gastroc: 0.3, gluteMax: 0.3 },
  // грудь и руки
  wallPush: PUSHUP(0.5), fistPush: PUSHUP(0.5), inclinePush: PUSHUP(0.7), kneePush: PUSHUP(0.85), pushUp: PUSHUP(1),
  narrowKneePush: { ...PUSHUP(0.8), triceps: 1 },
  bandPress: { pecLower: 0.8, pecUpper: 0.4, deltFront: 0.6, triceps: 0.6 },
  floorPress: PRESS(0.9), dbBench: PRESS(1), bbBench: PRESS(1),
  dbIncline: { pecUpper: 1, pecLower: 0.6, deltFront: 0.8, triceps: 0.6 },
  dbFly: { pecLower: 1, pecUpper: 0.6, deltFront: 0.4, biceps: 0.2 },
  bicepsCurl: { biceps: 1, brachialis: 0.6, forearmFlex: 0.4 }, bandCurl: { biceps: 1, brachialis: 0.6, forearmFlex: 0.4 },
  bbCurl: { biceps: 1, brachialis: 0.6, forearmFlex: 0.45 }, bicepsIso: { biceps: 1, brachialis: 0.5, forearmFlex: 0.3 },
  hammerCurl: { brachialis: 1, biceps: 0.7, forearmExt: 0.5, forearmFlex: 0.3 },
  tricepsBand: { triceps: 1 }, ohTriceps: { triceps: 1, deltFront: 0.2 }, kickback: { triceps: 1, deltRear: 0.3 }, dbSkull: { triceps: 1 },
  chairDip: { triceps: 1, deltFront: 0.6, pecLower: 0.5 },
  lateralRaise: { deltSide: 1, deltFront: 0.3, trapUpper: 0.4 }, bandLateral: { deltSide: 1, deltFront: 0.3, trapUpper: 0.35 },
  frontRaise: { deltFront: 1, pecUpper: 0.4, deltSide: 0.3 },
  ohPress: OHPRESS(1), standPress: { ...OHPRESS(1), erectors: 0.3, rectus: 0.3 }, bbPress: { ...OHPRESS(1), erectors: 0.35, rectus: 0.3 },
  kbPress: { ...OHPRESS(1), obliques: 0.35 }, bandOhPress: OHPRESS(0.85), arnoldPress: { ...OHPRESS(1), deltSide: 0.9 },
  pikePush: { ...OHPRESS(1), serratus: 0.5 },
  pressHold: { pecLower: 0.7, pecUpper: 0.4, deltFront: 0.5 },
  shoulderAbd: { deltSide: 1 }, shoulderER: { infraspinatus: 1, deltRear: 0.4 }, shoulderIR: { pecLower: 0.5, lats: 0.5, deltFront: 0.3 },
  // спина
  superman: { erectors: 1, gluteMax: 0.6, ...HAMS(0.4), trapMid: 0.4, deltRear: 0.3 },
  backExtHold: { erectors: 1, gluteMax: 0.5, ...HAMS(0.3) },
  proneYT: { trapMid: 1, deltRear: 0.7, infraspinatus: 0.6, erectors: 0.3 }, proneW: { trapMid: 1, deltRear: 0.7, infraspinatus: 0.6 },
  scapHold: { trapMid: 1, deltRear: 0.6, infraspinatus: 0.5 }, wallAngel: { trapMid: 0.8, deltRear: 0.5, infraspinatus: 0.5 },
  reverseSnowAngel: { trapMid: 0.9, deltRear: 0.7, infraspinatus: 0.5, erectors: 0.3 },
  proneSwim: { erectors: 0.8, trapMid: 0.7, deltRear: 0.6, gluteMax: 0.5 },
  bandRow: ROW(0.8), dbRow: ROW(1), chestRow: ROW(1), kbRow: ROW(1), doorRow: ROW(0.7),
  bentRow: { ...ROW(1), erectors: 0.6, ...HAMS(0.3) }, bbRow: { ...ROW(1), erectors: 0.7, ...HAMS(0.3) },
  renegadeRow: { ...ROW(0.9), rectus: 0.7, obliques: 0.6, triceps: 0.4, deltFront: 0.4 },
  pullApart: { deltRear: 1, trapMid: 0.9, infraspinatus: 0.8 }, facePull: { deltRear: 1, trapMid: 0.9, infraspinatus: 0.8 },
  reverseFly: { deltRear: 1, trapMid: 0.9, infraspinatus: 0.7 },
  deadHang: { forearmFlex: 1, lats: 0.5, trapUpper: 0.3 },
  negPullUp: { lats: 1, biceps: 0.9, brachialis: 0.7, forearmFlex: 0.7, trapMid: 0.6, deltRear: 0.5, infraspinatus: 0.3, rectus: 0.3 },
  pullUp: { lats: 1, biceps: 0.9, brachialis: 0.7, forearmFlex: 0.7, trapMid: 0.6, deltRear: 0.5, infraspinatus: 0.3, rectus: 0.3 },
  bandPullUp: { lats: 1, biceps: 0.85, brachialis: 0.6, forearmFlex: 0.6, trapMid: 0.6, deltRear: 0.5, infraspinatus: 0.3 },
  dbShrug: { trapUpper: 1, forearmFlex: 0.3 },
  dbPullover: { lats: 0.9, pecLower: 0.7, triceps: 0.5, serratus: 0.5 },
  latStretch: { lats: 0.35 },
  // корпус
  deadBug: { rectus: 0.8, obliques: 0.4, hipFlex: 0.5 }, deadBugHold: { rectus: 0.8, obliques: 0.4, hipFlex: 0.5 },
  dbDeadBug: { rectus: 0.9, obliques: 0.4, hipFlex: 0.5, deltFront: 0.3 },
  heelTaps: { rectus: 0.7, hipFlex: 0.5 },
  birdDog: { erectors: 0.6, gluteMax: 0.6, rectus: 0.4, deltFront: 0.3 },
  standingKnee: { rectus: 0.5, obliques: 0.6, hipFlex: 0.6 },
  kneePlank: { rectus: 0.8, obliques: 0.5, deltFront: 0.5, serratus: 0.4 },
  plank: { rectus: 1, obliques: 0.5, deltFront: 0.5, serratus: 0.45, quadRF: 0.25 },
  sidePlank: { obliques: 1, gluteMed: 0.6, deltSide: 0.5, rectus: 0.4 },
  sidePlankFull: { obliques: 1, gluteMed: 0.7, deltSide: 0.6, rectus: 0.4, adductors: 0.3 },
  hollowHold: { rectus: 1, hipFlex: 0.7, obliques: 0.4 },
  crunch: { rectus: 1, obliques: 0.3 },
  pallof: { obliques: 1, rectus: 0.6, deltFront: 0.4 },
  farmerCarry: { forearmFlex: 1, trapUpper: 0.8, obliques: 0.5, rectus: 0.4, erectors: 0.4, gluteMed: 0.4 },
  suitcaseCarry: { obliques: 1, forearmFlex: 0.9, trapUpper: 0.6, gluteMed: 0.5, erectors: 0.4 },
  woodchop: { obliques: 1, rectus: 0.5, deltFront: 0.5, gluteMax: 0.4, ...QUAD(0.3) },
  russianTwist: { obliques: 1, rectus: 0.7, hipFlex: 0.4 },
  kbCarry: { rectus: 0.5, erectors: 0.5, biceps: 0.4, forearmFlex: 0.4, trapUpper: 0.4 },
  kbAround: { obliques: 0.6, forearmFlex: 0.5, deltFront: 0.3 },
  kbGetUp: { deltFront: 0.9, deltSide: 0.6, triceps: 0.5, obliques: 0.8, rectus: 0.7, gluteMax: 0.4, forearmFlex: 0.5 },
  bicycleSlow: { rectus: 1, obliques: 0.8, hipFlex: 0.6 },
  reverseCrunch: { rectus: 1, hipFlex: 0.6 },
  bearHold: { rectus: 0.8, ...QUAD(0.6), deltFront: 0.6, triceps: 0.4, serratus: 0.4, hipFlex: 0.4 },
  bearCrawl: { rectus: 0.8, ...QUAD(0.6), deltFront: 0.7, triceps: 0.4, serratus: 0.5, hipFlex: 0.5 },
  shoulderTaps: { rectus: 0.8, obliques: 0.7, deltFront: 0.7, serratus: 0.5, triceps: 0.4 },
  legLowers: { rectus: 0.9, hipFlex: 0.8, obliques: 0.3 },
  copenhagen: { adductors: 1, obliques: 0.7, deltSide: 0.4 },
  // кардио
  seatedMarch: { hipFlex: 0.7, rectus: 0.3 },
  highKnees: { hipFlex: 0.8, quadRF: 0.5, gastroc: 0.5, rectus: 0.4 },
  heelKicks: { ...HAMS(0.7), gastroc: 0.4 },
  skater: { gluteMed: 0.7, ...QUAD(0.6), adductors: 0.4, gastroc: 0.4 },
  jog: { ...CALF(0.8), ...QUAD(0.6), ...HAMS(0.5), gluteMax: 0.4, tibialis: 0.4 },
  jacks: { gastroc: 0.8, deltSide: 0.5, gluteMed: 0.5, ...QUAD(0.4) },
  jumpRope: { ...CALF(1), ...QUAD(0.4) },
  lateralShuffle: { gluteMed: 0.8, ...QUAD(0.7), adductors: 0.6, gastroc: 0.6 },
  stepBackReach: { gluteMax: 0.4, ...QUAD(0.4), deltFront: 0.5 },
  armBike: { deltFront: 0.5, deltSide: 0.4, triceps: 0.3 },
  shadowBox: { deltFront: 0.7, triceps: 0.6, serratus: 0.5, obliques: 0.4, pecLower: 0.3 },
  seatedPunch: { deltFront: 0.7, triceps: 0.6, serratus: 0.5, obliques: 0.3 },
  mountain: { rectus: 0.9, hipFlex: 0.8, deltFront: 0.6, serratus: 0.4, ...QUAD(0.4), triceps: 0.3 },
  burpeeLow: { ...QUAD(0.7), gluteMax: 0.6, pecLower: 0.5, deltFront: 0.6, triceps: 0.5, rectus: 0.6, gastroc: 0.4 },
  thruster: { ...QUAD(0.9), gluteMax: 0.8, deltFront: 0.9, deltSide: 0.6, triceps: 0.7, erectors: 0.4 },
  dbSwing: { gluteMax: 1, ...HAMS(0.9), erectors: 0.7, forearmFlex: 0.4, deltFront: 0.3, lats: 0.3, ...QUAD(0.4) },
  kbSwing: { gluteMax: 1, ...HAMS(0.9), erectors: 0.7, forearmFlex: 0.4, deltFront: 0.3, lats: 0.3, ...QUAD(0.4) },
  kbClean: { gluteMax: 0.8, ...HAMS(0.7), erectors: 0.6, trapUpper: 0.5, biceps: 0.4, forearmFlex: 0.5, deltFront: 0.4 },
  // равновесие
  singleLeg: BALANCE, heelToe: BALANCE, tandemStand: BALANCE, weightShift: BALANCE, tree: { ...BALANCE, gluteMed: 0.55 },
  pillowBalance: { ...BALANCE, gluteMed: 0.6, ...QUAD(0.3) }, starReach: { gluteMed: 0.6, ...QUAD(0.5), peroneals: 0.5, soleus: 0.3 },
  clockReach: { gluteMed: 0.6, ...QUAD(0.5), peroneals: 0.5, soleus: 0.3 },
  toeWalk: { gastroc: 0.8, soleus: 0.6 }, heelWalk: { tibialis: 1 },
  legSwingSide: { gluteMed: 0.9, tfl: 0.4 }, backLegRaise: { gluteMax: 0.8, ...HAMS(0.4), erectors: 0.3 },
  kneeLiftHold: { hipFlex: 0.7, gluteMed: 0.4, rectus: 0.3 }, grapevine: { gluteMed: 0.5, adductors: 0.4, gastroc: 0.4 },
  // статика
  quadSet: { quadVM: 1, quadRF: 0.6, quadVL: 0.6 }, gluteSqueeze: { gluteMax: 1 }, adductorSqueeze: { adductors: 1 },
  abductorPress: { gluteMed: 1, tfl: 0.5 }, hamIso: HAMS(1), calfHold: { gastroc: 0.9, soleus: 0.9 },
  ankleIsoOut: { peroneals: 1 }, ankleIsoIn: { tibialis: 0.8 }, neckIso: { scm: 0.7, trapUpper: 0.6 },
  gripIso: { forearmFlex: 1, forearmExt: 0.4 }, wristExtIso: { forearmExt: 1 },
  bridgeHold: { gluteMax: 1, ...HAMS(0.5), erectors: 0.3 }, wallSitShort: { ...QUAD(0.9), gluteMax: 0.4 }, squatHold: { ...QUAD(0.9), gluteMax: 0.4 },
  splitHold: { ...QUAD(0.8), gluteMax: 0.6, gluteMed: 0.4, adductors: 0.3 },
  // мобильность и заминка: подсвечивается то, что тянется
  hipFlexor: { hipFlex: 0.5, quadRF: 0.3 }, downDog: { ...HAMS(0.4), gastroc: 0.4, deltFront: 0.4, lats: 0.3, triceps: 0.3 },
  quadStretch: { quadRF: 0.5, hipFlex: 0.3 }, chestStretch: { pecLower: 0.5, pecUpper: 0.4, deltFront: 0.3 }, chestBehind: { pecLower: 0.5, pecUpper: 0.4, deltFront: 0.3 },
  tricepsStretch: { triceps: 0.5, lats: 0.3 }, butterfly: { adductors: 0.5 }, figure4: { gluteMax: 0.5, gluteMed: 0.4 },
  calfStretch: { gastroc: 0.5, soleus: 0.4 }, neckStretch: { trapUpper: 0.4, scm: 0.3 }, childPose: { lats: 0.3, erectors: 0.3 },
  sphinx: { erectors: 0.4, rectus: 0.3 }, cobra: { erectors: 0.4, rectus: 0.3 }, kneesToChest: { erectors: 0.3, gluteMax: 0.3 },
  seatedFold: { ...HAMS(0.5), erectors: 0.3, gastroc: 0.2 }, hamStretch: { ...HAMS(0.5), erectors: 0.3 }, strapHam: { ...HAMS(0.5), gastroc: 0.3 },
  openBook: { obliques: 0.3, pecLower: 0.3 }, thread: { obliques: 0.3, trapMid: 0.3, deltRear: 0.3 },
  thoracicReach: { lats: 0.3, deltFront: 0.3, erectors: 0.3 }, sunFlow: { ...HAMS(0.4), erectors: 0.4, deltFront: 0.3 },
  worldStretch: { hipFlex: 0.4, obliques: 0.4, ...QUAD(0.3) }, warrior: { ...QUAD(0.5), gluteMax: 0.4, deltSide: 0.4, adductors: 0.3 },
  chinTuck: { scm: 0.3 }, ankleAlphabet: { tibialis: 0.4, peroneals: 0.4 }, towelScrunch: { tibialis: 0.2 },
  kneeToWall: { soleus: 0.4, tibialis: 0.3 }, happyBaby: { adductors: 0.4, gluteMax: 0.3 }, wristFlex: { forearmFlex: 0.4, forearmExt: 0.3 }
};

const cache = new Map();
// Мышцы упражнения: { id мышцы: доля 0…1 }, где 1 — главная рабочая мышца
export function exerciseMuscles(id) {
  if (cache.has(id)) return cache.get(id);
  const ex = EX[id];
  let out = {};
  if (ex) {
    if (OVERRIDES[id]) for (const [m, v] of Object.entries(OVERRIDES[id])) out[m] = Math.round(Math.min(1, v) * 100) / 100;
    else {
      for (const [key, lvl] of Object.entries(ex.load)) {
        for (const [m, share] of keyMuscles(key, ex)) {
          const v = Math.round(Math.min(1, (LVL[lvl] || 0) * share) * 100) / 100;
          if (v > 0.05) out[m] = Math.max(out[m] || 0, v);
        }
      }
    }
  }
  cache.set(id, out);
  return out;
}

// Главные и вспомогательные мышцы упражнения — для карточки упражнения
export function muscleSummary(id) {
  const m = exerciseMuscles(id);
  const list = Object.entries(m).filter(([mid]) => MUSCLE[mid]).sort((a, b) => b[1] - a[1]);
  return {
    main: list.filter(([, v]) => v >= 0.6).map(([mid]) => MUSCLE[mid]),
    helpers: list.filter(([, v]) => v < 0.6 && v >= 0.25).map(([mid]) => MUSCLE[mid])
  };
}

// Упражнения, в которых мышца работает заметно, — по убыванию доли
export function exercisesFor(muscleId, limit = 8) {
  const all = EXERCISES
    .map(ex => ({ ex, v: exerciseMuscles(ex.id)[muscleId] || 0 }))
    .filter(x => x.v >= 0.3 && x.ex.group !== "warm" && x.ex.group !== "cool" && x.ex.group !== "mobility")
    .sort((a, b) => b.v - a.v || a.ex.level - b.ex.level);
  const strong = all.filter(x => x.v >= 0.5);
  return (strong.length >= 3 ? strong : all).slice(0, limit).map(x => x.ex);
}
