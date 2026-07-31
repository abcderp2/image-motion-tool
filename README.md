# image-motion-tool

画像を端末内だけで処理し、上下移動、ジャンプ、揺れ、傾き、円運動、呼吸、拡大、振り子の動きを付ける静的Webツールです。GIF、PNG、JPEG、WebPとして保存できます。

公開URL

https://abcderp2.github.io/image-motion-tool/

## 主な特徴

- 完全無料、登録不要、追加課金なし
- PNG、JPEG、WebPを端末内だけで処理
- 外部API、CDN、広告、アクセス解析なし
- GIFは軽量、標準、高画質の3段階
- 全フレームから代表色を作る適応型GIFパレット
- 1対1、4対5、9対16、16対9の画面比率
- GIFは先頭と末尾がつながる周期で保存
- 静止画像は最大1440px
- 指ドラッグ、キーボード操作、左右反転
- 操作の取り消しとやり直し
- 設定の自動保存とJSON書き出し
- Service Workerによるオフライン起動
- 280px程度の狭い画面からデスクトップまで対応
- 外部パッケージ、ビルドツール、パッケージ管理なし

画像そのものはlocalStorage、設定JSON、Service Workerのキャッシュへ保存しません。画像を外すボタンを押すと、ブラウザ内の画像参照も解放します。

## 画像の安全確認

画像を展開する前に、次の確認を行います。

- ファイル容量が15MB以下
- PNG、JPEG、WebPの実ヘッダー
- ヘッダー内の縦横サイズ
- 端末メモリに応じた合計画素数
- 画像展開後の寸法とヘッダー寸法の一致

SVG、HTML、不明な形式は読み込みません。保存画像はCanvasから新しく生成するため、元画像の位置情報や撮影情報などのメタデータを引き継ぎません。

## 出力上限

### GIF

- 長辺256px、360px、480px
- 2秒から5秒
- 8fps、10fps、12fps
- 総描画量1400万画素以下
- 軽量は固定パレット
- 標準は適応型パレット
- 高画質は適応型パレットと規則的な色補間

### 静止画像

- 長辺480px、720px、1080px、1440px
- PNG、JPEG、WebP
- JPEGとWebPは画質60パーセントから100パーセント
- 合計400万画素以下

## 軽い端末での推奨設定

最初は360px、3秒、10fps、色品質は標準で試します。動作が重い場合は256px、8fps、色品質は軽量へ下げます。

低メモリ端末では入力画像の合計画素数を自動的に下げます。ブラウザが端末メモリ情報を提供しない場合は、保守的な上限を使用します。

## 更新が反映されない場合

公開版を開いたまま更新された場合、古いService Workerが一時的に残ることがあります。ページを閉じて開き直し、もう一度再読み込みしてください。ホーム画面へ追加した版も、いったん終了してから開き直します。

設定値は同じブラウザ内に残ります。画像そのものは保存されないため、必要な画像はもう一度選択します。

## ローカル利用

GitHubのCodeからDownload ZIPを選び、展開後のindex.htmlをブラウザで開きます。

Androidでは一般的なブラウザで利用できます。iPhoneまたはiPadでローカルHTMLが動かない場合は、公開版をSafariで開き、共有メニューからホーム画面へ追加してください。

ローカルサーバーを利用できる場合は、リポジトリ直下で次を実行します。

```bash
python3 -m http.server 8000
```

その後、http://localhost:8000/ を開きます。

## ファイル構成

- index.html 画面とブラウザ向けセキュリティ設定
- app.css レスポンシブ表示とアクセシビリティ
- app-core.js 設定検査、画像ヘッダー検査、処理量計算
- app.js 設定、履歴、描画の基礎処理
- app-image.js 画像検査と読込処理
- app-export.js 静止画とGIFの保存処理
- app-events.js 画面操作と初期化
- gif-encoder.js 適応型パレット、色変換、GIF89aエンコーダー
- gif-worker.js GIF圧縮を画面処理から分離
- manifest.webmanifest ホーム画面追加用情報
- sw.js 許可したアプリファイルだけをキャッシュ
- scripts テストと静的検査
- SECURITY.md セキュリティ方針
- MAINTENANCE.md 更新、確認、切り戻し手順

## 検査

Node.jsだけで実行できます。追加パッケージは不要です。

```bash
node --check app-core.js
node --check app.js
node --check app-image.js
node --check app-export.js
node --check app-events.js
node --check gif-encoder.js
node --check gif-worker.js
node --check sw.js
node scripts/test_app_core.mjs
node scripts/test_gif_encoder.mjs
node scripts/check_static.mjs
```

GIFのテストはヘッダーだけを確認しません。通常サイズの高エントロピーフレームを圧縮後にLZW復号し、全画素の色番号が元フレームと一致することを確認します。これにより、9ビットから12ビットへの切り替えや4096項目の辞書初期化で生じる破損を検出します。

GitHub Actionsでは同じ検査をPull Requestとmain更新時に実行します。公開サイトは毎回のデプロイ後と毎週確認し、公開中のGIFエンコーダーを取得して同じ復号テストを実行します。

## 変更時の基本ルール

- 外部API、CDN、解析タグを追加しない
- eval、new Function、innerHTMLによる文字列挿入を使わない
- 新しい入力形式を増やす前に実ヘッダー検査を追加する
- 出力解像度やフレーム数を増やす前に処理量上限を見直す
- GIF圧縮を変更した場合は、生成ファイルを実際に復号する回帰テストを追加する
- app.js群の画面依存処理とapp-core.jsの検査処理を混ぜない
- キャッシュ対象を増やす場合はsw.jsの許可一覧へ明示する
- 変更後はMAINTENANCE.mdの手順で確認する

## ライセンス

MIT Licenseです。詳細はLICENSEを確認してください。
