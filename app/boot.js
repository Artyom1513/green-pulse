// ===== Листопульс: ранний запуск =====
// Подключается в <head>: тема применяется до отрисовки, а встраивание в чужие страницы сразу замечается.
try {
  const theme = localStorage.getItem("lpapp-theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (e) { /* без сохранённой темы */ }
try {
  if (window.top !== window.self) document.documentElement.classList.add("is-framed");
} catch (e) {
  document.documentElement.classList.add("is-framed");
}
