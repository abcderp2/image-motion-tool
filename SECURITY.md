# セキュリティ方針

## 対象

このツールは静的Webアプリです。画像加工はブラウザ内で行い、画像を外部サーバーへ送信しません。公開版を開く際は、HTML、CSS、JavaScriptなどのアプリファイルをGitHub Pagesから取得します。

## 主な対策

- 外部API、CDN、広告、アクセス解析を使用しない
- Content Security Policyで通信先、スクリプト、画像、Workerを制限する
- カメラ、マイク、位置情報などの端末APIを使用しない
- HTMLのPermissions-Policyでも不要な端末APIを明示的に無効化する
- PNG、JPEG、WebPの実ヘッダーを画像展開前に確認する
- 容量、縦横、合計画素数、総描画量を制限する
- SVG、HTML、不明な画像形式を読み込まない
- 設定JSONは容量を制限し、許可した値だけを取り込む
- innerHTML、eval、new Functionを使用しない
- Service Workerは許可一覧にあるアプリファイルだけをキャッシュする
- GitHub Actionsの権限を必要最小限にする
- 画像本体をlocalStorageやCache Storageへ保存しない

## 静的ホスティング上の限界

Content Security PolicyとPermissions-PolicyはHTMLのmeta要素で方針を明示しています。meta要素ではframe-ancestorsが有効にならないため、アプリ側でも埋め込み表示を検出して操作を停止します。HTTPレスポンスヘッダーを自由に設定できるホスティングへ移行する場合は、Content-Security-Policyヘッダーのframe-ancestors 'none'、X-Content-Type-Options nosniff、不要な端末APIを無効化するPermissions-Policyを追加してください。

robots.txtとai.txtは公開方針であり、認証やアクセス制御ではありません。端末内処理でも、壊れた画像や極端に大きい画像がブラウザの画像デコーダーへ負荷を与える可能性は残ります。そのため、ヘッダー確認と端末別上限を画像展開前に実施します。

## 脆弱性の連絡

機密性のある内容を公開Issueへ直接書かないでください。

GitHubのSecurityタブでPrivate vulnerability reportingが利用できる場合は、そこから報告してください。利用できない場合は、再現手順や攻撃用データを含めず、脆弱性の可能性があることだけをIssueで知らせてください。

報告には次の情報があると確認しやすくなります。

- 影響を受けるページまたはファイル
- 使用した端末とブラウザ
- 想定される影響
- 再現に必要な最小条件
- 公開して問題ない範囲の画面表示

## 対応手順

1. 影響範囲を確認する
2. 公開サイトで悪用可能な場合は、最小の修正を優先する
3. 入力上限や機能停止で一時的に封じる
4. 自動検査を追加して再発を防ぐ
5. Pull Requestで差分と確認結果を残す
6. mainへマージ後、公開サイトを確認する
7. 問題が残る場合は直前の正常コミットへ戻す

切り戻し方法はMAINTENANCE.mdに記載しています。
