# Playwrightスクリプト: 全スタッフの希望休一括登録

## Context
シフト管理アプリの動作確認として、20人のスタッフ全員がブラウザ上で希望休を提出し、管理者がそれを確認するフローをPlaywrightスクリプトで自動化する。手動でやると20回ログイン→操作が必要なため、自動化の価値が高い。

## 方針: シンプルスクリプト（Approach C）
テストフレームワーク不要。`scripts/submit-all-requests.ts` として `npx tsx` で実行。

## セットアップ

1. **Playwright インストール**
   ```bash
   npm install -D playwright
   npx playwright install chromium
   ```

2. **前提条件**（スクリプト実行前）
   - `npm run db:seed` でシードデータ投入済み
   - `npm run dev` でdevサーバー起動済み

## スクリプトの流れ

### Phase 1: 管理者がタームを「受付中」に変更
- `adminContext` (別BrowserContext) でログイン
- `/admin/terms` に移動
- 「編集」ボタン → `request_deadline` を未来日に設定 → 保存
- 「受付開始」ボタン → `confirm()` ダイアログを `accept`
- タームが `collecting` になったことを確認

### Phase 2: 全スタッフ（20人）の希望休提出
- 各スタッフ `n001@nho-example.jp` 〜 `n020@nho-example.jp` について：
  - 新しい `BrowserContext` を作成（Cookie分離）
  - ログイン → `/requests` に移動
  - カレンダーから **ランダムに3日** を選択（各スタッフ異なる日を選ぶ）
  - 「申請済みの希望休」に3件表示されることを確認
  - コンテキストを閉じる
- `headless: false` + slowMo で動きが見える設定（オプション）

### Phase 3: 管理者が希望休を確認
- `adminContext` で `/admin/terms` → 「希望休」ボタンクリック
- `RequestsPanel` にスタッフ名と日付が表示されることを確認
- コンソールに結果サマリーを出力

## 主要セレクタ
| 要素 | セレクタ |
|------|---------|
| メールアドレス入力 | `#email` |
| パスワード入力 | `#password` |
| ログインボタン | `button[type="submit"]` |
| 編集ボタン | `button:has-text("編集")` |
| 受付開始ボタン | `button:has-text("受付開始")` |
| 希望休ボタン | `button:has-text("希望休")` |
| カレンダー日付ボタン | `.grid button` (28個のボタン) |
| 希望休入力タイトル | `text=希望休入力` |
| 受付中ターム無しメッセージ | `text=現在受付中のタームはありません` |

## 作成ファイル
- `scripts/submit-all-requests.ts` — メインスクリプト（1ファイルのみ）

## 対象既存ファイル（参照のみ、変更なし）
- `prisma/seed.ts` — スタッフ20人の情報（N001〜N020）
- `src/app/(auth)/login/page.tsx` — ログインフォーム
- `src/app/(staff)/requests/page.tsx` — 希望休入力画面
- `src/app/(admin)/admin/terms/page.tsx` — ターム管理画面
- `src/components/term/TermEditDialog.tsx` — ターム編集ダイアログ
- `src/components/term/RequestsPanel.tsx` — 希望休一覧パネル

## 実行方法
```bash
# 1. devサーバー起動（別ターミナル）
npm run dev

# 2. スクリプト実行
npx tsx scripts/submit-all-requests.ts

# オプション: ヘッドレスモード
HEADLESS=true npx tsx scripts/submit-all-requests.ts
```

## 検証方法
- スクリプト実行後、ブラウザで `admin@nho-example.jp` でログイン
- `/admin/terms` → 「希望休」ボタンで20人分のリクエストが表示される
- コンソール出力で各スタッフの登録結果を確認
