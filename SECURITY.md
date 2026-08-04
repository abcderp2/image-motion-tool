# セキュリティ方針

## 対象

このツールはGitHub Pagesで公開する静的Webアプリです。画像加工はブラウザ内で行い、利用者の画像を外部サーバーへ送信しません。HTML、CSS、JavaScript、アイコンなどの固定ファイルはGitHub Pagesから取得します。

## 主な対策

- 外部API、CDN、広告、アクセス解析を使用しない
- Content Security Policyで通信先、スクリプト、画像、Worker、埋め込み対象を制限する
- カメラ、マイク、位置情報、決済、USBを使用しない
- 対応ブラウザ向けにPermissions-Policyも明示する
- iframe内の実行をアプリ側で検出して停止する
- PNG、JPEG、WebPの実ヘッダーを画像展開前に確認する
- 入力容量、寸法、合計画素数を制限する
- 画像展開後の寸法とヘッダー寸法を照合する
- SVG、HTML、不明な画像形式を読み込まない
- 設定JSONは容量を制限し、許可した値だけを取り込む
- innerHTML、eval、new Functionを使用しない
- Blob URLを用途ごとに1件だけ保持し、更新時とpagehide時に破棄する
- 別タブリンクにnoopenerとnoreferrerを指定する
- 別タブHTMLへ渡す値をHTML属性としてエスケープする
- Service Workerは同一オリジンの許可済み固定ファイルだけを処理する
- Service Workerが削除するキャッシュをimage-motion-tool専用の接頭辞に限定する
- 利用者の画像、生成物、Blob URLをCache Storageへ保存しない
- GitHub Actionsの権限を必要最小限にする
- Pull Requestでは検査だけを行い、Pagesへ公開しない

## 形式別の検査

### GIF

GIF生成では、色数、フレーム寸法、表示時間、透過、ループ、LZW圧縮を検査します。テストでは生成後の全フレームを復号し、元の色番号と比較します。

既存GIFの速度変更では、GIF87aまたはGIF89aのヘッダー、論理画面、各フレーム、色テーブル、データブロック、LZW情報を確認します。Canvasへ展開せず、表示時間に必要な部分だけを変更します。

### APNG

Canvasから得たPNGフレームについて、PNGシグネチャ、IHDR、チャンク長、CRC、IDAT、IEND、8ビットRGBAを確認します。APNG生成時はacTL、fcTL、IDAT、fdAT、IEND、寸法、フレーム数、順序、表示時間、無限ループ、合成方式を検査します。

通常端末では総処理1400万画素、推定出力32MB、推定メモリ64MBを上限とします。端末メモリが2GB以下と判定できる場合は、さらに厳しい上限を使用します。

### アニメーションWebP

CanvasのWebP出力について、RIFF、WEBP、VP8X、ANIM、ANMF、ALPH、VP8またはVP8Lのチャンク名、長さ、境界、寸法、表示時間、予約ビット、フレーム数、ループを検査します。

ブラウザが出力する内部形式は実装に依存するため、可逆または非可逆を一律に断定しません。通常端末では総処理1400万画素、推定出力24MB、推定メモリ64MBを上限とし、端末メモリが2GB以下と判定できる場合は上限を引き下げます。

## Service Worker

Service WorkerはAPP_SHELLに列挙した固定ファイルだけをキャッシュします。任意レスポンスをcache.putで保存しません。

古いキャッシュを削除するときは、image-motion-tool専用のCACHE_PREFIXで始まるキャッシュだけを対象にします。同じabcderp2.github.io上にある別サイトのキャッシュは削除しません。

通常URLとクエリ文字列付きの同じ公開ページは、ネットワーク取得に失敗した場合だけ保存済みindex.htmlへ戻します。別パス、別サイト、POSTなどの要求は処理しません。

## 静的ホスティング上の限界

GitHub Pagesでは任意のHTTPレスポンスヘッダーを設定できないため、Content Security PolicyとPermissions-PolicyはHTML内で明示しています。meta要素で利用できない方針もあるため、埋め込み禁止はJavaScript側でも検出します。

HTTPレスポンスヘッダーを設定できる環境へ移行する場合は、次を追加します。

- Content-Security-Policyのframe-ancestors 'none'
- X-Content-Type-Options: nosniff
- 必要最小限のPermissions-Policy
- 適切なReferrer-Policy

robots.txtとai.txtは公開方針であり、認証やアクセス制御ではありません。

## 残る制約

ブラウザの画像デコーダー、Canvas、WebP実装、写真アプリ、ファイルアプリの挙動はサイト側で完全には制御できません。ヘッダー検査を通過した画像でも、ブラウザ実装の不具合や端末のメモリ不足によって処理が失敗する可能性があります。

APNGやアニメーションWebPが動かない場合は、ファイル破損とは限りません。対応ブラウザまたはアプリで確認し、必要に応じてGIFを使用してください。

Blob URLは同じブラウザ内で生成物を表示する一時的な参照です。外部送信ではありませんが、URLを保持している間はそのブラウザ内から参照できます。そのため、同時保持を用途ごとに1件へ制限し、更新時とページ離脱時に破棄します。

## 脆弱性の連絡

機密性のある内容、攻撃用データ、未公開の再現手順を公開Issueへ直接書かないでください。

GitHubのSecurityタブでPrivate vulnerability reportingが利用できる場合は、そこから報告してください。利用できない場合は、再現手順や攻撃用データを含めず、脆弱性の可能性があることだけをIssueで知らせてください。

報告には次の情報があると確認しやすくなります。

- 影響を受けるページまたはファイル
- 使用した端末、OS、ブラウザ
- 想定される影響
- 再現に必要な最小条件
- 公開して問題ない範囲の画面表示

## 対応手順

1. 影響範囲を確認する
2. 公開サイトで悪用可能な場合は、機能停止や上限引き下げを含む最小修正を優先する
3. 同じ問題を検出する自動テストを追加する
4. Pull Requestで差分、検査、切り戻し方法を記録する
5. 自動検査成功後にmainへマージする
6. Deploy GitHub PagesとLive site checkを確認する
7. 問題が残る場合は対象Pull Requestをrevertする

切り戻し方法はMAINTENANCE.mdに記載しています。
