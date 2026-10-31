// ===== Общие помощники =====
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// localStorage может быть недоступен (приватный режим) — любые ошибки просто игнорируем
const store = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* без сохранения */ } }
};

// Создание элемента с текстом. Только textContent, без innerHTML — защита от XSS
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const fmt = (n, digits = 0) => n.toLocaleString("ru-RU", { maximumFractionDigits: digits });

// Число из поля ввода в допустимых пределах, иначе null
const readNumber = (input, min, max) => {
  const v = parseFloat(String(input.value).replace(",", "."));
  return Number.isFinite(v) && v >= min && v <= max ? v : null;
};

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
  const setOpen = (open) => {
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
if (navLinks.length) {
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
    "Отмечайте даже маленькие победы — так привычка закрепляется быстрее."
  ];
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 864e5);
  let tipIndex = dayOfYear % tips.length;
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

// ===== Статья: время чтения и содержание =====
const article = document.querySelector(".article");
const readingTime = document.querySelector("[data-reading-time]");
if (article && readingTime) {
  const words = article.textContent.trim().split(/\s+/).length;
  readingTime.textContent = ` · ≈ ${Math.max(1, Math.round(words / 180))} мин чтения`;
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

const tools = {
  // Калькулятор белка
  protein(root) {
    const weight = root.querySelector("[name='weight']");
    const level = root.querySelector("[name='level']");
    const update = () => {
      const w = readNumber(weight, 30, 250);
      if (w === null) return showResult(root, "Введите вес от 30 до 250 кг");
      const [lo, hi] = level.value.split("-").map(Number);
      const min = Math.round(w * lo);
      const max = Math.round(w * hi);
      showResult(root,
        min === max ? `≈ ${min} г белка в день` : `≈ ${min}–${max} г белка в день`,
        `Разделите на 3–4 приёма пищи — примерно по ${Math.round(min / 4)}–${Math.round(max / 3)} г.`);
    };
    root.addEventListener("input", update);
    update();
  },

  // Калькулятор воды: 30–35 мл на кг
  water(root) {
    const weight = root.querySelector("[name='weight']");
    const update = () => {
      const w = readNumber(weight, 30, 250);
      if (w === null) return showResult(root, "Введите вес от 30 до 250 кг");
      const lo = w * 0.03;
      const hi = w * 0.035;
      showResult(root,
        `≈ ${fmt(lo, 1)}–${fmt(hi, 1)} л жидкости в день`,
        `Примерно ${Math.round(lo * 4)}–${Math.round(hi * 4)} стаканов по 250 мл, включая чай, кофе и супы. В жару и в дни тренировок — больше.`);
    };
    root.addEventListener("input", update);
    update();
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
    const update = () => {
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
    };
    root.addEventListener("input", update);
    update();
  },

  // Калькулятор сна: циклы по 90 минут + 15 минут на засыпание
  sleep(root) {
    const wake = root.querySelector("[name='wake']");
    const list = root.querySelector(".sleep-times");
    const update = () => {
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
    };
    root.addEventListener("input", update);
    update();
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
    const today = new Date().toLocaleDateString("sv-SE"); // ГГГГ-ММ-ДД по местному времени

    let saved = null;
    try { saved = JSON.parse(store.get(key)); } catch (e) { saved = null; }
    if (saved && Array.isArray(saved.done) && (!daily || saved.day === today)) {
      saved.done.forEach(i => {
        if (Number.isInteger(i) && boxes[i]) boxes[i].checked = true;
      });
    }

    const update = () => {
      const done = boxes.flatMap((box, i) => (box.checked ? [i] : []));
      const complete = done.length === boxes.length;
      out.textContent = complete ? (root.dataset.doneText || "Всё отмечено!") : `Отмечено ${done.length} из ${boxes.length}`;
      root.classList.toggle("is-complete", complete);
      store.set(key, JSON.stringify({ day: today, done }));
    };

    root.addEventListener("change", update);
    root.querySelector("[data-action='clear']")?.addEventListener("click", () => {
      boxes.forEach(box => { box.checked = false; });
      update();
    });
    update();
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

    const subject = `Сообщение с сайта Healthy Life — ${name}`;
    const body = `${message}\n\n— ${name}, ${email}`;
    window.location.href = `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status.textContent = `Открываем почтовое приложение… Если оно не открылось, напишите на ${address}.`;
  });
}
