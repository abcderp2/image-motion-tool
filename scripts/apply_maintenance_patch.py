from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:80]!r}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_all(path: str, old: str, new: str, minimum: int = 1) -> None:
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f'{path}: expected at least {minimum} matches, found {count}: {old!r}')
    file.write_text(text.replace(old, new), encoding='utf-8')


replace_once('app-export.js',
    "setStatus(`アニメーションWebPを保存しました。${roundedDelayMessage(settings, estimate.frameDelay)}Canvas標準のWebP非可逆圧縮を使用しています。`);",
    "setStatus(`アニメーションWebPを保存しました。${roundedDelayMessage(settings, estimate.frameDelay)}CanvasのWebP出力を使用しています。端末や表示アプリによって再生できない場合は、GIFまたはAPNGを使用してください。`);",
)
replace_once('app-export.js',
    "setStatus('GIFを保存しました。別タブで元のGIFを開き、拡大して確認できます。');",
    "setStatus('GIFを保存しました。別タブで保存したGIFを開き、拡大して確認できます。');",
)

replace_once('app.js',
    "? '生成したAPNGそのものを別タブで表示します。APNGのアニメーション表示はブラウザにより異なるため、表示できない場合も保存ファイルは利用できます。一時URLは次の生成時またはページを閉じた時に破棄します。'",
    "? '生成したAPNGそのものを別タブで表示します。別タブで動かない場合もファイル破損とは限りません。APNG対応ブラウザまたはアプリで確認してください。一時URLは次の生成時またはページを閉じた時に破棄します。'",
)
replace_once('app.js',
    "? '生成したアニメーションWebPそのものを別タブで表示します。ブラウザの対応状況により表示できない場合も保存ファイルは利用できます。一時URLは次の生成時またはページを閉じた時に破棄します。'",
    "? '生成したアニメーションWebPそのものを別タブで表示します。別タブで動かない場合もファイル破損とは限りません。アニメーションWebP対応ブラウザまたはアプリで確認してください。一時URLは次の生成時またはページを閉じた時に破棄します。'",
)

replace_once('index.html', 'application-version" content="21"', 'application-version" content="22"')
replace_once('index.html', 'app.js?v=17', 'app.js?v=18')
replace_once('index.html', 'app-export.js?v=12', 'app-export.js?v=13')
replace_once('index.html', 'app-events.js?v=18', 'app-events.js?v=19')
replace_once('index.html',
    'アニメーションWebPはCanvas標準の非可逆WebPを指定画質で使います。端末、OS、ブラウザの組み合わせによっては、アニメーションWebPを正常に生成または再生できない場合があります。その場合はGIFまたはAPNGを選んでください。',
    'アニメーションWebPはCanvasのWebP出力を指定画質で使います。内部の圧縮方式や生成可否はブラウザ実装に依存します。端末、OS、ブラウザ、表示アプリの組み合わせによって正常に生成または再生できない場合は、GIFまたはAPNGを選んでください。',
)
replace_once('index.html',
    'APNGを選んだ場合、対応ブラウザでは動きますが、端末の写真アプリやファイルアプリがAPNGの再生に対応していないと、ダウンロード後も静止画として表示されます。これはファイルの破損ではなく、表示側の仕様です。写真アプリでの再生を優先する場合は、使用するアプリが対応する形式を選んでください。',
    'APNGを選んだ場合、対応ブラウザでは動きますが、写真アプリやファイルアプリが再生に対応していないと静止画として表示されます。動かない場合もファイル破損とは限らないため、APNG対応ブラウザまたはアプリで確認してください。',
)
replace_once('index.html',
    '生成したファイルそのものを別タブで表示します。APNGを保存しても、端末やアプリがAPNGの再生に対応していない場合は、ダウンロード後も静止画として表示されます。対応ブラウザで動きを確認し、写真アプリで再生する場合は、そのアプリが対応する形式を選んでください。一時URLは次の生成時またはページを閉じたときに破棄します。',
    '生成したファイルそのものを別タブで表示します。動かない場合もファイル破損とは限りません。対応ブラウザまたはアプリで確認してください。一時URLは次の生成時またはページを閉じたときに破棄します。',
)
replace_once('index.html',
    'まずは360px、3秒、10fps、色品質は標準から試してください。',
    'まずは360px、3秒、10fpsから試してください。GIFでは色品質を標準にします。',
)
replace_once('index.html', '画像モーションツール Build 21', '画像モーションツール Build 22')

# Keep the published check readable, but move every stale Build 12 reference to Build 22.
live = '.github/workflows/live-site-check.yml'
for old, new in (
    ('Build 12', 'Build 22'),
    ('app.css?v=3', 'app.css?v=6'),
    ('apng-encoder.js?v=1', 'apng-encoder.js?v=2'),
    ('app.js?v=10', 'app.js?v=18'),
    ('app-export.js?v=10', 'app-export.js?v=13'),
    ('app-events.js?v=10', 'app-events.js?v=19'),
    ('sw.js?v=12', 'sw.js?v=22'),
    ('image-motion-tool-v12', 'image-motion-tool-v22'),
    ('image-motion-tool-live-check/12.0', 'image-motion-tool-live-check/22.0'),
):
    replace_all(live, old, new)
replace_once(live,
    '              (base + "sw.js?v=22", ("ALLOWED_URLS", "NAVIGATION_URLS", "app.css?v=6", "app-core.js?v=6", "motion-model.js?v=7", "gif-retimer.js?v=1", "apng-encoder.js?v=2", "webp-encoder.js?v=2", "app.js?v=18", "app-image.js?v=5", "image-motion-tool-v22")),',
    '              (base + "sw.js?v=22", ("CACHE_PREFIX", "ALLOWED_URLS", "NAVIGATION_URLS", "normalizedNavigationUrl", "image-motion-tool-v22")),\n              (base + "scripts/test_service_worker.mjs?v=1", ("service worker isolation tests passed", "another-tool-v4", "build=22-check")),',
)
replace_once(live,
    '              base + "scripts/test_gif_dominant_color.mjs?v=5": output_dir / "scripts" / "test_gif_dominant_color.mjs",',
    '              base + "scripts/test_gif_dominant_color.mjs?v=5": output_dir / "scripts" / "test_gif_dominant_color.mjs",\n              base + "sw.js?v=22": output_dir / "sw.js",\n              base + "scripts/test_service_worker.mjs?v=1": output_dir / "scripts" / "test_service_worker.mjs",',
)
replace_once(live,
    '          node --max-old-space-size=64 "${LIVE_TEST_DIR}/scripts/test_gif_dominant_color.mjs"',
    '          node --max-old-space-size=64 "${LIVE_TEST_DIR}/scripts/test_gif_dominant_color.mjs"\n          node "${LIVE_TEST_DIR}/scripts/test_service_worker.mjs"',
)

static = 'scripts/check_static.mjs'
replace_once(static,
    "  'scripts/test_app_core.mjs', 'scripts/test_motion_model.mjs', 'scripts/test_gif_encoder.mjs', 'scripts/test_gif_retimer.mjs', 'scripts/test_apng_encoder.mjs', 'scripts/test_webp_encoder.mjs', 'scripts/test_gif_disposal.mjs', 'scripts/test_gif_dominant_color.mjs',",
    "  'scripts/test_app_core.mjs', 'scripts/test_motion_model.mjs', 'scripts/test_gif_encoder.mjs', 'scripts/test_gif_retimer.mjs', 'scripts/test_apng_encoder.mjs', 'scripts/test_webp_encoder.mjs', 'scripts/test_gif_disposal.mjs', 'scripts/test_gif_dominant_color.mjs', 'scripts/test_service_worker.mjs',",
)
replace_once(static,
    "  '.github/workflows/pages.yml',",
    "  '.github/workflows/pages.yml', '.github/workflows/live-site-check.yml',",
)
replace_once(static,
    "const pagesWorkflow = await readFile(new URL('.github/workflows/pages.yml', root), 'utf8');",
    "const pagesWorkflow = await readFile(new URL('.github/workflows/pages.yml', root), 'utf8');\nconst liveWorkflow = await readFile(new URL('.github/workflows/live-site-check.yml', root), 'utf8');",
)
for old, new in (
    ('application-version\\" content=\\"21\\"', 'application-version\\" content=\\"22\\"'),
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
    replace_all(static, old, new)
replace_once(static,
    "assert.match(sw, /NAVIGATION_URLS/);",
    "assert.match(sw, /NAVIGATION_URLS/);\nassert.match(sw, /CACHE_PREFIX/);\nassert.match(sw, /key\\.startsWith\\(CACHE_PREFIX\\)/);\nassert.match(sw, /normalizedNavigationUrl/);",
)
replace_once(static,
    "assert.match(pagesWorkflow, /node scripts\\/check_static\\.mjs/);",
    "assert.match(pagesWorkflow, /node scripts\\/test_service_worker\\.mjs/);\nassert.match(pagesWorkflow, /node scripts\\/check_static\\.mjs/);",
)
replace_once(static,
    "assert.match(index, /id=\"apngCompatibilityHelp\"/);",
    "assert.match(index, /id=\"apngCompatibilityHelp\"/);\nassert.match(index, /CanvasのWebP出力/);\nassert.match(index, /ファイル破損とは限りません/);\nassert.doesNotMatch(index, /Canvas標準の非可逆WebP/);\nassert.match(appMain, /ファイル破損とは限りません/);\nassert.doesNotMatch(appMain, /表示できない場合も保存ファイルは利用できます/);\nassert.match(appExport, /CanvasのWebP出力を使用しています/);\nassert.match(appExport, /別タブで保存したGIFを開き/);\nassert.doesNotMatch(appExport, /Canvas標準のWebP非可逆圧縮/);\nassert.match(liveWorkflow, /Build 22/);\nassert.match(liveWorkflow, /test_service_worker\\.mjs/);\nassert.doesNotMatch(liveWorkflow, /Build 12|app\\.js\\?v=10|sw\\.js\\?v=12/);",
)

# The temporary patch mechanism must not remain in the final branch.
Path('.github/workflows/apply-maintenance-patch.yml').unlink(missing_ok=True)
Path('scripts/apply_maintenance_patch.py').unlink(missing_ok=True)
