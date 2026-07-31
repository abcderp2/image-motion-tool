import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

const requiredFiles = [
  'index.html', 'app.css', 'app-core.js', 'app.js', 'app-image.js', 'app-export.js', 'app-events.js', 'gif-encoder.js', 'gif-worker.js',
  'sw.js', 'manifest.webmanifest', 'icon.svg', 'README.md', 'SECURITY.md', 'MAINTENANCE.md',
];
for (const file of requiredFiles) await access(new URL(`../${file}`, import.meta.url), constants.R_OK);

const root = new URL('../', import.meta.url);
const index = await readFile(new URL('index.html', root), 'utf8');
const appMain = await readFile(new URL('app.js', root), 'utf8');
const appImage = await readFile(new URL('app-image.js', root), 'utf8');
const appExport = await readFile(new URL('app-export.js', root), 'utf8');
const appEvents = await readFile(new URL('app-events.js', root), 'utf8');
const app = [appMain, appImage, appExport, appEvents].join('\n');
const worker = await readFile(new URL('gif-worker.js', root), 'utf8');
const sw = await readFile(new URL('sw.js', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));

assert.match(index, /Content-Security-Policy/);
assert.match(index, /connect-src 'none'/);
assert.match(index, /object-src 'none'/);
assert.doesNotMatch(index, /<script[^>]+src="https?:\/\//i);
assert.doesNotMatch(index, /<link[^>]+href="https?:\/\/[^\"]+\.css/i);
assert.doesNotMatch(app, /\.innerHTML\s*=|eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(worker, /https?:\/\//);
assert.match(sw, /ALLOWED_URLS/);
assert.doesNotMatch(sw, /cache\.put\(/);
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');

assert.match(index, /gif-encoder\.js\?v=3/);
assert.match(index, /app-export\.js\?v=3/);
assert.match(index, /app-events\.js\?v=3/);
assert.match(appExport, /gif-worker\.js\?v=3/);
assert.match(appEvents, /sw\.js\?v=3/);
assert.match(worker, /gif-encoder\.js\?v=3/);
assert.match(sw, /image-motion-tool-v3/);
for (const asset of ['app-export.js?v=3', 'app-events.js?v=3', 'gif-encoder.js?v=3', 'gif-worker.js?v=3']) {
  assert.ok(sw.includes(`'./${asset}'`), `sw.js is missing ${asset}`);
}

const htmlIds = new Set([...index.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
for (const match of app.matchAll(/querySelector\('#([^']+)'\)/g)) {
  assert.ok(htmlIds.has(match[1]), `index.html is missing #${match[1]}`);
}
const controlIdsMatch = app.match(/const controlIds = \[([\s\S]*?)\];/);
assert.ok(controlIdsMatch);
for (const match of controlIdsMatch[1].matchAll(/'([^']+)'/g)) {
  assert.ok(htmlIds.has(match[1]), `index.html is missing control #${match[1]}`);
}

console.log('static checks passed');
