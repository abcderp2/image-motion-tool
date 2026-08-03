import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

const requiredFiles = [
  'index.html', 'app.css', 'app-core.js', 'motion-model.js', 'gif-retimer.js', 'apng-encoder.js', 'webp-encoder.js', 'app.js', 'app-image.js', 'app-export.js', 'app-events.js', 'gif-encoder.js', 'gif-worker.js',
  'sw.js', 'preview-page.js', 'preview-page.css', 'manifest.webmanifest', 'icon.svg', 'robots.txt', 'ai.txt', 'sitemap.xml', 'README.md', 'SECURITY.md', 'MAINTENANCE.md',
  'scripts/test_app_core.mjs', 'scripts/test_motion_model.mjs', 'scripts/test_gif_encoder.mjs', 'scripts/test_gif_retimer.mjs', 'scripts/test_apng_encoder.mjs', 'scripts/test_webp_encoder.mjs', 'scripts/test_gif_disposal.mjs', 'scripts/test_gif_dominant_color.mjs',
  '.github/workflows/pages.yml',
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
const previewPage = await readFile(new URL('preview-page.js', root), 'utf8');
const previewPageCss = await readFile(new URL('preview-page.css', root), 'utf8');
const app = [motionModel, gifRetimer, apngEncoder, webpEncoder, appMain, appImage, appExport, appEvents].join('\n');
const encoder = await readFile(new URL('gif-encoder.js', root), 'utf8');
const worker = await readFile(new URL('gif-worker.js', root), 'utf8');
const sw = await readFile(new URL('sw.js', root), 'utf8');
const robots = await readFile(new URL('robots.txt', root), 'utf8');
const ai = await readFile(new URL('ai.txt', root), 'utf8');
const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
const pagesWorkflow = await readFile(new URL('.github/workflows/pages.yml', root), 'utf8');

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

assert.match(index, /application-version" content="20"/);
assert.match(index, /Build 20/);
assert.match(index, /app-core\.js\?v=6/);
assert.match(index, /motion-model\.js\?v=7/);
assert.match(index, /gif-retimer\.js\?v=1/);
assert.match(index, /apng-encoder\.js\?v=2/);
assert.match(index, /webp-encoder\.js\?v=2/);
assert.match(index, /app\.js\?v=17/);
assert.match(index, /gif-encoder\.js\?v=5/);
assert.match(index, /app-image\.js\?v=5/);
assert.match(index, /app-export\.js\?v=11/);
assert.match(index, /app-events\.js\?v=17/);
assert.match(appExport, /gif-worker\.js\?v=5/);
assert.match(appExport, /ImageMotionApng/);
assert.match(appExport, /APNGの出力検査に失敗しました/);
assert.match(appExport, /ImageMotionWebp/);
assert.match(appEvents, /sw\.js\?v=20/);
assert.match(appEvents, /updateViaCache: 'none'/);
assert.match(worker, /gif-encoder\.js\?v=5/);
assert.match(sw, /image-motion-tool-v20/);
assert.match(pagesWorkflow, /persist-credentials: false/);
assert.match(pagesWorkflow, /actions\/setup-node@v5/);
assert.match(pagesWorkflow, /node-version: 24/);
assert.match(pagesWorkflow, /node --check app-core\.js/);
assert.match(pagesWorkflow, /node scripts\/check_static\.mjs/);
assert.match(pagesWorkflow, /permissions:\s+contents: read/);
assert.match(encoder, /transparent \? 0x09 : 0x04/);
assert.match(encoder, /colors\.length - 1/);
assert.match(encoder, /palette box must contain colors/);
assert.doesNotMatch(appExport, /dither: 'error-diffusion'/);
assert.match(index, /app\.css\?v=6/);
for (const asset of ['app.css?v=6', 'app-core.js?v=6', 'motion-model.js?v=7', 'gif-retimer.js?v=1', 'apng-encoder.js?v=2', 'webp-encoder.js?v=2', 'app.js?v=17', 'app-image.js?v=5', 'app-export.js?v=11', 'app-events.js?v=17', 'preview-page.js?v=2', 'preview-page.css?v=1', 'gif-encoder.js?v=5', 'gif-worker.js?v=5']) {
  assert.ok(sw.includes(`'./${asset}'`), `sw.js is missing ${asset}`);
}

const presetControl = index.match(/<div class="control control-wide preset-control">[\s\S]*?id="presetHelp"[\s\S]*?<\/div>/)?.[0] || '';
assert.doesNotMatch(index, /id="presetButton"/);
assert.match(index, /id="presetList"/);
assert.match(presetControl, /一覧から好きな動きを1回押すと/);
assert.match(index, /id="openPreviewButton"/);
assert.match(index, /プレビューを別タブで開く/);
assert.doesNotMatch(index, /<select id="preset">/);
assert.doesNotMatch(index, /プレビュー速度/);

const presetLabels = ['ふわふわ上下', '呼吸', 'ゆっくり拡大', '左右に傾く', '振り子', '円運動', 'ジャンプ', '弾む伸縮', '細かく揺れる'];
const presetValues = ['float', 'breathe', 'zoom', 'sway', 'pendulum', 'orbit', 'bounce', 'squash', 'shake'];
const presetList = index.match(/<ol id="presetList"[\s\S]*?<\/ol>/)?.[0] || '';
let previousPresetListPosition = -1;
for (let index = 0; index < presetLabels.length; index += 1) {
  const item = `data-preset-value="${presetValues[index]}"`;
  const position = presetList.indexOf(item);
  assert.ok(position > previousPresetListPosition, `visible preset order is incorrect for ${presetLabels[index]}`);
  assert.match(presetList.slice(position), new RegExp(`>${presetLabels[index]}<\\/button>`));
  previousPresetListPosition = position;
}
assert.match(presetList, /data-current="true"/);
assert.match(presetList, /aria-pressed="true"/);
let previousPresetPosition = -1;
for (const label of presetLabels) {
  const position = appMain.indexOf(`label: '${label}'`);
  assert.ok(position > previousPresetPosition, `preset order is incorrect for ${label}`);
  previousPresetPosition = position;
}
assert.match(index, /動きの速さ/);
assert.match(index, /アニメーション内の動作回数/);
assert.match(index, /動きの速さはプレビューとアニメーションの再生速度に反映/);
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
assert.doesNotMatch(appMain, /presetButton/);
assert.match(appMain, /presetList: document\.querySelector\('#presetList'\)/);
assert.match(appMain, /const presetItems = \[\.\.\.elements\.presetList\.querySelectorAll/);
assert.match(appMain, /function updatePresetUi\(\)/);
assert.match(appMain, /item\.setAttribute\('aria-pressed', String\(isCurrent\)\)/);
assert.match(appMain, /createCenteredPreviewUrls/);
assert.match(appMain, /function createLivePreviewUrl\(sourceUrl\)/);
assert.match(appMain, /preview-page\.js\?v=2/);
assert.match(appMain, /preview-page\.css\?v=1/);
assert.match(appMain, /data-source="\$\{safeSourceUrl\}"/);
assert.match(appMain, /data-settings="\$\{safeSerializedSettings\}"/);
assert.match(appMain, /previewUrl: pageObjectUrl/);
assert.doesNotMatch(appMain, /URLSearchParams\(|pageObjectUrl\?\$\{query/);
assert.doesNotMatch(appMain, /createAnimatedPreviewBlob|gifApi\.encodeIndexedFrames/);
assert.match(appMain, /openCurrentPreviewInNewTab/);
assert.doesNotMatch(appMain, /style-src 'unsafe-inline'/);
assert.match(appMain, /style-src 'self'/);
assert.match(previewPageCss, /position: fixed/);
assert.match(previewPageCss, /display: flex/);
assert.match(previewPageCss, /align-items: center/);
assert.match(previewPageCss, /justify-content: center/);
assert.match(previewPageCss, /margin: 0/);
assert.match(previewPageCss, /height: 100svh/);
assert.match(appMain, /script-src 'self'/);
assert.match(appMain, /URL\.revokeObjectURL\(currentPreviewObjectUrl\)/);
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
assert.match(appEvents, /for \(const item of presetItems\)/);
assert.match(appEvents, /PRESET_OPTIONS\.find/);
assert.match(appEvents, /elements\.openPreviewButton\.addEventListener/);
assert.match(appEvents, /elements\.gifRetimeInput\.addEventListener/);
assert.match(appEvents, /elements\.retimeGifButton\.addEventListener/);
assert.match(appImage, /openPreviewButton/);
assert.match(appImage, /setPlaying\(true\)/);
assert.match(appImage, /\.\.\.presetItems/);
assert.doesNotMatch(previewPage, /\.innerHTML\s*=|eval\s*\(|new Function\s*\(/);
assert.match(previewPage, /canvas\.dataset\.source/);
assert.match(previewPage, /canvas\.dataset\.settings/);
assert.doesNotMatch(previewPage, /window\.location\.search|new URLSearchParams/);
assert.match(previewPage, /sourceUrl\.startsWith\('blob:'\)/);
assert.match(previewPage, /core\.sanitizeSettings/);
assert.match(previewPage, /motionModel\.motionAt/);
assert.match(previewPage, /requestAnimationFrame/);
assert.match(previewPage, /positionScale/);
assert.match(appCore, /gifFrameDelay/);
assert.match(appCore, /estimateApng/);
assert.match(appCore, /estimateWebp/);
assert.match(gifRetimer, /inspectGif/);
assert.match(gifRetimer, /retimeGif/);
assert.match(gifRetimer, /delayOffset/);
assert.match(apngEncoder, /acTL/);
assert.match(apngEncoder, /fdAT/);
assert.match(apngEncoder, /inspectApng/);
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
