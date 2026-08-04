'use strict';

const CACHE_PREFIX = 'image-motion-tool-v';
const CACHE_NAME = `${CACHE_PREFIX}22`;
const APP_SHELL = Object.freeze([
  './',
  './index.html',
  './app.css?v=6',
  './app-core.js?v=6',
  './motion-model.js?v=7',
  './gif-retimer.js?v=1',
  './apng-encoder.js?v=2',
  './webp-encoder.js?v=2',
  './app.js?v=18',
  './app-image.js?v=5',
  './app-export.js?v=13',
  './app-events.js?v=19',
  './preview-page.js?v=2',
  './preview-page.css?v=1',
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

function normalizedNavigationUrl(url) {
  const normalized = new URL(url.href);
  normalized.search = '';
  normalized.hash = '';
  return normalized.href;
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(
    APP_SHELL.map((path) => new Request(path, { cache: 'reload' })),
  )));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const isNavigation = event.request.mode === 'navigate'
    && NAVIGATION_URLS.has(normalizedNavigationUrl(requestUrl));
  if (isNavigation) {
    event.respondWith(fetch(event.request).catch(async () => (
      (await caches.match(new URL('./index.html', self.registration.scope).href))
      || caches.match(new URL('./', self.registration.scope).href)
    )));
    return;
  }

  if (!ALLOWED_URLS.has(requestUrl.href)) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
