# 保守手順

この文書は、専門知識が少ない状態でも変更、確認、公開、切り戻しを同じ順序で行うための手順です。

## 変更前

1. mainが正常に公開されていることを確認する
2. GitHub ActionsのChecks、Deploy GitHub Pages、Live site checkが成功していることを確認する
3. 変更内容を1つの目的へ絞る
4. mainを直接編集せず、新しいブランチを作る
5. 大きな変更は画面、処理、テスト、文書の順に分ける

## 変更中

- 画面の見た目を変える場合は320px、768px、1024px以上で確認する
- 新しい設定値はapp-core.jsのDEFAULTSとsanitizeSettingsへ追加する
- 新しい入力は読み込み前の検査を追加する
- 新しい出力は処理量とメモリ上限を追加する
- app.jsで外部入力をHTMLとして挿入しない
- sw.jsへ追加するのは公開に必要な固定ファイルだけにする
- キャッシュ対象を変更したらCACHE_NAMEとURLのv番号を更新する
- 古い設定を壊さない場合は移行処理を残す
- 使わなくなった設定や関数は同じ変更内で削除する

## ローカル検査

リポジトリ直下で実行します。

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

手動確認は次の順序で行います。

1. PNG、JPEG、WebPを1枚ずつ読み込む
2. 不明な形式と15MBを超えるファイルが拒否されることを確認する
3. 8種類の動きを再生する
4. 指ドラッグ、矢印キー、左右反転を確認する
5. 取り消しとやり直しを確認する
6. 4種類の画面比率を確認する
7. 軽量、標準、高画質のGIFを保存する
8. PNG、JPEG、WebPを保存する
9. 設定JSONを書き出し、読み戻す
10. 画像を外した後も設定だけが残ることを確認する
11. オフラインで再読み込みする
12. 画面を拡大しても操作不能にならないことを確認する

## Pull Request

Pull Request本文には次を記載します。

- 何を変えたか
- なぜ必要だったか
- 利用者への影響
- セキュリティまたは性能への影響
- 実行した検査
- 元へ戻す方法

自動検査がすべて成功するまでマージしません。表示変更は公開前にスマートフォン幅でも確認します。

## 公開後

1. GitHub Pagesの公開完了を待つ
2. 公開URLを通常ウィンドウで開く
3. app.js、app-core.js、gif-encoder.jsのv番号が新しいことを確認する
4. 画像を読み込み、最低1つのGIFと静止画像を保存する
5. ブラウザを再読み込みし、新しいService Workerが使われることを確認する
6. 問題がなければPull Requestを閉じた状態で残す

## 切り戻し

公開後に重大な問題が出た場合は、新しい修正を重ねる前に直前の正常状態へ戻します。

GitHub上で問題のPull Requestを開き、Revertを選択して取り消し用Pull Requestを作成します。Revertが使えない場合は、問題のコミットで変更されたファイルを直前の正常コミットの内容へ戻します。

切り戻し後も次を実行します。

```bash
node scripts/test_app_core.mjs
node scripts/test_gif_encoder.mjs
node scripts/check_static.mjs
```

Service Workerの変更を戻した場合は、CACHE_NAMEを新しい値へ進めます。同じキャッシュ名へ古い内容を戻すと、利用者の端末に新旧ファイルが混在する可能性があります。

## AIへ保守を依頼する場合

依頼文には次を含めます。

- リポジトリURL
- 変更したい機能
- 現在起きている問題
- 対象端末
- 外部API、CDN、追加課金を使わない条件
- 現行デザインを大きく変えない条件
- 自動検査、README、SECURITY.md、MAINTENANCE.mdも更新する条件
- 専用ブランチ、Pull Request、自動検査後にマージする条件

AIが提案したコードは、説明だけで判断せず、必ず自動検査と公開前の手動確認を通します。
