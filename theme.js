// ===== Тема оформления и защита от встраивания =====
// Подключается в <head>, поэтому срабатывает до отрисовки страницы.

// 1. Сохранённая тема применяется сразу — без «мигания» светлой темы
try {
  const theme = localStorage.getItem("theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (e) {
  // localStorage недоступен (приватный режим, запрет cookie) — остаётся системная тема
}

// 2. Защита от кликджекинга: если сайт открыт внутри чужой страницы, содержимое прячется
//    (style.css), а script.js показывает ссылку, чтобы открыть сайт напрямую.
//    На хостинге с заголовками (.htaccess, _headers) то же самое делает frame-ancestors 'none'.
try {
  if (window.top !== window.self) document.documentElement.classList.add("is-framed");
} catch (e) {
  document.documentElement.classList.add("is-framed");
}
