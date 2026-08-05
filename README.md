# image-motion-tool

1枚の画像に動きを付け、GIF、APNG、アニメーションWebP、PNG、JPEG、WebPとして保存する静的Webツールです。画像の読み込み、範囲選択、加工、保存はブラウザ内で行い、画像を外部へ送信しません。

公開URL

https://abcderp2.github.io/image-motion-tool/

## 特徴

- 無料、登録不要、追加課金なし
- 外部API、CDN、広告、アクセス解析なし
- PNG、JPEG、WebPの入力に対応
- GIF、APNG、アニメーションWebPの保存に対応
- PNG、JPEG、WebPの静止画像保存に対応
- 画像全体または指で塗った範囲だけを動かせる
- 部分モーションでは元画像を静止したまま残し、選択部分を上へ重ねて動かす
- 280px程度の狭い画面からPCまでレスポンシブ表示
- スマートフォン、タブレット、PCの指、ペン、マウス、キーボード操作に対応
- 設定の自動保存、JSON書き出し、読み込みに対応
- 通常設定と範囲編集の戻す、やり直す操作を用意
- Service Workerによるオフライン再起動に対応
- Node.js標準機能とGitHub Actionsだけで検査可能

端末、OS、ブラウザ、写真アプリ、ファイルアプリの組み合わせにより、APNGやアニメーションWebPを生成または再生できない場合があります。動かない場合もファイル破損とは限りません。対応ブラウザまたはアプリで確認し、必要に応じてGIFを使用してください。

## 基本操作

1. 画像を選びます。
2. 動きの種類、速さ、移動量、回転量、伸縮量、画像サイズを調整します。
3. 必要な場合は「動かす範囲」を「選んだ範囲」へ切り替え、画像上を塗ります。
4. 画面比率、保存形式、サイズ、長さ、fpsを選びます。
5. 保存ボタンを押します。
6. 保存後の別タブ表示で生成物を確認します。

エントリースマートフォンやエントリータブレットでは、まず360px、3秒、10fpsから試してください。処理が重い場合は256px、8fpsへ下げてください。

## 部分モーション

「選んだ範囲」では、元画像を静止状態で描き、その上へ選択範囲だけを動かして重ねます。入力画像は1枚だけで完結し、画像を事前にパーツ分けする必要はありません。

範囲編集では次の操作を使用できます。

- 塗る
- 消す
- ブラシサイズ
- 境界のなじませ方
- 範囲編集だけを戻す、やり直す
- 範囲を全部消す

1枚の完成画像には、動かした部分の背後に隠れている画素が含まれていません。そのため、選択部分を大きく移動すると元画像との二重像が見えます。最初は移動量18px以下、回転量8度以下を目安にしてください。髪先、服、リボン、光、炎、水面、呼吸のような小さな動きに向きます。

選択範囲は画像と同じく端末内だけに置きます。localStorage、設定JSON、Cache Storageには保存しません。画像を変更する、画像を外す、再読み込みする、ページを閉じる操作で破棄します。

別タブの軽量Canvasプレビューは画像全体用です。部分モーションは画面内プレビュー、またはGIF、APNG、アニメーションWebPの生成後に表示される別タブリンクで確認してください。

設計、制約、確認方法、切り戻しはPARTIAL_MOTION.mdにまとめています。

## 保存形式

### GIF

最大256色です。透明度は完全透明または不透明です。互換性を優先する場合に適しています。部分モーションの半透明境界は段差や粒状に見える場合があります。

### APNG

フルカラーとアルファ透過を保持します。部分モーションの柔らかな境界を保ちやすい形式です。写真アプリやファイルアプリがAPNG再生に対応していない場合は静止画として表示されます。

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

SVG、HTML、不明な形式は読み込みません。設定JSONは容量と値の範囲を検査します。部分モーションのマスクは画像寸法をそのまま複製せず、端末メモリに応じた上限へ縮小して保持します。詳細はSECURITY.mdを参照してください。

## 端末対応

表示確認の基準は280px、320px、360px、768px、1024px、1440pxです。スマートフォン横向き、タブレット縦向き、200パーセント拡大、タッチ操作、キーボード操作も確認対象です。

ブラウザやアプリの形式対応はサイト側で強制できません。iPhoneやiPadを含むApple端末でも、OS、ブラウザ、表示アプリの組み合わせによって結果が異なります。

部分モーションでは、端末メモリが2GB以下と判定できる場合に選択マスクの長辺を640pxへ制限します。それ以外でも長辺1024px、合計786432画素を上限とし、巨大画像から巨大な編集用Canvasを作りません。

## オフライン利用

初回にオンラインで正常に開くと、固定ファイルをService Workerへ保存します。利用者の画像、選択範囲、生成物、Blob URLはCache Storageへ保存しません。

Service Workerが削除するのはimage-motion-tool専用の接頭辞を持つ古いキャッシュだけです。同じGitHub Pagesドメイン上にある別サイトのキャッシュは削除しません。クエリ文字列付きの公開URLも、オフライン時は保存済みのindex.htmlへ戻します。

## 保守方針

追加課金のあるサービス、有料API、有料ビルド環境を前提にしません。一般的な無料利用枠のAI支援でも変更範囲を追いやすいように、動きと座標計算はmotion-model.js、選択マスクはpartial-motion-mask.js、重ね描画はpartial-motion-render.js、画面連携はpartial-motion-app.js、通常操作はapp-events.js、保存処理はapp-export.jsへ分けています。

変更時は次を守ります。

- mainを直接編集しない
- 1つの目的につき1つのブランチとPull Request
- 実装変更には同じ不具合を検出するテストを追加
- 自動検査成功前にマージしない
- 問題があればPull Request単位でrevertする
- 外部依存を安易に追加しない
- 上限値を理由なく緩めない
- 選択範囲を永続保存する変更は、プライバシー表示と容量上限を同時に見直す

詳しい確認方法と切り戻し手順はMAINTENANCE.mdとPARTIAL_MOTION.mdにあります。

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
node --check partial-motion-mask.js
node --check partial-motion-render.js
node --check partial-motion-app.js
node --check app-events.js
node --check gif-encoder.js
node --check gif-worker.js
node --check sw.js
node scripts/test_app_core.mjs
node scripts/test_motion_model.mjs
node scripts/test_partial_motion.mjs
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
- motion-model.js 動き、描画位置、部分選択座標、マスク寸法の計算
- app.js 状態、共通描画、別タブ表示
- app-image.js 画像検査、読み込み、静止画像保存
- app-export.js GIF、APNG、アニメーションWebP、GIF速度変更
- partial-motion-mask.js 選択マスク、境界、範囲編集履歴
- partial-motion-render.js 元画像を残す重ね描画と座標変換
- partial-motion-app.js 部分モーションの画面、状態、既存機能との接続
- app-events.js 通常操作イベント、追加スクリプトの同一オリジン読み込み、Service Worker登録
- gif-encoder.js、gif-worker.js GIF生成
- gif-retimer.js GIF表示時間変更
- apng-encoder.js APNG生成と検査
- webp-encoder.js アニメーションWebP生成と検査
- sw.js 固定ファイルのオフラインキャッシュ
- scripts 自動テストと静的検査
- SECURITY.md セキュリティ方針
- MAINTENANCE.md 保守、確認、公開、切り戻し手順
- PARTIAL_MOTION.md 部分モーション固有の設計、確認、制約

## ライセンス

MIT Licenseです。詳細はLICENSEを参照してください。
