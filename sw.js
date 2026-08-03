'use strict';

const CACHE_NAME = 'image-motion-tool-v14';
const APP_SHELL = Object.freeze([
  './',
  './index.html',
  './app.css?v=4',
  './app-core.js?v=6',
  './motion-model.js?v=7',
  './gif-retimer.js?v=1',
  './apng-encoder.js?v=1',
  './webp-encoder.js?v=2',
  './app.js?v=12',
  './app-image.js?v=5',
  './app-export.js?v=10',
  './app-events.js?v=12',
  './gif-encoder.js?v=5',
  './gif-worker.js?v=5',
  './manifest.webmanifest',
  './icon.svg',
]);
const ALLOWED_URLS = new Set(APP_SHELL.map((path) => new URL(path, self.registration.scope).href));
const NAVIGATION_URLS = new Set([
  new URL('./', self.registration.scope).href,
  new URL('./index.html', self.registration.scope).href,
]);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(
    APP_SHELL.map((path) => new Request(path, { cache: 'reload' })),
  )));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || !ALLOWED_URLS.has(requestUrl.href)) return;

  if (event.request.mode === 'navigate' || NAVIGATION_URLS.has(requestUrl.href)) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
