# image-motion-tool

1枚の画像に動きを付け、GIF、APNG、アニメーションWebP、PNG、JPEG、WebPとして保存する静的Webツールです。画像の読み込み、加工、保存はブラウザ内で行い、画像を外部へ送信しません。

公開URL

https://abcderp2.github.io/image-motion-tool/

現在の公開版は画面下部にBuild 22と表示されます。

## 利用条件

- 無料、登録不要、追加課金なし
- 外部API、CDN、広告、アクセス解析なし
- PNG、JPEG、WebPの入力に対応
- GIF、APNG、アニメーションWebP、PNG、JPEG、WebPの保存に対応
- 280px程度の狭い画面、スマートフォン、タブレット、PCに対応
- 外部パッケージ、ビルドツール、パッケージ管理なし
- Node.js標準機能とGitHub Actionsだけで検査可能

端末、OS、ブラウザ、写真アプリ、ファイルアプリの組み合わせによって、利用できる保存形式やアニメーションの再生結果は異なります。特にAPNGとアニメーションWebPが動かない場合は、ファイル破損とは限らないため、対応ブラウザまたはアプリで確認してください。

## 主な機能

- ふわふわ上下、呼吸、ゆっくり拡大、左右に傾く、振り子、円運動、ジャンプ、弾む伸縮、細かく揺れるの9種類
- 動きの速さ、移動量、回転量、伸縮量、画像サイズ、向き、動作回数の調整
- 1対1、4対5、9対16、16対9の画面比率
- 指ドラッグ、矢印キー、左右反転
- 操作の取り消しとやり直し
- GIFの軽量、標準、高画質
- 生成後のGIFを最後の設定から速度だけ変えて再生成
- 既存GIFのフレーム画像を変えず、表示時間だけを変更
- 設定の自動保存とJSON書き出し
- 別タブで現在の動くプレビューと生成ファイルを確認
- Service Workerによるオフライン起動

画像そのものはlocalStorage、設定JSON、Service Workerのキャッシュへ保存しません。画像を外したときとページを閉じたときは、一時URLを破棄します。

## 基本操作

1. 画像を選びます。
2. 動きの種類と強さを調整します。
3. 画面比率、保存形式、サイズ、長さ、滑らかさを選びます。
4. 保存ボタンを押します。
5. 保存後に別タブで動きと見た目を確認します。

エントリークラスのスマートフォンやタブレットでは、まず360px、3秒、10fpsを使用してください。重い場合は256px、8fpsへ下げます。GIFでは色品質を標準から始め、重い場合だけ軽量へ下げます。

## 保存形式

### GIF

- 長辺256px、360px、480px
- 2秒から5秒
- 8fps、10fps、12fps
- 最大256色
- 透明度は完全透明または不透明
- 無限ループ

GIFは形式上、元画像の色と半透明の輪郭を完全には保持できません。半透明の縁を優先する場合は背景色を指定するか、APNGまたは静止PNGを使用してください。

### APNG

- GIFと同じサイズ、長さ、fps
- フルカラーとアルファ透過
- 無限ループ
- 生成前後にPNGとAPNGの構造、CRC、寸法、フレーム数、順序、表示時間を検査
- 通常端末は総処理1400万画素、推定出力32MB、推定メモリ64MBまで
- 端末メモリが2GB以下と判定できる場合は上限を引き下げ

APNGを再生できない写真アプリやファイルアプリでは、静止画として表示されます。対応ブラウザの別タブ表示で確認してください。

### アニメーションWebP

- GIFと同じサイズ、長さ、fps
- WebP画質60パーセントから100パーセント
- 初期画質95パーセント
- CanvasのWebP出力を各フレームに使用
- RIFF、WEBP、VP8X、ANIM、ANMF、ALPH、VP8またはVP8Lの構造を検査
- 通常端末は総処理1400万画素、推定出力24MB、推定メモリ64MBまで
- 端末メモリが2GB以下と判定できる場合は上限を引き下げ

Canvasが出力するWebPの内部形式はブラウザ実装に依存します。このツールはVP8とVP8Lの両方を検査します。端末やブラウザによって生成または再生できない場合は、GIFまたはAPNGを使用してください。

### 静止画像

- 長辺480px、720px、1080px、1440px
- PNG、JPEG、WebP
- JPEGとWebPは画質60パーセントから100パーセント
- 合計400万画素まで

## 入力と安全性

入力前に次を確認します。

- 15MB以下
- PNG、JPEG、WebPの実ヘッダー
- ヘッダー内の寸法
- 端末メモリに応じた合計画素数
- 画像展開後の寸法とヘッダー寸法の一致

SVG、HTML、不明な形式は読み込みません。保存画像はCanvasから新しく生成するため、元画像の位置情報や撮影情報などのメタデータは引き継ぎません。

セキュリティ上の詳細と連絡方法はSECURITY.mdを確認してください。

## 画面と端末対応

表示は280px、320px、360px、768px、1024px、1440pxを基準に確認します。900px以下では1列表示になり、560px以下では操作ボタンと設定項目を縦に並べます。タッチ対象は原則44px以上です。

画面拡大、スマートフォン横向き、タブレット縦向きでも主要操作へ到達できる状態を維持します。別タブプレビューは画面中央へ配置し、Canvasまたは生成した画像を画面内へ収めます。

## オフライン利用

公開版を1度正常に開くと、固定したアプリファイルをService Workerへ保存します。利用者の画像や生成物はキャッシュしません。

クエリ文字列付きの公開URLも、同じページとしてオフライン復帰します。古いキャッシュの削除対象はimage-motion-tool専用の名前に限定し、同一オリジン上の他サイトのキャッシュへ干渉しません。

## 更新が反映されない場合

1. 画面下部がBuild 22であることを確認します。
2. ページを再読み込みします。
3. ホーム画面へ追加した版は、いったん終了して開き直します。
4. 改善しない場合は、通常のブラウザタブで公開URLを開きます。

## 保守方針

保守は追加課金のあるサービスや専用ビルド環境を前提にしません。一般的なコード支援AIを使う場合も、変更結果をそのまま採用せず、差分、構文検査、自動テスト、公開後検査を通します。

変更は次の単位を守ります。

- 1つの目的につき1つのブランチとPull Request
- mainを直接編集しない
- 実装変更には同じ不具合を検出するテストを追加
- 表示文言は実装より強く断定しない
- 外部依存を追加しない
- 端末上限を緩める変更は別Pull Request
- CI成功前にマージしない
- 問題があればPull Requestのrevertで直前へ戻す

詳しい変更、確認、公開、切り戻し手順はMAINTENANCE.mdにまとめています。

## 検査

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

GitHub ActionsではPull Requestとmain更新時に同じ検査を実行します。公開後はLive site checkが公開HTMLから同一オリジンの実行ファイル参照を確認し、公開中の主要テストを再実行します。

## ファイル構成

- index.html 画面、Build番号、ブラウザ向けセキュリティ方針
- app.css レスポンシブ表示とアクセシビリティ
- app-core.js 設定、入力、処理量の検査
- motion-model.js 動きの計算
- app.js 画面状態、履歴、描画、別タブ表示
- app-image.js 画像検査と静止画像保存
- app-export.js GIF、APNG、アニメーションWebP、GIF速度変更
- app-events.js 操作イベントとService Worker登録
- gif-encoder.js、gif-worker.js GIF生成
- gif-retimer.js GIF表示時間の変更
- apng-encoder.js APNG生成と検査
- webp-encoder.js アニメーションWebP生成と検査
- sw.js 固定ファイルのオフラインキャッシュ
- scripts 自動テストと静的検査
- SECURITY.md セキュリティ方針
- MAINTENANCE.md 保守、公開、切り戻し手順

## ライセンス

MIT Licenseです。詳細はLICENSEを確認してください。
