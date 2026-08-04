from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:100]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_all(path: str, old: str, new: str, minimum: int = 1) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f'{path}: expected at least {minimum} matches, found {count}: {old!r}')
    file.write_text(text.replace(old, new), encoding='utf-8')


replace_once('index.html', 'application-version" content="21"', 'application-version" content="22"')
replace_once('index.html', 'app.js?v=17', 'app.js?v=18')
replace_once('index.html', 'app-export.js?v=12', 'app-export.js?v=13')
replace_once('index.html', 'app-events.js?v=18', 'app-events.js?v=19')
replace_once(
    'index.html',
    '動きの速さを上げると、アニメーションの再生時間は短くなります。GIFの高画質では色を細かく分析し、細かな粒状の補正は使いません。APNGはフルカラーと透過を保ちます。アニメーションWebPはCanvas標準の非可逆WebPを指定画質で使います。端末、OS、ブラウザの組み合わせによっては、アニメーションWebPを正常に生成または再生できない場合があります。その場合はGIFまたはAPNGを選んでください。性能が控えめな端末では、小さいサイズ、短い長さ、低いfpsから試してください。',
    '動きの速さを上げると、アニメーションの再生時間は短くなります。GIFの高画質では色を細かく分析し、細かな粒状の補正は使いません。APNGはフルカラーと透過を保ちます。アニメーションWebPはCanvasのWebP出力を指定画質で使います。端末、OS、ブラウザ、表示アプリの組み合わせによっては正常に生成または再生できない場合があります。その場合はGIFまたはAPNGを選んでください。性能が控えめな端末では、小さいサイズ、短い長さ、低いfpsから試してください。',
)
replace_once(
    'index.html',
    'APNGを選んだ場合、対応ブラウザでは動きますが、端末の写真アプリやファイルアプリがAPNGの再生に対応していないと、ダウンロード後も静止画として表示されます。これはファイルの破損ではなく、表示側の仕様です。写真アプリでの再生を優先する場合は、使用するアプリが対応する形式を選んでください。',
    'APNGを選んだ場合、対応ブラウザでは動きますが、写真アプリやファイルアプリがAPNG再生に対応していないと静止画として表示されます。動かない場合もファイル破損とは限りません。APNG対応ブラウザまたはアプリで確認してください。',
)
replace_once(
    'index.html',
    '生成したファイルそのものを別タブで表示します。APNGを保存しても、端末やアプリがAPNGの再生に対応していない場合は、ダウンロード後も静止画として表示されます。対応ブラウザで動きを確認し、写真アプリで再生する場合は、そのアプリが対応する形式を選んでください。一時URLは次の生成時またはページを閉じたときに破棄します。',
    '生成したファイルそのものを別タブで表示します。動かない場合もファイル破損とは限りません。保存形式に対応したブラウザまたはアプリで確認してください。一時URLは次の生成時またはページを閉じたときに破棄します。',
)
replace_once('index.html', '画像モーションツール Build 21', '画像モーションツール Build 22')

replace_once(
    'app-export.js',
    'setStatus(`アニメーションWebPを保存しました。${roundedDelayMessage(settings, estimate.frameDelay)}Canvas標準のWebP非可逆圧縮を使用しています。`);',
    'setStatus(`アニメーションWebPを保存しました。${roundedDelayMessage(settings, estimate.frameDelay)}CanvasのWebP出力を使用しています。端末や表示アプリによって再生できない場合はGIFまたはAPNGを使用してください。`);',
)
replace_once(
    'app-export.js',
    "setStatus('GIFを保存しました。別タブで元のGIFを開き、拡大して確認できます。');",
    "setStatus('GIFを保存しました。別タブで保存したGIFを開き、拡大して確認できます。');",
)

replace_once(
    'app.js',
    '生成したAPNGそのものを別タブで表示します。APNGのアニメーション表示はブラウザにより異なるため、表示できない場合も保存ファイルは利用できます。一時URLは次の生成時またはページを閉じた時に破棄します。',
    '生成したAPNGそのものを別タブで表示します。動かない場合もファイル破損とは限りません。APNG対応ブラウザまたはアプリで確認してください。一時URLは次の生成時またはページを閉じた時に破棄します。',
)
replace_once(
    'app.js',
    '生成したアニメーションWebPそのものを別タブで表示します。ブラウザの対応状況により表示できない場合も保存ファイルは利用できます。一時URLは次の生成時またはページを閉じた時に破棄します。',
    '生成したアニメーションWebPそのものを別タブで表示します。動かない場合もファイル破損とは限りません。アニメーションWebP対応ブラウザまたはアプリで確認してください。一時URLは次の生成時またはページを閉じた時に破棄します。',
)

app_events = Path('app-events.js')
app_events_text = app_events.read_text(encoding='utf-8')
start_marker = 'const originalSetStatus = setStatus;\n'
end_marker = 'updateCompatibilityGuidance();\n\n'
start = app_events_text.find(start_marker)
end = app_events_text.find(end_marker)
if start < 0 or end < start:
    raise SystemExit('app-events.js: compatibility wrapper block was not found')
app_events_text = app_events_text[:start] + app_events_text[end + len(end_marker):]
if app_events_text.count("sw.js?v=21") != 1:
    raise SystemExit('app-events.js: expected one sw.js?v=21 reference')
app_events_text = app_events_text.replace("sw.js?v=21", "sw.js?v=22", 1)
app_events.write_text(app_events_text, encoding='utf-8')

replace_once('sw.js', "const CACHE_NAME = 'image-motion-tool-v21';", "const CACHE_NAME = 'image-motion-tool-v22';")
replace_once('sw.js', "'./app.js?v=17'", "'./app.js?v=18'")
replace_once('sw.js', "'./app-export.js?v=12'", "'./app-export.js?v=13'")
replace_once('sw.js', "'./app-events.js?v=18'", "'./app-events.js?v=19'")

replace_all('README.md', 'Build 21', 'Build 22')
replace_once(
    'README.md',
    '- app-events.js 操作イベント、互換性案内、Service Worker登録',
    '- app-events.js 操作イベントとService Worker登録',
)

replace_once('.github/workflows/live-site-check.yml', 'image-motion-tool-live-check/21.1', 'image-motion-tool-live-check/22.0')
replace_once(
    '.github/workflows/live-site-check.yml',
    '              "アニメーションWebP",\n              "生成済みGIFの速度変更",',
    '              "アニメーションWebP",\n              "ファイル破損とは限りません",\n              "生成済みGIFの速度変更",',
)
replace_once(
    '.github/workflows/live-site-check.yml',
    '              "app-events.js": ("normalizeUserMessage", "updateCompatibilityGuidance", "ファイル破損とは限りません"),',
    '              "app.js": ("ファイル破損とは限りません", "生成したアニメーションWebPそのもの"),\n              "app-export.js": ("CanvasのWebP出力を使用しています", "別タブで保存したGIFを開き"),\n              "app-events.js": ("serviceWorker", "sw.js?v=22", "updateViaCache: \'none\'"),',
)

replace_all('scripts/check_static.mjs', "'scripts/test_gif_dominant_color.mjs',", "'scripts/test_gif_dominant_color.mjs', 'scripts/test_service_worker.mjs',")
replace_once(
    'scripts/check_static.mjs',
    "  '.github/workflows/pages.yml',",
    "  '.github/workflows/pages.yml', '.github/workflows/live-site-check.yml',",
)
replace_once(
    'scripts/check_static.mjs',
    "const pagesWorkflow = await readFile(new URL('.github/workflows/pages.yml', root), 'utf8');",
    "const pagesWorkflow = await readFile(new URL('.github/workflows/pages.yml', root), 'utf8');\nconst liveWorkflow = await readFile(new URL('.github/workflows/live-site-check.yml', root), 'utf8');\nconst serviceWorkerTest = await readFile(new URL('scripts/test_service_worker.mjs', root), 'utf8');",
)
for old, new in (
    ('application-version" content="21"', 'application-version" content="22"'),
    ('Build 21', 'Build 22'),
    ('app\\.js\\?v=17', 'app\\.js\\?v=18'),
    ('app-export\\.js\\?v=12', 'app-export\\.js\\?v=13'),
    ('app-events\\.js\\?v=18', 'app-events\\.js\\?v=19'),
    ('sw\\.js\\?v=21', 'sw\\.js\\?v=22'),
    ('image-motion-tool-v21', 'image-motion-tool-v22'),
    ("'app.js?v=17'", "'app.js?v=18'"),
    ("'app-export.js?v=12'", "'app-export.js?v=13'"),
    ("'app-events.js?v=18'", "'app-events.js?v=19'"),
):
    replace_all('scripts/check_static.mjs', old, new)
replace_once(
    'scripts/check_static.mjs',
    "assert.match(pagesWorkflow, /node scripts\\/check_static\\.mjs/);",
    "assert.match(pagesWorkflow, /node scripts\\/test_service_worker\\.mjs/);\nassert.match(pagesWorkflow, /node scripts\\/check_static\\.mjs/);",
)
replace_once(
    'scripts/check_static.mjs',
    "assert.match(index, /id=\"apngCompatibilityHelp\"/);",
    "assert.match(index, /id=\"apngCompatibilityHelp\"/);\nassert.match(index, /アニメーションWebPはCanvasのWebP出力/);\nassert.match(index, /動かない場合もファイル破損とは限りません/);\nassert.doesNotMatch(index, /Canvas標準の非可逆WebP/);\nassert.match(appExport, /CanvasのWebP出力を使用しています/);\nassert.match(appExport, /別タブで保存したGIFを開き/);\nassert.match(appMain, /動かない場合もファイル破損とは限りません/);\nassert.doesNotMatch(appEvents, /normalizeUserMessage|updateCompatibilityGuidance/);\nassert.match(sw, /CACHE_PREFIX/);\nassert.match(sw, /startsWith\\(CACHE_PREFIX\\)/);\nassert.match(sw, /normalizedNavigationUrl/);\nassert.match(serviceWorkerTest, /another-tool-v4/);\nassert.match(serviceWorkerTest, /build=21-check/);\nassert.match(liveWorkflow, /application_version/);\nassert.match(liveWorkflow, /same_site/);\nassert.match(liveWorkflow, /test_service_worker\\.mjs/);\nassert.doesNotMatch(liveWorkflow, /Build 12|app\\.js\\?v=10|sw\\.js\\?v=12/);",
)

final_pages = '''name: Deploy GitHub Pages

on:
  push:
    branches:
      - main
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - name: Check out repository
        uses: actions/checkout@v7
        with:
          persist-credentials: false

      - name: Set up Node.js
        uses: actions/setup-node@v5
        with:
          node-version: 24

      - name: Run automated checks
        run: |
          node --check app-core.js
          node --check motion-model.js
          node --check gif-retimer.js
          node --check apng-encoder.js
          node --check webp-encoder.js
          node --check app.js
          node --check app-image.js
          node --check app-export.js
          node --check app-events.js
          node --check gif-encoder.js
          node --check gif-worker.js
          node --check sw.js
          node scripts/test_app_core.mjs
          node scripts/test_motion_model.mjs
          node --max-old-space-size=64 scripts/test_gif_encoder.mjs
          node scripts/test_gif_retimer.mjs
          node scripts/test_apng_encoder.mjs
          node scripts/test_webp_encoder.mjs
          node scripts/test_gif_disposal.mjs
          node --max-old-space-size=64 scripts/test_gif_dominant_color.mjs
          node scripts/test_service_worker.mjs
          node scripts/check_static.mjs

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v6

      - name: Upload static site
        uses: actions/upload-pages-artifact@v5
        with:
          path: .

  deploy:
    if: github.event_name != 'pull_request'
    needs: build
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v5
'''
Path('.github/workflows/pages.yml').write_text(final_pages, encoding='utf-8')
Path(__file__).unlink()
