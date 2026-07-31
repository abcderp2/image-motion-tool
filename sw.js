'use strict';

const CACHE_NAME = 'image-motion-tool-v3';
const APP_SHELL = Object.freeze([
  './',
  './index.html',
  './app.css?v=2',
  './app-core.js?v=2',
  './app.js?v=2',
  './app-image.js?v=2',
  './app-export.js?v=3',
  './app-events.js?v=3',
  './gif-encoder.js?v=3',
  './gif-worker.js?v=3',
  './manifest.webmanifest',
  './icon.svg',
]);
const ALLOWED_URLS = new Set(APP_SHELL.map((path) => new URL(path, self.registration.scope).href));

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
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

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});
