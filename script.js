// ===== Листопульс: общий скрипт сайта =====
// Без внешних библиотек и без innerHTML: элементы создаются через createElement/textContent.
// На сайте включены Content Security Policy и Trusted Types — внедрённый чужой код не выполнится.

// ===== Общие помощники =====
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// localStorage может быть недоступен (приватный режим) — любые ошибки просто игнорируем
const store = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* без сохранения */ } }
};
// Сохранённые данные проверяем: в хранилище мог попасть мусор
const loadJSON = key => {
  try {
    const value = JSON.parse(store.get(key));
    return value && typeof value === "object" ? value : null;
  } catch (e) { return null; }
};
const saveJSON = (key, value) => store.set(key, JSON.stringify(value));

// Создание элемента с текстом. Только textContent, без innerHTML — защита от XSS
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const fmt = (n, digits = 0) => n.toLocaleString("ru-RU", { maximumFractionDigits: digits });
const pick = list => list[Math.floor(Math.random() * list.length)];
const dateKey = d => d.toLocaleDateString("sv-SE"); // ГГГГ-ММ-ДД по местному времени
const today = () => dateKey(new Date());
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const dayOfYear = () => {
  const now = new Date();
  return Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
};
// Русские окончания: plural(5, "день", "дня", "дней") → «дней»
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
};
const fmtDuration = minutes => {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h} ч ${rest} мин` : `${h} ч`;
};

// Число из поля ввода в допустимых пределах, иначе null
const readNumber = (input, min, max) => {
  const v = parseFloat(String(input.value).replace(",", "."));
  return Number.isFinite(v) && v >= min && v <= max ? v : null;
};

// ===== Защита от встраивания в чужие страницы =====
// theme.js помечает страницу классом is-framed, CSS прячет содержимое, здесь — понятное объяснение
if (document.documentElement.classList.contains("is-framed")) {
  const guard = el("div", "frame-guard");
  const link = el("a", "btn primary", "Открыть сайт напрямую");
  link.href = window.location.href;
  link.target = "_top";
  link.rel = "noopener noreferrer";
  guard.append(el("p", "", "Эта страница открыта внутри другого сайта. Чтобы вас не обманули поддельными кнопками, откройте её напрямую."), link);
  document.body.prepend(guard);
}

// ===== Всплывающее сообщение =====
let toastTimer = null;
const toast = text => {
  let node = document.querySelector(".toast");
  if (!node) {
    node = el("div", "toast");
    node.setAttribute("role", "status");
    document.body.append(node);
  }
  node.textContent = text;
  requestAnimationFrame(() => node.classList.add("is-visible"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("is-visible"), 2800);
};

// ===== Конфетти =====
const confetti = origin => {
  if (reduceMotion) return;
  const canvas = el("canvas", "fx-canvas");
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  document.body.append(canvas);

  let ox = w / 2, oy = h / 3;
  if (origin) {
    const r = origin.getBoundingClientRect();
    ox = r.left + r.width / 2;
    oy = Math.min(Math.max(r.top + r.height / 2, 40), h - 40);
  }
  const colors = ["#22c55e", "#facc15", "#38bdf8", "#f472b6", "#fb923c", "#a78bfa"];
  const parts = Array.from({ length: 140 }, () => {
    const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 8;
    return {
      x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6,
      size: 5 + Math.random() * 6, rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.3,
      color: pick(colors)
    };
  });
  const life = 1800, start = performance.now();
  const frame = now => {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - t / life);
    parts.forEach(p => {
      p.vy += 0.25; p.vx *= 0.99;
      p.x += p.vx; p.y += p.vy; p.rot += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });
    if (t < life) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
  setTimeout(() => canvas.remove(), life + 600); // страховка для фоновой вкладки
};

// ===== Пасхалка: листопад =====
const leafRain = () => {
  if (reduceMotion) { toast("🍃 Вы нашли секретный листик!"); return; }
  const leaves = ["🍃", "🌿", "🍀", "🌱"];
  for (let i = 0; i < 36; i++) {
    const leaf = el("span", "leaf-drop", pick(leaves));
    leaf.setAttribute("aria-hidden", "true");
    leaf.style.left = `${Math.random() * 100}vw`;
    leaf.style.fontSize = `${18 + Math.random() * 22}px`;
    leaf.style.animationDuration = `${3 + Math.random() * 3}s`;
    leaf.style.animationDelay = `${Math.random() * 1.5}s`;
    leaf.style.setProperty("--drift", `${Math.round((Math.random() - 0.5) * 240)}px`);
    leaf.style.setProperty("--spin", `${Math.round((Math.random() - 0.5) * 720)}deg`);
    leaf.addEventListener("animationend", () => leaf.remove());
    document.body.append(leaf);
  }
  toast("🍃 Листопад! Вы нашли пасхалку.");
};

// Три быстрых нажатия на листик в подвале…
const eggBtn = document.querySelector(".leaf-egg");
if (eggBtn) {
  let clicks = 0, timer = null;
  eggBtn.addEventListener("click", () => {
    clicks += 1;
    clearTimeout(timer);
    timer = setTimeout(() => { clicks = 0; }, 1200);
    if (clicks >= 3) {
      clicks = 0;
      leafRain();
    }
  });
}
// …или «код Konami» на клавиатуре: ↑ ↑ ↓ ↓ ← → ← → B A
const konami = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "KeyB", "KeyA"];
let konamiPos = 0;
document.addEventListener("keydown", e => {
  if (e.code === konami[konamiPos]) konamiPos += 1;
  else konamiPos = e.code === konami[0] ? 1 : 0;
  if (konamiPos === konami.length) {
    konamiPos = 0;
    leafRain();
  }
});

// ===== Тема: переключатель =====
const themeBtn = document.querySelector(".theme-toggle");
if (themeBtn) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const current = () => document.documentElement.dataset.theme || (media.matches ? "dark" : "light");
  const updateLabel = () => {
    themeBtn.setAttribute("aria-label", current() === "dark" ? "Включить светлую тему" : "Включить тёмную тему");
  };

  themeBtn.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
    updateLabel();
  });
  media.addEventListener("change", updateLabel);
  updateLabel();
}

// ===== Мобильное меню =====
const burger = document.querySelector(".burger");
const menu = document.getElementById("menu");

if (burger && menu) {
  const setOpen = open => {
    menu.classList.toggle("show", open);
    burger.classList.toggle("active", open);
    burger.setAttribute("aria-expanded", open ? "true" : "false");
    burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  };

  burger.addEventListener("click", () => setOpen(!menu.classList.contains("show")));

  // Закрытие по клику на ссылку, по клику мимо меню и по Esc
  menu.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setOpen(false)));
  document.addEventListener("click", e => {
    if (menu.classList.contains("show") && !e.target.closest(".site-header")) setOpen(false);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") setOpen(false);
  });
}

// ===== Подсветка текущего раздела в меню (главная) =====
const navLinks = document.querySelectorAll(".navbar a[href^='#']");
if (navLinks.length && "IntersectionObserver" in window) {
  const byId = new Map([...navLinks].map(a => [a.getAttribute("href").slice(1), a]));
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(a => a.classList.remove("active"));
      byId.get(entry.target.id)?.classList.add("active");
    });
  }, { rootMargin: "-45% 0px -50% 0px" });

  byId.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
}

// ===== Прокрутка: тень шапки, прогресс чтения, кнопка «Наверх» =====
const header = document.querySelector(".site-header");
const readProgress = document.querySelector(".read-progress");
const toTop = el("button", "to-top", "↑");
toTop.type = "button";
toTop.setAttribute("aria-label", "Наверх");
toTop.tabIndex = -1;
toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }));
document.body.append(toTop);

let scrollTicking = false;
const onScroll = () => {
  const y = window.scrollY;
  header?.classList.toggle("is-scrolled", y > 8);

  const showTop = y > 900;
  toTop.classList.toggle("is-visible", showTop);
  toTop.tabIndex = showTop ? 0 : -1;

  if (readProgress) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    readProgress.style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
  }
  scrollTicking = false;
};
window.addEventListener("scroll", () => {
  if (!scrollTicking) {
    scrollTicking = true;
    requestAnimationFrame(onScroll);
  }
}, { passive: true });
onScroll();

// ===== Появление блоков при прокрутке =====
// Прячем только то, что ниже экрана: если скрипт не загрузится, всё останется видимым
const revealEls = document.querySelectorAll(".reveal");
if (revealEls.length && !reduceMotion && "IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove("is-hidden");
      entry.target.classList.add("is-revealed");
      revealObserver.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px" });

  revealEls.forEach(node => {
    if (node.getBoundingClientRect().top > window.innerHeight) {
      node.classList.add("is-hidden");
      revealObserver.observe(node);
    }
  });
}

// ===== Счётчики цифр =====
const counters = document.querySelectorAll("[data-count]");
if (counters.length && !reduceMotion && "IntersectionObserver" in window) {
  const runCounter = node => {
    const target = Number(node.dataset.count);
    const start = performance.now();
    const step = now => {
      const t = Math.min((now - start) / 1200, 1);
      node.textContent = fmt(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    // Страховка: в фоновой вкладке анимация может не идти — итоговое число всё равно появится
    setTimeout(() => { node.textContent = fmt(target); }, 1500);
  };

  const counterObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      runCounter(entry.target);
      counterObserver.unobserve(entry.target);
    });
  }, { threshold: 0.6 });

  counters.forEach(node => {
    if (node.getBoundingClientRect().top > window.innerHeight) {
      node.style.minWidth = `${node.dataset.count.length}ch`; // ширина не прыгает во время счёта
      node.textContent = "0";
      counterObserver.observe(node);
    }
  });
}

// ===== Совет дня =====
const tipText = document.querySelector("[data-tip]");
if (tipText) {
  const tips = [
    "Поставьте бутылку воды на рабочий стол — пить станете чаще без всяких напоминаний.",
    "Добавляйте горсть овощей или зелени в каждый приём пищи — так проще набрать 400 г в день.",
    "Разговаривая по телефону, ходите: это лёгкий способ добавить шагов.",
    "Последнюю чашку кофе выпивайте не позже чем за 6 часов до сна.",
    "Ешьте медленно: сигнал о сытости приходит с задержкой.",
    "Каждые 30–60 минут сидячей работы вставайте хотя бы на пару минут.",
    "Выходите на дневной свет в первой половине дня — это настраивает внутренние часы.",
    "Заменяйте сладкие напитки водой, несладким чаем или минеральной водой.",
    "Держите фрукты на виду, а сладости уберите подальше: мы чаще едим то, что видим.",
    "Две силовые тренировки в неделю на все группы мышц — уже выполнение рекомендации ВОЗ.",
    "Перед сном запишите три главных дела на завтра — голове станет спокойнее.",
    "Поднимайтесь пешком хотя бы на пару этажей вместо лифта.",
    "Пробуйте блюдо, прежде чем солить: часто соли в нём уже достаточно.",
    "Бобовые 2–3 раза в неделю — простой способ добавить белка и клетчатки.",
    "Не можете уснуть 20 минут — встаньте и займитесь чем-то спокойным при тусклом свете.",
    "Начинайте любую тренировку с 5–10 минут разминки.",
    "Варите крупу сразу на 2–3 дня — полезный гарнир всегда будет под рукой.",
    "Читайте состав: если сахар среди первых трёх ингредиентов, продукт скорее десерт.",
    "Пять медленных вдохов с удлинённым выдохом помогают быстро снизить напряжение.",
    "Прогулка 10–15 минут после еды помогает держать уровень сахара в крови ровнее.",
    "Отмечайте даже маленькие победы — так привычка закрепляется быстрее.",
    "Новую привычку проще закрепить, если привязать её к старой: «после чистки зубов — 10 приседаний».",
    "Выходите на одну остановку раньше и прогуляйтесь — вот и плюс тысяча шагов.",
    "Замороженные овощи и ягоды почти так же полезны, как свежие, — держите их в запасе."
  ];
  let tipIndex = dayOfYear() % tips.length;
  tipText.textContent = tips[tipIndex];

  document.querySelector("[data-tip-next]")?.addEventListener("click", () => {
    tipIndex = (tipIndex + 1) % tips.length;
    tipText.classList.add("is-changing");
    setTimeout(() => {
      tipText.textContent = tips[tipIndex];
      tipText.classList.remove("is-changing");
    }, reduceMotion ? 0 : 200);
  });
}

// ===== Статья: время чтения, содержание, «Поделиться» =====
const article = document.querySelector(".article");
const readingTime = document.querySelector("[data-reading-time]");
if (article && readingTime) {
  const words = article.textContent.trim().split(/\s+/).length;
  readingTime.textContent = ` · ≈ ${Math.max(1, Math.round(words / 180))} мин чтения`;

  // Кнопка «Поделиться»: на телефоне откроет меню «Поделиться», на компьютере скопирует ссылку
  const shareRow = el("div", "share-row");
  const shareBtn = el("button", "btn ghost btn-sm", "Поделиться статьёй");
  shareBtn.type = "button";
  shareRow.append(shareBtn);
  readingTime.closest(".article-meta")?.after(shareRow);
  shareBtn.addEventListener("click", async () => {
    const url = window.location.href.split("#")[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Ссылка скопирована — можно отправлять");
    } catch (e) {
      if (e && e.name === "AbortError") return; // пользователь закрыл меню
      toast(`Ссылка на статью: ${url}`);
    }
  });
}

const toc = document.querySelector("[data-toc]");
if (toc) {
  const headings = [...document.querySelectorAll(".article h2[id]")];
  if (headings.length >= 3) {
    const list = el("ol");
    headings.forEach(h => {
      const link = el("a", "", h.textContent);
      link.href = `#${h.id}`;
      const item = el("li");
      item.append(link);
      list.append(item);
    });
    toc.append(el("p", "toc-title", "Содержание"), list);
    toc.hidden = false;
  }
}

// ===== Короткий звуковой сигнал (для таймера) =====
let audioCtx = null;
const unlockAudio = () => {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) { audioCtx = null; }
};
const beep = () => {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + 0.5);
};

// ===== Интерактивные инструменты =====
const showResult = (root, main, sub) => {
  const out = root.querySelector(".tool-result");
  out.replaceChildren(el("strong", "", main));
  if (sub) out.append(el("span", "tool-sub", sub));
};
const listen = (root, update) => {
  root.addEventListener("input", update);
  root.addEventListener("change", update);
  update();
};

const tools = {
  // Калькулятор белка
  protein(root) {
    const weight = root.querySelector("[name='weight']");
    const level = root.querySelector("[name='level']");
    listen(root, () => {
      const w = readNumber(weight, 30, 250);
      if (w === null) return showResult(root, "Введите вес от 30 до 250 кг");
      const [lo, hi] = level.value.split("-").map(Number);
      const min = Math.round(w * lo);
      const max = Math.round(w * hi);
      showResult(root,
        min === max ? `≈ ${min} г белка в день` : `≈ ${min}–${max} г белка в день`,
        `Разделите на 3–4 приёма пищи — примерно по ${Math.round(min / 4)}–${Math.round(max / 3)} г.`);
    });
  },

  // Калькулятор воды: 30–35 мл на кг
  water(root) {
    const weight = root.querySelector("[name='weight']");
    listen(root, () => {
      const w = readNumber(weight, 30, 250);
      if (w === null) return showResult(root, "Введите вес от 30 до 250 кг");
      const lo = w * 0.03;
      const hi = w * 0.035;
      showResult(root,
        `≈ ${fmt(lo, 1)}–${fmt(hi, 1)} л жидкости в день`,
        `Примерно ${Math.round(lo * 4)}–${Math.round(hi * 4)} стаканов по 250 мл, включая чай, кофе и супы. В жару и в дни тренировок — больше.`);
    });
  },

  // Стаканы воды за сегодня: нажимайте на стакан, когда выпили
  glasses(root) {
    const goal = Math.min(Math.max(Number(root.dataset.goal) || 8, 1), 16);
    const box = root.querySelector(".glasses");
    const out = root.querySelector("[data-progress]");
    const key = "lp-glasses";
    const day = today();
    const saved = loadJSON(key);
    let count = saved && saved.day === day && Number.isInteger(saved.count) ? Math.min(Math.max(saved.count, 0), goal) : 0;

    const buttons = [];
    const render = () => {
      buttons.forEach((b, i) => b.setAttribute("aria-pressed", i < count ? "true" : "false"));
      out.textContent = count >= goal
        ? `Цель выполнена: ${goal} ${plural(goal, "стакан", "стакана", "стаканов")}!`
        : `Выпито ${count} из ${goal} · ${fmt(count * 0.25, 2)} л`;
      root.classList.toggle("is-complete", count >= goal);
    };
    for (let i = 0; i < goal; i++) {
      const b = el("button", "glass");
      b.type = "button";
      b.setAttribute("aria-label", `Стакан ${i + 1}`);
      b.addEventListener("click", () => {
        const before = count;
        count = count === i + 1 ? i : i + 1; // повторное нажатие на последний стакан — отменить
        saveJSON(key, { day, count });
        render();
        if (count === goal && before < goal) confetti(root);
      });
      buttons.push(b);
    }
    box.replaceChildren(...buttons);
    root.querySelector("[data-action='clear']")?.addEventListener("click", () => {
      count = 0;
      saveJSON(key, { day, count });
      render();
    });
    render();
  },

  // Пульсовые зоны: максимум по формуле Танаки (208 − 0,7 × возраст)
  zones(root) {
    const age = root.querySelector("[name='age']");
    const body = root.querySelector("tbody");
    const zones = [
      [50, 60, "Разминка, восстановление"],
      [60, 70, "Лёгкое длительное кардио"],
      [70, 80, "Темповая работа"],
      [80, 90, "Интервалы"],
      [90, 100, "Короткие максимальные ускорения"]
    ];
    listen(root, () => {
      const a = readNumber(age, 12, 90);
      if (a === null) {
        showResult(root, "Введите возраст от 12 до 90 лет");
        body.replaceChildren();
        return;
      }
      const max = Math.round(208 - 0.7 * a);
      showResult(root, `Ваш расчётный максимальный пульс ≈ ${max} уд/мин`);
      body.replaceChildren(...zones.map(([lo, hi, purpose], i) => {
        const row = el("tr");
        row.append(
          el("td", "", `${i + 1} · ${lo}–${hi}%`),
          el("td", "", `${Math.round(max * lo / 100)}–${Math.round(max * hi / 100)}`),
          el("td", "", purpose)
        );
        return row;
      }));
    });
  },

  // Калькулятор сна: циклы по 90 минут + 15 минут на засыпание
  sleep(root) {
    const wake = root.querySelector("[name='wake']");
    const list = root.querySelector(".sleep-times");
    listen(root, () => {
      const [h, m] = (wake.value || "").split(":").map(Number);
      if (!Number.isInteger(h) || !Number.isInteger(m)) return;
      list.replaceChildren(...[6, 5, 4].map(cycles => {
        const t = ((h * 60 + m - cycles * 90 - 15) % 1440 + 1440) % 1440;
        const time = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
        const note = `${cycles} ${cycles === 4 ? "цикла" : "циклов"} · ${fmt(cycles * 1.5, 1)} ч сна${cycles === 4 ? " — маловато" : ""}`;
        const item = el("li", cycles >= 5 ? "is-good" : "");
        item.append(el("strong", "", time), el("span", "", note));
        return item;
      }));
    });
  },

  // Шаги → расстояние, время, энергия
  steps(root) {
    const steps = root.querySelector("[name='steps']");
    const height = root.querySelector("[name='height']");
    const weight = root.querySelector("[name='weight']");
    listen(root, () => {
      const s = readNumber(steps, 100, 100000);
      const h = readNumber(height, 120, 230);
      const w = readNumber(weight, 30, 250);
      if (s === null || h === null || w === null) {
        return showResult(root, "Проверьте значения: шаги 100–100 000, рост 120–230 см, вес 30–250 кг");
      }
      const km = s * h * 0.414 / 100000;      // длина шага ≈ 41 % роста
      const minutes = s / 100;                 // ≈ 100 шагов в минуту — бодрый темп
      const kcal = 3.5 * 3.5 * w / 200 * minutes; // ходьба ≈ 3,5 MET
      showResult(root,
        `≈ ${fmt(km, 1)} км · ≈ ${fmtDuration(minutes)} ходьбы`,
        `Около ${fmt(Math.round(kcal / 10) * 10)} ккал за всю прогулку (вместе с базовым расходом). Если шагов набирается меньше 6–8 тысяч в день — добавляйте понемногу, по 500–1000.`);
    });
  },

  // Суточная потребность в энергии: формула Миффлина — Сан Жеора
  energy(root) {
    const field = name => root.querySelector(`[name='${name}']`);
    listen(root, () => {
      const age = readNumber(field("age"), 18, 90);
      const h = readNumber(field("height"), 120, 230);
      const w = readNumber(field("weight"), 30, 250);
      if (age === null || h === null || w === null) {
        return showResult(root, "Калькулятор для взрослых: возраст 18–90 лет, рост 120–230 см, вес 30–250 кг");
      }
      const bmr = 10 * w + 6.25 * h - 5 * age + (field("sex").value === "m" ? 5 : -161);
      const total = bmr * (Number(field("activity").value) || 1.2);
      showResult(root,
        `≈ ${fmt(Math.round(total / 10) * 10)} ккал в день`,
        `Примерно столько нужно, чтобы вес оставался стабильным. Базовый обмен — расход в полном покое — около ${fmt(Math.round(bmr / 10) * 10)} ккал.`);
    });
  },

  // Индекс массы тела (только для взрослых)
  bmi(root) {
    const height = root.querySelector("[name='height']");
    const weight = root.querySelector("[name='weight']");
    listen(root, () => {
      const h = readNumber(height, 120, 230);
      const w = readNumber(weight, 30, 250);
      if (h === null || w === null) return showResult(root, "Введите рост от 120 до 230 см и вес от 30 до 250 кг");
      const v = w / Math.pow(h / 100, 2);
      const category = v < 18.5 ? "ниже нормы"
        : v < 25 ? "в пределах нормы"
        : v < 30 ? "выше нормы (избыточная масса тела)"
        : "ожирение — стоит обсудить с врачом";
      showResult(root, `ИМТ ≈ ${fmt(v, 1)}`, `По шкале ВОЗ для взрослых: ${category}.`);
    });
  },

  // Еда в минутах движения — игра для чувства масштаба
  burn(root) {
    const food = root.querySelector("[name='food']");
    const weight = root.querySelector("[name='weight']");
    const list = root.querySelector(".burn-list");
    const activities = [["спокойной ходьбы", 3.5], ["езды на велосипеде", 4], ["танцев", 5], ["лёгкого бега", 8.3]];
    listen(root, () => {
      const kcal = Number(food.value) || 0;
      const w = readNumber(weight, 30, 250);
      if (w === null || !kcal) {
        showResult(root, "Введите вес от 30 до 250 кг");
        list.replaceChildren();
        return;
      }
      showResult(root, `≈ ${kcal} ккал`, food.selectedOptions[0]?.textContent || "");
      list.replaceChildren(...activities.map(([name, met]) => {
        const perMinute = met * 3.5 * w / 200;
        const item = el("li");
        item.append(el("strong", "", fmtDuration(kcal / perMinute)), el("span", "", name));
        return item;
      }));
    });
  },

  // Генератор тренировки: по одному упражнению на каждую группу
  workout(root) {
    const pools = [
      ["ноги", ["Приседания", "Выпады назад", "Ягодичный мост", "Подъёмы на носки", "Приседания «сумо» с широкой постановкой ног"]],
      ["грудь и руки", ["Отжимания от стены", "Отжимания от стола", "Отжимания от пола", "Обратные отжимания от устойчивого стула"]],
      ["спина", ["«Супермен» лёжа на животе", "«Птица-собака» на четвереньках", "Тяга эспандера к поясу", "Разведение рук лёжа на животе"]],
      ["корпус", ["Планка на предплечьях", "Боковая планка", "«Мёртвый жук» лёжа на спине", "Скручивания лёжа"]],
      ["кардио", ["Ходьба на месте с высоким подниманием колен", "Прыжки «звёздочка»", "Бег на месте", "Шаги на устойчивую ступеньку"]]
    ];
    const timed = new Set(["Планка на предплечьях", "Боковая планка", "Ходьба на месте с высоким подниманием колен", "Прыжки «звёздочка»", "Бег на месте", "Шаги на устойчивую ступеньку"]);
    const perSide = new Set(["Выпады назад", "Боковая планка", "«Птица-собака» на четвереньках"]);
    const level = root.querySelector("[name='level']");
    const list = root.querySelector(".workout-list");
    const rounds = root.querySelector("[data-rounds]");
    const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

    const make = () => {
      const hard = level.value === "mid";
      list.replaceChildren(...pools.map(([group, moves]) => {
        const move = pick(moves);
        let dose = timed.has(move) ? `${hard ? 40 : 25} секунд` : `${hard ? rand(12, 15) : rand(8, 10)} повторений`;
        if (perSide.has(move)) dose += " на каждую сторону";
        const item = el("li");
        item.append(el("b", "", move), el("span", "muted", ` — ${dose} · ${group}`));
        return item;
      }));
      rounds.textContent = hard
        ? "Сделайте 3 круга, между кругами отдых 60 секунд."
        : "Сделайте 2 круга, между кругами отдых 90 секунд.";
    };
    root.querySelector("[data-action='shuffle']")?.addEventListener("click", make);
    level.addEventListener("change", make);
    make();
  },

  // Таймер комплекса упражнений
  routine(root) {
    const items = [...root.querySelectorAll(".routine-list li")];
    const secs = items.map(li => Number(li.dataset.sec) || 30);
    const total = secs.reduce((a, b) => a + b, 0);
    const stepOut = root.querySelector(".routine-step");
    const clock = root.querySelector(".routine-clock");
    const bar = root.querySelector(".progress-bar");
    const startBtn = root.querySelector("[data-action='start']");
    const resetBtn = root.querySelector("[data-action='reset']");
    const sound = root.querySelector("[data-sound]");
    const intro = stepOut.textContent;
    let idx = 0;
    let left = secs[0];
    let timer = null;
    let started = false;
    let wakeLock = null;

    const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    const stepName = i => items[i].querySelector(".routine-name").textContent;
    const elapsed = () => secs.slice(0, idx).reduce((a, b) => a + b, 0) + (idx < secs.length ? secs[idx] - left : 0);

    const render = () => {
      items.forEach((li, i) => {
        li.classList.toggle("is-current", started && i === idx);
        li.classList.toggle("is-done", started && i < idx);
      });
      clock.textContent = started ? mmss(left) : mmss(total);
      bar.style.transform = `scaleX(${elapsed() / total})`;
    };

    // Не даём экрану погаснуть, пока идёт таймер (если браузер поддерживает)
    const keepAwake = on => {
      if (on && "wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then(lock => { wakeLock = lock; }).catch(() => {});
      } else if (!on && wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
      }
    };

    const pause = label => {
      clearInterval(timer);
      timer = null;
      startBtn.textContent = label;
      keepAwake(false);
    };

    const tick = () => {
      left -= 1;
      if (left <= 0) {
        if (sound.checked) beep();
        idx += 1;
        if (idx >= items.length) {
          left = 0;
          pause("Ещё раз");
          stepOut.textContent = "Готово! Отличная работа.";
          render();
          confetti(root);
          return;
        }
        left = secs[idx];
        stepOut.textContent = stepName(idx);
      }
      render();
    };

    startBtn.addEventListener("click", () => {
      if (timer) return pause("Продолжить");
      unlockAudio();
      if (idx >= items.length) {
        idx = 0;
        left = secs[0];
      }
      started = true;
      stepOut.textContent = stepName(idx);
      startBtn.textContent = "Пауза";
      timer = setInterval(tick, 1000);
      keepAwake(true);
      render();
    });

    resetBtn.addEventListener("click", () => {
      pause("Старт");
      idx = 0;
      left = secs[0];
      started = false;
      stepOut.textContent = intro;
      render();
    });

    render();
  },

  // Дыхание 4–7–8
  breath(root) {
    const circle = root.querySelector(".breath-circle");
    const phaseOut = root.querySelector(".breath-phase");
    const countOut = root.querySelector(".breath-count");
    const btn = root.querySelector("[data-action='toggle']");
    const intro = phaseOut.textContent;
    const phases = [["Вдох", 4, 1], ["Задержка", 7, 1], ["Выдох", 8, 0.6]];
    const cycles = 4;
    let timer = null;
    let cycle = 0;
    let phase = 0;
    let left = 0;

    const setPhase = () => {
      const [name, sec, scale] = phases[phase];
      left = sec;
      phaseOut.textContent = name;
      countOut.textContent = String(left);
      circle.style.transitionDuration = `${sec}s`;
      circle.style.transform = `scale(${scale})`;
    };

    const stop = message => {
      clearInterval(timer);
      timer = null;
      btn.textContent = "Начать";
      phaseOut.textContent = message;
      countOut.textContent = "";
      circle.style.transitionDuration = "1s";
      circle.style.transform = "scale(.6)";
    };

    btn.addEventListener("click", () => {
      if (timer) return stop(intro);
      cycle = 0;
      phase = 0;
      setPhase();
      btn.textContent = "Остановить";
      timer = setInterval(() => {
        left -= 1;
        if (left > 0) {
          countOut.textContent = String(left);
          return;
        }
        phase = (phase + 1) % phases.length;
        if (phase === 0 && ++cycle >= cycles) return stop("Готово. Как самочувствие?");
        setPhase();
      }, 1000);
    });
  },

  // Чек-лист с сохранением отметок в браузере
  checklist(root) {
    const key = `hl-checklist-${root.dataset.key}`;
    const daily = root.hasAttribute("data-daily");
    const boxes = [...root.querySelectorAll("input[type='checkbox']")];
    const out = root.querySelector("[data-progress]");
    const day = today();

    const saved = loadJSON(key);
    if (saved && Array.isArray(saved.done) && (!daily || saved.day === day)) {
      saved.done.forEach(i => {
        if (Number.isInteger(i) && boxes[i]) boxes[i].checked = true;
      });
    }

    let wasComplete = boxes.every(b => b.checked);
    const update = celebrate => {
      const done = boxes.flatMap((box, i) => (box.checked ? [i] : []));
      const complete = done.length === boxes.length;
      out.textContent = complete ? (root.dataset.doneText || "Всё отмечено!") : `Отмечено ${done.length} из ${boxes.length}`;
      root.classList.toggle("is-complete", complete);
      saveJSON(key, { day, done });
      if (celebrate && complete && !wasComplete) confetti(root);
      wasComplete = complete;
    };

    root.addEventListener("change", () => update(true));
    root.querySelector("[data-action='clear']")?.addEventListener("click", () => {
      boxes.forEach(box => { box.checked = false; });
      update(false);
    });
    update(false);
  },

  // Трекер привычек: отметки за сегодня, неделя и серия дней
  habits(root) {
    const key = "lp-habits";
    const boxes = [...root.querySelectorAll("input[type='checkbox']")];
    const out = root.querySelector("[data-progress]");
    const streakOut = root.querySelector("[data-streak]");
    const week = root.querySelector(".week");
    const weekdays = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
    const day = today();

    const days = {};
    const saved = loadJSON(key);
    if (saved && saved.days && typeof saved.days === "object") {
      Object.entries(saved.days).forEach(([d, list]) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Array.isArray(list)) {
          days[d] = list.filter(i => Number.isInteger(i) && i >= 0 && i < boxes.length);
        }
      });
    }
    (days[day] || []).forEach(i => { boxes[i].checked = true; });
    const count = d => (days[d] ? days[d].length : 0);

    const render = () => {
      const done = count(day);
      out.textContent = done === boxes.length ? "Все привычки на сегодня выполнены!" : `Сегодня: ${done} из ${boxes.length}`;
      root.classList.toggle("is-complete", done === boxes.length);

      week.replaceChildren(...[6, 5, 4, 3, 2, 1, 0].map(n => {
        const d = daysAgo(n);
        const c = count(dateKey(d));
        const item = el("li", n === 0 ? "is-today" : "");
        const level = c === boxes.length ? " lvl-2" : c > 0 ? " lvl-1" : "";
        item.append(el("span", `week-dot${level}`, c ? String(c) : ""), el("span", "", weekdays[d.getDay()]));
        item.title = `${weekdays[d.getDay()]}: ${c} из ${boxes.length}`;
        return item;
      }));

      // Серия: подряд идущие дни хотя бы с одной отметкой (сегодняшний день не обнуляет серию, пока он не закончился)
      let streak = 0;
      for (let n = count(day) ? 0 : 1; n < 400; n++) {
        if (count(dateKey(daysAgo(n)))) streak += 1;
        else break;
      }
      streakOut.textContent = streak
        ? `Серия: ${streak} ${plural(streak, "день", "дня", "дней")} подряд`
        : "Отметьте первую привычку — и серия начнётся";
    };

    const save = () => {
      Object.keys(days).sort().slice(0, -400).forEach(k => { delete days[k]; }); // храним до 400 дней
      saveJSON(key, { days });
    };

    root.addEventListener("change", () => {
      const before = count(day);
      days[day] = boxes.flatMap((b, i) => (b.checked ? [i] : []));
      save();
      render();
      if (count(day) === boxes.length && before < boxes.length) confetti(root);
    });
    root.querySelector("[data-action='clear']")?.addEventListener("click", () => {
      boxes.forEach(b => { b.checked = false; });
      days[day] = [];
      save();
      render();
    });
    render();
  },

  // Вызов дня
  challenge(root) {
    const items = [
      "Сделайте 20 приседаний — можно в два подхода.",
      "Пройдите сегодня на 1000 шагов больше, чем обычно.",
      "Выпейте стакан воды прямо сейчас.",
      "Съешьте сегодня овощи трёх разных цветов.",
      "Поднимитесь пешком хотя бы на три этажа.",
      "Минута планки — можно частями по 20 секунд.",
      "Уберите телефон за час до сна.",
      "Выйдите на улицу на 10 минут при дневном свете.",
      "Сделайте пять медленных вдохов с длинным выдохом.",
      "Замените один сладкий напиток водой или несладким чаем.",
      "Позвоните другу или близкому — просто поговорить.",
      "Ешьте обед без телефона и телевизора.",
      "Разомните шею и плечи: по 10 кругов вперёд и назад.",
      "Запишите три хороших события сегодняшнего дня.",
      "Пройдите одну остановку пешком.",
      "Добавьте горсть зелени в любое блюдо.",
      "Встаньте и пройдитесь каждые 45 минут сидячей работы.",
      "Сделайте 10 отжиманий — от стены, стола или пола.",
      "Лягте спать на 20 минут раньше обычного.",
      "Приготовьте перекус из фрукта и горсти орехов.",
      "Потанцуйте под одну любимую песню.",
      "Сделайте «кошку — корову» 10 раз, чтобы размять спину.",
      "Проверьте этикетку любимого продукта: сколько в нём сахара?",
      "Постойте минуту на одной ноге, потом на другой.",
      "Выключите уведомления соцсетей на вечер.",
      "Съешьте сегодня порцию бобовых: чечевицу, нут или фасоль.",
      "Улыбнитесь трём людям — проверьте, улыбнутся ли в ответ.",
      "Наведите порядок на рабочем столе за 5 минут.",
      "Сделайте 30-секундную растяжку ног после каждого похода по лестнице.",
      "Поблагодарите кого-нибудь за мелочь, которую обычно не замечают."
    ];
    const text = root.querySelector(".challenge-text");
    const note = root.querySelector(".challenge-note");
    const doneBtn = root.querySelector("[data-action='done']");
    const nextBtn = root.querySelector("[data-action='next']");
    const key = "lp-challenge";
    const day = today();
    const saved = loadJSON(key) || {};
    let total = Number.isInteger(saved.total) && saved.total >= 0 ? saved.total : 0;
    let index = dayOfYear() % items.length;
    let done = false;
    if (saved.day === day) {
      if (Number.isInteger(saved.index) && items[saved.index]) index = saved.index;
      done = saved.done === true;
    }

    const render = () => {
      text.textContent = items[index];
      root.classList.toggle("is-done", done);
      doneBtn.textContent = done ? "Выполнено ✓" : "Сделано!";
      doneBtn.disabled = done;
      nextBtn.hidden = done;
      note.textContent = total
        ? `Вы выполнили ${total} ${plural(total, "вызов", "вызова", "вызовов")}. Новый — каждый день.`
        : "Новый вызов — каждый день. Не подходит этот — возьмите другой.";
    };
    nextBtn.addEventListener("click", () => {
      index = (index + 1) % items.length;
      saveJSON(key, { day, index, done, total });
      render();
    });
    doneBtn.addEventListener("click", () => {
      if (done) return;
      done = true;
      total += 1;
      saveJSON(key, { day, index, done, total });
      render();
      confetti(doneBtn);
      toast("Так держать! Завтра будет новый вызов.");
    });
    render();
  },

  // Тест «Миф или факт»: вопросы берутся из списка ответов на странице
  quiz(root) {
    const source = [...document.querySelectorAll(".answers-list li[data-answer]")].map(li => ({
      text: li.querySelector("b")?.textContent.trim() || "",
      myth: li.dataset.answer === "myth",
      why: li.querySelector("span:not(.tag)")?.textContent.trim() || ""
    })).filter(q => q.text);
    if (!source.length) return;

    const progressText = root.querySelector(".quiz-progress");
    const bar = root.querySelector(".progress-bar");
    const statement = root.querySelector(".quiz-statement");
    const choices = root.querySelector(".quiz-choices");
    const feedback = root.querySelector(".quiz-feedback");
    const bestKey = "lp-quiz-best";
    let order = [], idx = 0, score = 0;

    const button = (label, cls, onClick) => {
      const b = el("button", `btn ${cls}`, label);
      b.type = "button";
      b.addEventListener("click", onClick);
      return b;
    };
    const shuffle = list => {
      const a = list.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const ask = () => {
      const q = order[idx];
      progressText.textContent = `Вопрос ${idx + 1} из ${order.length} · верных ответов: ${score}`;
      bar.style.transform = `scaleX(${idx / order.length})`;
      statement.textContent = `«${q.text}»`;
      feedback.hidden = true;
      feedback.classList.remove("is-wrong");
      choices.replaceChildren(
        button("Миф", "ghost", () => answer(true)),
        button("Факт", "ghost", () => answer(false))
      );
      choices.querySelector("button").focus({ preventScroll: true });
    };

    const answer = saidMyth => {
      const q = order[idx];
      const right = saidMyth === q.myth;
      if (right) score += 1;
      feedback.replaceChildren(
        el("span", "quiz-verdict", `${right ? "Верно!" : "Не совсем."} Это ${q.myth ? "миф" : "факт"}.`),
        el("span", "", q.why)
      );
      feedback.classList.toggle("is-wrong", !right);
      feedback.hidden = false;
      idx += 1;
      const last = idx >= order.length;
      const next = button(last ? "Узнать результат" : "Дальше", "primary", last ? finish : ask);
      choices.replaceChildren(next);
      next.focus({ preventScroll: true });
    };

    const finish = () => {
      const n = order.length;
      const best = Math.max(score, Number(store.get(bestKey)) || 0);
      store.set(bestKey, String(best));
      bar.style.transform = "scaleX(1)";
      progressText.textContent = `Лучший результат: ${best} из ${n}`;
      const ratio = score / n;
      statement.textContent = `Ваш результат: ${score} из ${n}. ` + (
        ratio === 1 ? "Безупречно — мифам вас не провести!"
          : ratio >= 0.75 ? "Отлично! Вы хорошо отличаете науку от слухов."
          : ratio >= 0.5 ? "Неплохо! Загляните в разбор ниже — там всё по полочкам."
          : "Мифы оказались хитрее. Прочитайте разбор — и попробуйте ещё раз!"
      );
      feedback.hidden = true;
      const again = button("Пройти ещё раз", "primary", start);
      const share = button("Поделиться результатом", "ghost", async () => {
        const url = window.location.href.split("#")[0];
        const textMsg = `Я набрал(а) ${score} из ${n} в тесте «Миф или факт» на сайте Листопульс. А вы?`;
        try {
          if (navigator.share) { await navigator.share({ title: "Миф или факт", text: textMsg, url }); return; }
          await navigator.clipboard.writeText(`${textMsg} ${url}`);
          toast("Результат скопирован — можно отправлять");
        } catch (e) {
          if (e && e.name !== "AbortError") toast(textMsg);
        }
      });
      choices.replaceChildren(again, share);
      if (ratio >= 0.75) confetti(statement);
    };

    const start = () => {
      order = shuffle(source);
      idx = 0;
      score = 0;
      ask();
    };

    const best = Number(store.get(bestKey)) || 0;
    progressText.textContent = best
      ? `${source.length} утверждений. Ваш лучший результат: ${best} из ${source.length}`
      : `${source.length} утверждений о еде, сне и спорте. Сможете отличить миф от факта?`;
    choices.replaceChildren(button("Начать тест", "primary", start));
  }
};

document.querySelectorAll("[data-tool]").forEach(root => {
  const name = root.dataset.tool;
  if (Object.prototype.hasOwnProperty.call(tools, name)) tools[name](root);
});

// ===== Форма обратной связи =====
// Сайт статический, сервера нет: письмо формируется и открывается в почтовом приложении посетителя.
// Адрес берётся из атрибута action формы (mailto:...).
const form = document.querySelector(".contact-form");
if (form) {
  const status = form.querySelector(".form-status");
  const address = (form.getAttribute("action") || "").replace(/^mailto:/i, "");
  // Убираем управляющие символы, чтобы нельзя было «разорвать» тему письма
  const clean = s => s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();

  form.addEventListener("submit", e => {
    e.preventDefault();
    const data = new FormData(form);
    const name = clean(String(data.get("name") || "")).slice(0, 80);
    const email = clean(String(data.get("email") || "")).slice(0, 120);
    const message = String(data.get("message") || "").trim().slice(0, 1000);
    status.hidden = false;

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) || /@example\.com$/i.test(address)) {
      status.textContent = "Форма пока не подключена: владелец сайта ещё не указал адрес почты.";
      return;
    }

    const subject = `Сообщение с сайта Листопульс — ${name}`;
    const body = `${message}\n\n— ${name}, ${email}`;
    window.location.href = `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status.textContent = `Открываем почтовое приложение… Если оно не открылось, напишите на ${address}.`;
  });
}
