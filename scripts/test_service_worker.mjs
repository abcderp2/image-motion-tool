import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const listeners = new Map();
const deletedCaches = [];
const matchedRequests = [];
const ownScope = 'https://example.test/image-motion-tool/';
const indexResponse = Object.freeze({ source: 'cached-index' });

const context = {
  URL,
  Request,
  Promise,
  self: {
    registration: { scope: ownScope },
    location: { origin: 'https://example.test' },
    clients: { claim() {} },
    skipWaiting() {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
  },
  caches: {
    async keys() {
      return ['image-motion-tool-v20', 'image-motion-tool-v21', 'another-tool-v4'];
    },
    async delete(key) {
      deletedCaches.push(key);
      return true;
    },
    async open() {
      return { addAll: async () => undefined };
    },
    async match(request) {
      const url = typeof request === 'string' ? request : request.url;
      matchedRequests.push(url);
      return url === `${ownScope}index.html` ? indexResponse : undefined;
    },
  },
  async fetch() {
    throw new Error('offline');
  },
};

vm.runInNewContext(source, context, { filename: 'sw.js' });

assert.ok(listeners.has('activate'));
assert.ok(listeners.has('fetch'));

let activation;
listeners.get('activate')({
  waitUntil(promise) {
    activation = promise;
  },
});
await activation;
assert.deepEqual(deletedCaches, ['image-motion-tool-v20']);

let navigationResponse;
listeners.get('fetch')({
  request: {
    method: 'GET',
    mode: 'navigate',
    url: `${ownScope}?build=21-check`,
  },
  respondWith(promise) {
    navigationResponse = promise;
  },
});
assert.ok(navigationResponse);
assert.equal(await navigationResponse, indexResponse);
assert.ok(matchedRequests.includes(`${ownScope}index.html`));

let unrelatedIntercepted = false;
listeners.get('fetch')({
  request: {
    method: 'GET',
    mode: 'no-cors',
    url: 'https://example.test/another-tool/app.js',
  },
  respondWith() {
    unrelatedIntercepted = true;
  },
});
assert.equal(unrelatedIntercepted, false);

let postIntercepted = false;
listeners.get('fetch')({
  request: {
    method: 'POST',
    mode: 'navigate',
    url: ownScope,
  },
  respondWith() {
    postIntercepted = true;
  },
});
assert.equal(postIntercepted, false);

console.log('service worker isolation tests passed');
