# image-motion-tool

画像を端末内だけで処理し、上下移動、ジャンプ、揺れ、傾き、円運動、呼吸風の動きを付けたGIFまたはPNGを作成する静的Webツールです。

公開URL

https://abcderp2.github.io/image-motion-tool/

## 特徴

- 完全無料、登録不要、追加課金なし
- PNG、JPEG、WebPを端末内だけで処理
- 外部API、CDN、外部ライブラリ、広告、アクセス解析なし
- GIFと現在フレームのPNGを保存
- 透明、白、黒、グリーンバック、任意色の背景
- 指ドラッグ、キーボード操作、左右反転
- 設定の自動保存とJSON書き出し
- Service Workerによるオフライン起動
- 320px程度の狭い画面とエントリー端末を想定

画像そのものはlocalStorage、設定JSON、Service Workerのキャッシュへ保存しません。

## ローカル利用

GitHubのCodeからDownload ZIPを選び、展開後の`index.html`をブラウザで開きます。

Androidでは一般的なブラウザで利用できます。iPhoneまたはiPadでローカルHTMLが動かない場合は、公開版をSafariで開き、共有メニューからホーム画面へ追加してください。

ローカルサーバーを利用できる場合は、リポジトリ直下で次を実行します。

```bash
python3 -m http.server 8000
```

その後、`http://localhost:8000/`を開きます。

## 安全上の上限

- 入力形式はPNG、JPEG、WebPのみ
- 入力容量は15MB以下
- 縦横8192px以下、合計3200万画素以下
- GIFは256、360、480px
- 長さは2秒から5秒
- 8、10、12fps
- 総描画量は1400万画素以下

## ファイル構成

- `index.html` 画面とセキュリティポリシー
- `app.css` レスポンシブ表示
- `app.js` 入力検査、プレビュー、PNGとGIF保存
- `gif-encoder.js` GIF89aエンコーダー
- `gif-worker.js` GIF圧縮を画面処理から分離
- `manifest.webmanifest` ホーム画面追加用情報
- `sw.js` 同一オリジンのアプリファイルだけをキャッシュ
- `scripts/test_gif_encoder.mjs` GIF生成と復号のテスト

## 検査

```bash
node --check app.js
node --check gif-encoder.js
node --check gif-worker.js
node --check sw.js
node scripts/test_gif_encoder.mjs
```

外部パッケージ、ビルドツール、パッケージ管理は使用しません。
