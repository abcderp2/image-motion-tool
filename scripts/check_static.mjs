import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

const requiredFiles = [
  'index.html', 'app.css', 'app-core.js', 'motion-model.js', 'gif-retimer.js', 'apng-encoder.js', 'webp-encoder.js', 'app.js', 'app-image.js', 'app-export.js', 'app-events.js', 'gif-encoder.js', 'gif-worker.js',
  'sw.js', 'manifest.webmanifest', 'icon.svg', 'robots.txt', 'ai.txt', 'sitemap.xml', 'README.md', 'SECURITY.md', 'MAINTENANCE.md',
  'scripts/test_app_core.mjs', 'scripts/test_motion_model.mjs', 'scripts/test_gif_encoder.mjs', 'scripts/test_gif_retimer.mjs', 'scripts/test_apng_encoder.mjs', 'scripts/test_webp_encoder.mjs', 'scripts/test_gif_disposal.mjs', 'scripts/test_gif_dominant_color.mjs',
];
for (const file of requiredFiles) await access(new URL(`../${file}`, import.meta.url), constants.R_OK);

const root = new URL('../', import.meta.url);
const index = await readFile(new URL('index.html', root), 'utf8');
const appCore = await readFile(new URL('app-core.js', root), 'utf8');
const motionModel = await readFile(new URL('motion-model.js', root), 'utf8');
const gifRetimer = await readFile(new URL('gif-retimer.js', root), 'utf8');
const apngEncoder = await readFile(new URL('apng-encoder.js', root), 'utf8');
const webpEncoder = await readFile(new URL('webp-encoder.js', root), 'utf8');
const appMain = await readFile(new URL('app.js', root), 'utf8');
const appImage = await readFile(new URL('app-image.js', root), 'utf8');
const appExport = await readFile(new URL('app-export.js', root), 'utf8');
const appEvents = await readFile(new URL('app-events.js', root), 'utf8');
const app = [motionModel, gifRetimer, apngEncoder, webpEncoder, appMain, appImage, appExport, appEvents].join('\n');
const encoder = await readFile(new URL('gif-encoder.js', root), 'utf8');
const worker = await readFile(new URL('gif-worker.js', root), 'utf8');
const sw = await readFile(new URL('sw.js', root), 'utf8');
const robots = await readFile(new URL('robots.txt', root), 'utf8');
const ai = await readFile(new URL('ai.txt', root), 'utf8');
const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));

assert.match(index, /Content-Security-Policy/);
assert.match(index, /connect-src 'none'/);
assert.match(index, /object-src 'none'/);
assert.match(index, /Permissions-Policy/);
assert.match(index, /href="ai\.txt"/);
assert.match(robots, /User-agent:\s*\*/);
assert.match(robots, /Sitemap:/);
assert.match(ai, /MIT License/);
assert.match(ai, /AI visits|AIの訪問/);
assert.match(sitemap, /https:\/\/abcderp2\.github\.io\/image-motion-tool\//);
assert.doesNotMatch(index, /<script[^>]+src="https?:\/\//i);
assert.doesNotMatch(index, /<link[^>]+href="https?:\/\/[^\"]+\.css/i);
assert.doesNotMatch(app, /\.innerHTML\s*=|eval\s*\(|new Function\s*\(/);
assert.doesNotMatch(worker, /https?:\/\//);
assert.match(sw, /ALLOWED_URLS/);
assert.match(sw, /NAVIGATION_URLS/);
assert.doesNotMatch(sw, /cache\.put\(/);
assert.equal(manifest.start_url, './');
assert.equal(manifest.scope, './');

assert.match(index, /application-version" content="12"/);
assert.match(index, /Build 12/);
assert.match(index, /app-core\.js\?v=6/);
assert.match(index, /motion-model\.js\?v=7/);
assert.match(index, /gif-retimer\.js\?v=1/);
assert.match(index, /apng-encoder\.js\?v=1/);
assert.match(index, /webp-encoder\.js\?v=2/);
assert.match(index, /app\.js\?v=10/);
assert.match(index, /gif-encoder\.js\?v=5/);
assert.match(index, /app-image\.js\?v=5/);
assert.match(index, /app-export\.js\?v=10/);
assert.match(index, /app-events\.js\?v=10/);
assert.match(appExport, /gif-worker\.js\?v=5/);
assert.match(appExport, /ImageMotionApng/);
assert.match(appExport, /ImageMotionWebp/);
assert.match(appEvents, /sw\.js\?v=12/);
assert.match(appEvents, /updateViaCache: 'none'/);
assert.match(worker, /gif-encoder\.js\?v=5/);
assert.match(sw, /image-motion-tool-v12/);
assert.match(encoder, /transparent \? 0x09 : 0x04/);
assert.match(encoder, /colors\.length - 1/);
assert.match(encoder, /palette box must contain colors/);
assert.doesNotMatch(appExport, /dither: 'error-diffusion'/);
assert.match(index, /app\.css\?v=3/);
for (const asset of ['app.css?v=3', 'app-core.js?v=6', 'motion-model.js?v=7', 'gif-retimer.js?v=1', 'apng-encoder.js?v=1', 'webp-encoder.js?v=2', 'app.js?v=10', 'app-image.js?v=5', 'app-export.js?v=10', 'app-events.js?v=10', 'gif-encoder.js?v=5', 'gif-worker.js?v=5']) {
  assert.ok(sw.includes(`'./${asset}'`), `sw.js is missing ${asset}`);
}

assert.match(index, /value="sway">左右に傾く</);
assert.match(index, /value="breathe">呼吸する</);
assert.match(index, /value="zoom">ゆっくり拡大して戻る</);
assert.match(index, /value="pendulum">振り子</);
assert.match(index, /value="squash">伸縮</);
assert.doesNotMatch(index, /プレビュー速度/);
assert.match(index, /動きの速さ/);
assert.match(index, /アニメーション内の動作回数/);
assert.match(index, /動きの速さはプレビューとアニメーションの再生速度へ反映/);
assert.match(index, /速度を変えて再生成/);
assert.match(index, /生成済みGIFそのものは編集しません/);
assert.match(index, /gifRetimeInput/);
assert.match(index, /速度倍率/);
assert.match(index, /フレーム画像を再描画せず/);
assert.match(index, /速度変更後のGIFを開く/);
const motionDetails = index.match(/<details class="advanced-settings">[\s\S]*?<\/details>/)?.[0] || '';
assert.doesNotMatch(motionDetails, /loopCycles|GIF内の動作回数/);
assert.match(index, /保存したアニメーションを別タブで開く/);
assert.match(index, /value="webp">アニメーションWebP</);
assert.match(index, /id="webpQuality"/);
assert.match(index, /rel="noopener noreferrer"/);
assert.match(appMain, /URL\.revokeObjectURL\(gifPreviewObjectUrl\)/);
assert.match(appMain, /lastGeneratedGifSettings/);
assert.match(appMain, /regenerateGifButton/);
assert.match(appMain, /ImageMotionGifRetimer/);
assert.match(appMain, /retimedGifPreviewObjectUrl/);
assert.match(appExport, /setGifPreview\(gifBlob, 'gif'\)/);
assert.match(appExport, /core\.gifFrameDelay\(settings\)/);
assert.match(appExport, /regenerateGifWithSpeed/);
assert.match(appExport, /gifRetimer\.retimeGif/);
assert.match(appExport, /loadGifForRetiming/);
assert.match(appEvents, /elements\.regenerateGifButton\.addEventListener/);
assert.match(appEvents, /elements\.gifRetimeInput\.addEventListener/);
assert.match(appEvents, /elements\.retimeGifButton\.addEventListener/);
assert.match(appCore, /gifFrameDelay/);
assert.match(appCore, /estimateApng/);
assert.match(appCore, /estimateWebp/);
assert.match(gifRetimer, /inspectGif/);
assert.match(gifRetimer, /retimeGif/);
assert.match(gifRetimer, /delayOffset/);
assert.match(apngEncoder, /acTL/);
assert.match(apngEncoder, /fdAT/);
assert.match(apngEncoder, /CRCが不正/);
assert.match(webpEncoder, /ANIM/);
assert.match(webpEncoder, /ANMF/);
assert.match(webpEncoder, /VP8X/);
assert.match(motionModel, /case 'sway':[\s\S]*pivotY = 0\.96/);
assert.match(motionModel, /case 'breathe':[\s\S]*scaleY = 1 \+ riseAndReturn/);
assert.match(motionModel, /case 'pendulum':[\s\S]*pivotY = 0\.04/);
assert.match(motionModel, /case 'squash':[\s\S]*pivotY = 0\.92/);

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
