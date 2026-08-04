# image-motion-tool

1枚の画像に動きを付け、GIF、APNG、アニメーションWebP、PNG、JPEG、WebPとして保存する静的Webツールです。画像の読み込み、加工、保存はブラウザ内で行い、画像を外部へ送信しません。

公開URL

https://abcderp2.github.io/image-motion-tool/

現在の公開版は画面下部にBuild 21と表示されます。

## 特徴

- 無料、登録不要、追加課金なし
- 外部API、CDN、広告、アクセス解析なし
- PNG、JPEG、WebPの入力に対応
- GIF、APNG、アニメーションWebPの保存に対応
- PNG、JPEG、WebPの静止画像保存に対応
- 280px程度の狭い画面からPCまでレスポンシブ表示
- スマートフォン、タブレット、PCのタッチ、マウス、キーボード操作に対応
- 設定の自動保存、JSON書き出し、読み込みに対応
- 直前の操作を戻す、やり直す、初期値へ戻す操作を用意
- Service Workerによるオフライン再起動に対応
- Node.js標準機能とGitHub Actionsだけで検査可能

端末、OS、ブラウザ、写真アプリ、ファイルアプリの組み合わせにより、APNGやアニメーションWebPを生成または再生できない場合があります。動かない場合もファイル破損とは限りません。対応ブラウザまたはアプリで確認し、必要に応じてGIFを使用してください。

## 基本操作

1. 画像を選びます。
2. 動き、速さ、移動量、回転量、伸縮量、画像サイズを調整します。
3. 画面比率、保存形式、サイズ、長さ、fpsを選びます。
4. 保存ボタンを押します。
5. 保存後の別タブ表示で生成物を確認します。

エントリースマートフォンやエントリータブレットでは、まず360px、3秒、10fpsから試してください。処理が重い場合は256px、8fpsへ下げてください。

## 保存形式

### GIF

最大256色です。透明度は完全透明または不透明です。互換性を優先する場合に適しています。

### APNG

フルカラーとアルファ透過を保持します。写真アプリやファイルアプリがAPNG再生に対応していない場合は静止画として表示されます。

### アニメーションWebP

CanvasのWebP出力を各フレームに使用し、RIFF構造を組み立てます。ブラウザが出力する内部形式は実装に依存するため、可逆または非可逆を一律に断定しません。生成または再生できない環境ではGIFまたはAPNGを使用してください。

### 静止画像

PNG、JPEG、WebPを保存できます。JPEGで透明背景を選んだ場合は白背景になります。保存画像には元画像の位置情報などのメタデータを引き継ぎません。

## 入力と安全性

入力前に次を確認します。

- 15MB以下
- PNG、JPEG、WebPの実ヘッダー
- ヘッダー内の寸法
- 端末メモリに応じた合計画素数
- 展開後寸法とヘッダー寸法の一致

SVG、HTML、不明な形式は読み込みません。設定JSONは容量と値の範囲を検査します。詳細はSECURITY.mdを参照してください。

## 端末対応

表示確認の基準は280px、320px、360px、768px、1024px、1440pxです。スマートフォン横向き、タブレット縦向き、200パーセント拡大、タッチ操作、キーボード操作も確認対象です。

ブラウザやアプリの形式対応はサイト側で強制できません。iPhoneやiPadを含むApple端末でも、OS、ブラウザ、表示アプリの組み合わせによって結果が異なります。

## オフライン利用

初回にオンラインで正常に開くと、固定ファイルをService Workerへ保存します。利用者の画像、生成物、Blob URLはCache Storageへ保存しません。

Service Workerが削除するのはimage-motion-tool専用の接頭辞を持つ古いキャッシュだけです。同じGitHub Pagesドメイン上にある別サイトのキャッシュは削除しません。クエリ文字列付きの公開URLも、オフライン時は保存済みのindex.htmlへ戻します。

## 保守方針

追加課金のあるサービスや有料ビルド環境を前提にしません。一般的なAI支援でも変更範囲を追いやすいように、役割ごとにファイルを分け、自動テスト、公開後検査、切り戻し手順を用意しています。

変更時は次を守ります。

- mainを直接編集しない
- 1つの目的につき1つのブランチとPull Request
- 実装変更には同じ不具合を検出するテストを追加
- 自動検査成功前にマージしない
- 問題があればPull Request単位でrevertする
- 外部依存を安易に追加しない
- 上限値を理由なく緩めない

詳しい確認方法と切り戻し手順はMAINTENANCE.mdにあります。

## ローカル検査

Node.jsだけで実行できます。

```bash
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
```

GitHub ActionsではPull Requestとmain更新時に同じ検査を実行します。公開後はLive site checkが公開HTML、同一オリジン資産、主要テストを確認します。

## ファイル構成

- index.html 画面と基本説明
- app.css レスポンシブ表示とアクセシビリティ
- app-core.js 設定、入力検査、処理量の上限
- motion-model.js 動きの計算
- app.js 状態、描画、別タブ表示
- app-image.js 画像検査、読み込み、静止画像保存
- app-export.js GIF、APNG、アニメーションWebP、GIF速度変更
- app-events.js 操作イベント、互換性案内、Service Worker登録
- gif-encoder.js、gif-worker.js GIF生成
- gif-retimer.js GIF表示時間変更
- apng-encoder.js APNG生成と検査
- webp-encoder.js アニメーションWebP生成と検査
- sw.js 固定ファイルのオフラインキャッシュ
- scripts 自動テストと静的検査
- SECURITY.md セキュリティ方針
- MAINTENANCE.md 保守、確認、公開、切り戻し手順

## ライセンス

MIT Licenseです。詳細はLICENSEを参照してください。
