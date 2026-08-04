# 保守手順

この文書は、専門知識が少ない状態でも変更、確認、公開、切り戻しを同じ順序で行うための手順です。追加課金のある開発サービスや外部パッケージは使いません。

## 迷ったときの原則

1. mainを直接編集しない
2. 1つの目的だけを扱うブランチを作る
3. 変更前のmainのコミットを記録する
4. 実装と同じPull Requestでテストと説明を更新する
5. 自動検査が成功するまでマージしない
6. 問題が出たら修正を重ねず、まず直前のPull Requestをrevertする

AIへ依頼する場合も、複数の無関係な修正を一度に渡しません。変更ファイル、理由、期待する結果、触れてはいけない機能を明記し、生成された差分を確認します。

## 変更前

1. 公開URLを開き、画面下部のBuild番号を記録する
2. mainの最新コミットを記録する
3. GitHub ActionsのDeploy GitHub PagesとLive site checkを確認する
4. 既存の未完了Pull Requestが同じファイルを変更していないか確認する
5. 変更目的を1文で書く
6. 元へ戻す方法を決める
7. 新しいブランチをmainから作る

変更目的が2つ以上ある場合はPull Requestを分けます。説明文の修正とエンコーダー変更、表示調整と入力形式追加などを同じPull Requestへ混ぜません。

## ファイルの役割

- index.html 画面、Build番号、実行ファイル参照、CSP
- app.css レスポンシブ表示、タッチ対象、フォーカス表示
- app-core.js 設定、入力検査、処理量、メモリ上限
- motion-model.js 動き、支点、周期
- app.js 状態、履歴、描画、別タブプレビュー
- app-image.js 画像検査、読込、静止画像保存
- app-export.js GIF、APNG、アニメーションWebP、GIF速度変更
- app-events.js 操作イベント、Service Worker登録
- gif-encoder.js、gif-worker.js GIF生成
- gif-retimer.js GIF構造検査と表示時間変更
- apng-encoder.js APNG生成と構造検査
- webp-encoder.js アニメーションWebP生成と構造検査
- sw.js オフライン用固定ファイル
- scripts 自動テストと静的検査
- .github/workflows/pages.yml 検査と公開
- .github/workflows/live-site-check.yml 公開後検査
- README.md 利用者と保守者向け概要
- SECURITY.md セキュリティ方針

## 変更範囲の判断

文言だけを変える場合は、表示される同じ内容がindex.html、app.js、app-export.js、README.md、SECURITY.md、MAINTENANCE.mdに重複していないか検索します。実装より強い断定を残しません。

実行ファイルを変える場合は次を同じPull Requestで行います。

1. index.htmlの対象ファイルのv番号を上げる
2. sw.jsの同じ参照を上げる
3. app-events.jsでsw.jsのv番号を上げる
4. index.htmlとsw.jsのBuild番号を上げる
5. scripts/check_static.mjsの期待値を更新する
6. README.mdの公開Build番号を更新する

Build番号やv番号だけを先に変更しません。参照先のファイル変更と同じコミット系列で進めます。

## セキュリティ確認

変更時は次を維持します。

- 外部API、CDN、広告、アクセス解析を追加しない
- eval、new Function、innerHTMLによる文字列挿入を使わない
- 外部入力は許可形式、容量、寸法、構造を処理前に検査する
- 設定JSONは許可したキーと範囲だけを取り込む
- Blob URLは用途ごとに1件だけ保持し、更新時とpagehide時に破棄する
- 別タブリンクはnoopenerとnoreferrerを維持する
- 別タブHTMLへ渡す値はHTML属性としてエスケープする
- Service Workerは同一オリジンかつ許可した固定ファイルだけを処理する
- Service Workerが削除するキャッシュはimage-motion-toolの接頭辞を持つものだけに限定する
- 利用者の画像、生成物、Blob URLをCache Storageへ保存しない
- GitHub Actionsの権限を必要最小限にする
- Pull Requestのコードをmainへ公開しない

新しい外部依存、WebAssembly、CDN、パッケージ管理を追加する場合は、この方針から外れるため別の設計判断が必要です。通常の修正では追加しません。

## 入力とメモリ上限

新しい入力形式を追加する前に、実ヘッダー検査、寸法検査、容量上限、展開後寸法との一致確認を実装します。拡張子やMIME typeだけで許可しません。

出力サイズ、フレーム数、fps、入力上限を増やす場合は、総処理画素数、推定出力、推定メモリ、キャンセル時の解放を同じ変更で見直します。エントリークラスのスマートフォンとタブレットを前提に、上限を安易に緩めません。

## 動きの変更

動きの名前、座標、伸縮、回転支点を変える場合はmotion-model.jsとscripts/test_motion_model.mjsを同時に更新します。

- 左右に傾くは足元を支点にする
- 振り子は画像上部を支点にする
- 呼吸は足元を保ちながら縦横に伸縮する
- ゆっくり拡大は等倍から拡大し、等倍へ戻る
- 弾む伸縮は足元寄りを支点に横へ広がり、縦へ縮みながら少し沈む
- 逆向きでも周期とつながりを壊さない

見た目だけで判断せず、支点と周期を数値テストで固定します。

## GIFの変更

- GIF圧縮を変更した場合は全フレームをLZW復号し、元の色番号と比較する
- 9ビットから12ビットへのコード幅変更と辞書初期化を検査する
- 減色変更では平均色差、RGB各チャンネルの偏り、64MBヒープ実行を確認する
- パレット分割で空の色グループを作らない
- 白背景など1色が大部分を占める画像でパレットが黒数色へ崩れないことを確認する
- 透明GIFでは前フレームの位置が次フレームへ残らない合成結果を確認する
- 既存GIFの速度変更はフレーム画像を再描画せず、表示時間だけを変更する
- 元GIFを上書きしない

利用者から問題画像が提供された場合は、画像そのものをリポジトリへ追加せず、特徴を再現した合成テストへ置き換えます。

## APNGの変更

- Canvas PNGのPNGシグネチャ、IHDR、チャンク長、CRC、IDAT、IENDを検査する
- 8ビットRGBAだけを受け入れる
- 全フレームを同寸法の画面全体上書きにする
- dispose-op=noneとblend-op=sourceを維持する
- 生成前にフレーム数、表示時間、総処理画素数、推定出力、推定メモリを検査する
- 生成後にacTL、fcTL、IDAT、fdAT、IEND、フレーム順序、時間、無限ループを再検査する
- 表示アプリが静止画として扱う場合とファイル破損を混同しない

## アニメーションWebPの変更

- CanvasのWebP出力をフレーム単位で検査する
- RIFF、WEBP、VP8X、ANIM、ANMF、ALPH、VP8、VP8Lの長さと境界を確認する
- ブラウザがVP8またはVP8Lを出力する可能性を前提にする
- 可逆または非可逆を画面説明で一律に断定しない
- 生成前にフレーム数、表示時間、総処理画素数、推定出力、推定メモリを検査する
- 端末や表示アプリによる生成、再生の差を案内する

## Service Workerの変更

- APP_SHELLには公開に必要な固定ファイルだけを列挙する
- index.htmlとsw.jsの実行ファイル参照を一致させる
- ナビゲーションはネットワーク優先にする
- クエリ文字列付きの同じ公開ページもオフライン時にindex.htmlへ戻す
- 他のパスや同一オリジン上の別サイトを横取りしない
- 削除対象はCACHE_PREFIXで始まる古い自サイトキャッシュだけにする
- cache.putで任意レスポンスを保存しない

scripts/test_service_worker.mjsで、他サイトのキャッシュを削除しないこと、クエリ付きURLがオフライン復帰すること、無関係なURLを処理しないことを確認します。

## 画面表示の確認

表示変更は次の幅で確認します。

- 280px
- 320px
- 360px
- 768px
- 1024px
- 1440px
- スマートフォン横向き
- タブレット縦向き

次も確認します。

- 200パーセント拡大でも主要操作へ到達できる
- 横スクロールで操作が隠れない
- タッチ対象が小さくなっていない
- フォーカス表示が見える
- 画面幅900px以下で1列になる
- 画面幅560px以下でボタンと設定が縦に並ぶ
- 別タブプレビューが左上へ寄らず中央へ表示される
- prefers-reduced-motion環境では初期再生が停止する

## ローカル検査

リポジトリ直下で実行します。

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

テストを通すために上限や品質しきい値を緩めません。失敗原因を修正します。

## 手動確認

1. PNG、JPEG、WebPを読み込む
2. 不明形式、15MB超過、異常寸法が拒否されることを確認する
3. 9種類の動き、支点、周期を確認する
4. 指ドラッグ、矢印キー、左右反転、取り消し、やり直しを確認する
5. 4種類の画面比率を確認する
6. 360px、3秒、10fpsでGIFを保存する
7. 速度だけを変えてGIFを再生成する
8. 既存GIFを0.5倍と2倍へ変更し、元ファイルが上書きされないことを確認する
9. APNGを保存し、対応ブラウザと未対応アプリの差を確認する
10. アニメーションWebPを保存し、生成または再生できない環境では案内が適切であることを確認する
11. PNG、JPEG、WebPの静止画像を保存する
12. 設定JSONを書き出し、読み戻す
13. 画像を外した後に設定だけが残ることを確認する
14. 通常URLとクエリ付きURLを開き、オフライン再読み込みを確認する
15. 同一オリジン上の別サイトのCache Storageへ干渉しないことを確認する

## Pull Request

Pull Request本文に次を記載します。

- 何を変えたか
- なぜ必要だったか
- 利用者への影響
- セキュリティと性能への影響
- 実行した検査
- 手動確認できなかった項目
- 元へ戻す方法

差分に意図しないファイルが含まれている場合はマージしません。自動検査が成功し、変更ファイルと目的が一致してからsquash mergeします。

## 公開後

1. Deploy GitHub Pagesの成功を確認する
2. Live site checkの成功を確認する
3. 公開URLでBuild番号を確認する
4. 通常再読み込みとホーム画面追加版の再起動を行う
5. 代表的な動き、GIF、APNG、アニメーションWebP、静止画像を確認する
6. スマートフォン幅とタブレット幅を確認する
7. 問題がなければPull Requestへ確認結果を残す

Live site checkは公開HTMLのBuild番号と実行ファイル参照を読み取り、同一オリジンの参照だけを許可し、公開中の主要テストを再実行します。個別ファイルのv番号をワークフローへ重複記載しません。

## 切り戻し

公開後に問題が見つかった場合は、問題のPull RequestをGitHubのRevertから取り消すPull Requestを作ります。新しい修正を同じmainへ直接重ねません。

1. 問題のPull Requestを開く
2. Revertを選ぶ
3. 作成されたPull Requestの差分が元変更だけを戻していることを確認する
4. 自動検査を待つ
5. 成功後にsquash mergeする
6. Deploy GitHub PagesとLive site checkを確認する
7. 公開URLで直前の正常状態へ戻ったことを確認する

Revertが競合する場合は、記録しておいた変更前のmainコミットと現在のmainを比較し、対象ファイルだけを戻すPull Requestを作ります。履歴を書き換えるforce pushは行いません。
