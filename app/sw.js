// ===== Листопульс: офлайн-режим =====
// Кэширует только файлы самого приложения. Ничего не отправляет и не загружает со сторонних сайтов.
const VERSION = "lpapp-1.0.0";
const ASSETS = [
  "./", "./index.html", "./app.css", "./boot.js", "./app.js", "./ui.js", "./store.js", "./engine.js", "./data.js",
  "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
  "./terms.html", "./privacy.html"
];
const SCOPE = new URL("./", self.location).pathname;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("lpapp-") && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;

  const fromNetwork = () => fetch(request).then(response => {
    if (response.ok && response.type === "basic") {
      const copy = response.clone();
      caches.open(VERSION).then(cache => cache.put(request, copy));
    }
    return response;
  });

  // Страницы: сначала сеть (чтобы получать обновления), без сети — из кэша
  if (request.mode === "navigate") {
    event.respondWith(fromNetwork().catch(() => caches.match(request).then(r => r || caches.match("./index.html"))));
    return;
  }
  // Остальное: из кэша сразу, в фоне — обновление
  event.respondWith(caches.match(request).then(cached => {
    const network = fromNetwork().catch(() => cached);
    return cached || network;
  }));
});
