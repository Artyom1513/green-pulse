// ===== Тема оформления =====
// Подключается в <head>, чтобы применить сохранённую тему до отрисовки страницы (без «мигания»).
try {
  const theme = localStorage.getItem("theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (e) {
  // localStorage недоступен (приватный режим, запрет cookie) — остаётся системная тема
}
