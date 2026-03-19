# 実装計画書

## NHO 看護師シフト管理アプリ — MVP

---

## 概要

設計書（01〜10）に基づき、`task-N` ブランチ単位で段階的に実装する。各タスクは前タスクの成果物に依存するため、原則として番号順に進める。

---

## Task 一覧

| タスク | ブランチ | 概要 | 依存 |
|:---:|---------|------|:---:|
| 1 | `task-1` | 基盤構築 | — |
| 2 | `task-2` | 認証 | 1 |
| 3 | `task-3` | スタッフ管理 | 2 |
| 4 | `task-4` | ターム管理・祝日マスタ | 2 |
| 5 | `task-5` | 希望休 | 3, 4 |
| 6 | `task-6` | シフト生成エンジン | 3, 4, 5 |
| 7 | `task-7` | シフト表UI | 6 |
| 8 | `task-8` | 保存・履歴 | 7 |
| 9 | `task-9` | 確定・閲覧・PDF | 8 |
| 10 | `task-10` | 仕上げ | 9 |

---

## Task-1: 基盤構築

**ブランチ:** `task-1`

### 目的

プロジェクト全体の土台を構築する。以降のタスクが依存するライブラリ・設定・型定義・ユーティリティを整備する。

### 実装内容

#### 1.1 パッケージ導入

```
# 本体
npm install prisma @prisma/client @supabase/supabase-js @supabase/ssr zustand zod

# PDF（後続タスクで使用するが依存関係のため先にインストール）
npm install @react-pdf/renderer

# 開発
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

#### 1.2 Prisma スキーマ定義

- `prisma/schema.prisma` を作成
- 04_データ設計書に基づく全テーブル定義:
  - `users` — 業務属性のみ（id は Supabase Auth の UUID）
  - `staffs` — スタッフマスタ（user_id FK、staff_code UNIQUE）
  - `terms` — ターム（`generating_started_at` カラム含む、`lock_version` カラム含む）
  - `shift_requests` — 希望休申請
  - `shift_entries` — シフトデータ
  - `shift_snapshots` — 編集履歴（JSONB）
  - `holidays` — 祝日マスタ
  - `audit_logs` — 操作ログ
- enum 定義: `Role`, `Team`, `TermStatus`, `ShiftType`
- インデックス・UNIQUE制約・CHECK制約を設定

#### 1.3 Supabase クライアント設定

- `src/lib/supabase/server.ts` — サーバー用クライアント（`@supabase/ssr` + Cookie）
- `src/lib/supabase/client.ts` — ブラウザ用クライアント
- `src/lib/supabase/admin.ts` — Service Role Key 用管理クライアント
- `.env.local.example` — 環境変数テンプレート

#### 1.4 共通ユーティリティ

- `src/lib/api/response.ts` — 統一レスポンス形式（05_API設計書 §1.3）
- `src/lib/api/errors.ts` — エラーコード定義（05_API設計書 §1.4）
- `src/lib/api/auth-guard.ts` — API 認可ヘルパー（ロールチェック）
- `src/lib/utils/date.ts` — JST 日付ユーティリティ（締切判定等）
- `src/lib/utils/password.ts` — 仮パスワード生成（07_業務ルール §8）

#### 1.5 制約チェック型定義

- `src/lib/constraints/types.ts` — 制約違反の型（06_技術スタック §3.3）
- `src/lib/constraints/index.ts` — エクスポート
- `src/lib/statistics/types.ts` — 統計計算の型

#### 1.6 プロジェクト設定

- `tsconfig.json` のパスエイリアス設定（`@/`）
- Vitest 設定（`vitest.config.ts`）
- ESLint 追加ルール
- `.env.local.example`

#### 1.7 シードスクリプト

- `prisma/seed.ts` — 祝日マスタ（2026〜2027年）の初期データ

### 成果物

```
prisma/
  schema.prisma
  seed.ts
src/
  lib/
    supabase/
      server.ts
      client.ts
      admin.ts
    api/
      response.ts
      errors.ts
      auth-guard.ts
    constraints/
      types.ts
      index.ts
    statistics/
      types.ts
    utils/
      date.ts
      password.ts
.env.local.example
vitest.config.ts
```

### 完了条件

- `npx prisma generate` が成功する
- `npx prisma migrate dev` でマイグレーションが通る
- Vitest が実行可能
- 仮パスワード生成のユニットテストが通る

---

## Task-2: 認証

**ブランチ:** `task-2`

### 目的

Supabase Auth ベースの認証・認可機能を実装する。

### 実装内容

#### 2.1 API

- `POST /api/auth/login` — ログイン（レスポンスに `staff_id` を含む）
- `POST /api/auth/logout` — ログアウト
- `PUT /api/auth/password` — パスワード変更（現パスワード再認証 → 更新 → `must_change_password` を `user_metadata` と DB 同期）
- `POST /api/auth/reset-password` — パスワード再発行（admin のみ）

#### 2.2 Middleware

- `src/middleware.ts` — Next.js Middleware
  - 未認証 → `/login` リダイレクト
  - `user_metadata.must_change_password = true` → `/settings/password` リダイレクト（DB アクセス不要）
  - `role = staff` が `/admin/*` にアクセス → `/home` リダイレクト
  - `role = admin` が `/home`, `/requests`, `/shifts/:termId` にアクセス → `/dashboard` リダイレクト

#### 2.3 画面

- `/login` — ログイン画面（08_画面仕様 §1）
- `/settings/password` — パスワード変更画面（08_画面仕様 §9）

#### 2.4 共通レイアウト

- 管理者レイアウト（サイドバー + ヘッダー）
- スタッフレイアウト（ヘッダー + ナビゲーション）
- ログアウトボタン

### 完了条件

- ログイン → ロール別リダイレクトが動作する
- 未認証アクセスで `/login` にリダイレクトされる
- `must_change_password` 時にパスワード変更画面に遷移する
- パスワード変更後に `must_change_password = false` になる
- スタッフが `/admin/*` にアクセスすると `/home` にリダイレクトされる

---

## Task-3: スタッフ管理

**ブランチ:** `task-3`

### 目的

スタッフの CRUD 管理機能を実装する。Supabase Auth との整合性保証を含む。

### 実装内容

#### 3.1 API

- `GET /api/staffs` — 一覧取得（チーム・状態・検索フィルタ）
- `POST /api/staffs` — 新規登録（Auth ユーザー + users + staffs 同時作成。補償トランザクション実装）
- `PUT /api/staffs/:id` — 情報更新（email 変更不可）
- `DELETE /api/staffs/:id` — 論理削除（`is_active = false`）
  - 未確定タームの `shift_entries` から当該スタッフを削除
- `PUT /api/staffs/:id/restore` — 復元

#### 3.2 画面

- `/admin/staff` — スタッフ管理画面（08_画面仕様 §4）
  - 一覧テーブル（ソート・フィルタ・検索）
  - 登録・編集ダイアログ
  - 無効化確認ダイアログ
  - 無効化済みタブ切替

#### 3.3 操作ログ

- `staff.create` / `staff.update` / `staff.deactivate` / `staff.restore` を `audit_logs` に記録

### 完了条件

- スタッフの CRUD が動作する
- 補償トランザクション: Auth 作成成功 → DB 失敗時に Auth ユーザーが削除される
- 論理削除時に未確定タームの shift_entries から除外される
- 管理者自身の無効化が拒否される

---

## Task-4: ターム管理・祝日マスタ

**ブランチ:** `task-4`

### 目的

ターム CRUD とステータス遷移、祝日マスタ管理を実装する。

### 実装内容

#### 4.1 ターム API

- `GET /api/terms` — 一覧取得（ロール別フィルタ: admin は全件、staff は `collecting` + `confirmed` のみ）
- `POST /api/terms` — 個別登録（end_date 自動計算、fiscal_year 自動導出、重複チェック）
- `POST /api/terms/bulk` — 年度一括登録（13ターム、all-or-nothing）
- `PUT /api/terms/:id` — 設定更新（request_deadline、min_day_staff）
- `DELETE /api/terms/:id` — 削除（`draft` のみ、CASCADE で shift_requests も削除）
- `PUT /api/terms/:id/status` — ステータス変更
  - `draft` → `collecting`（deadline 設定必須）
  - `adjusting` → `confirmed`（フェーズ1制約違反0件チェック）
  - `confirmed` → `adjusting`（差し戻し）
  - `generating` → `collecting`（5分超経過時の強制ロールバック）

#### 4.2 祝日 API

- `GET /api/holidays` — 一覧取得（暦年 / 日付範囲フィルタ）
- `POST /api/holidays` — 追加（病院独自の祝日）
- `DELETE /api/holidays/:id` — 削除（カスタム祝日のみ）

#### 4.3 画面

- `/admin/terms` — ターム設定画面（08_画面仕様 §5）
  - 年度一括登録ダイアログ
  - 個別登録ダイアログ
  - ステータスバッジ表示（色分け）
  - ボタン活性制御

#### 4.4 シードデータ拡充

- テスト用ターム 1件を seed に追加

### 完了条件

- ターム登録・一括登録が動作する
- 重複チェックが機能する
- ステータス遷移が正しく制御される
- 祝日の CRUD が動作する
- fiscal_year の自動導出が正しい（4月 → 当年度、2月 → 前年度）

---

## Task-5: 希望休

**ブランチ:** `task-5`

### 目的

スタッフの希望休申請機能と管理者の代理入力機能を実装する。

### 実装内容

#### 5.1 API

- `GET /api/terms/:termId/requests` — 希望休一覧（admin: 全件、staff: 自分のみ）
- `POST /api/terms/:termId/requests` — 希望休申請（1リクエスト1日）
  - staff_id 検証（JWT の user_id → staffs.id と一致チェック）
  - ターム状態 `collecting` チェック
  - 締切判定（`現在のJST日付 > request_deadline`）
  - 同一スタッフ同一ターム3件上限チェック
  - ターム期間内チェック
- `DELETE /api/terms/:termId/requests/:id` — 希望休取消（スタッフは締切前のみ）

#### 5.2 画面

- `/requests` — 希望休入力画面（08_画面仕様 §6）
  - カレンダーUI（28日間）
  - 残り申請可能数の表示
  - 締切日表示
  - 締切後の読み取り専用表示（`collecting` + 締切後の判定はフロント側で `request_deadline` 比較）
- `/admin/terms` 内に希望休一覧パネルを追加（管理者の代理入力導線）

### 完了条件

- スタッフが希望休を申請・取消できる
- 3日上限が守られる
- 締切後はスタッフの操作がブロックされる
- 管理者は締切後も代理入力・修正が可能
- ターム状態が `collecting` 以外では申請不可

---

## Task-6: シフト生成エンジン

**ブランチ:** `task-6`

### 目的

制約チェック共通ロジックとシフト自動生成アルゴリズムを実装する。

### 実装内容

#### 6.1 制約チェック共通ロジック（フロント・バック共有）

06_技術スタック §3.3 に基づき `src/lib/constraints/` に実装する。

- `src/lib/constraints/hard-constraints.ts`
  - フェーズ1: H1〜H5, H11〜H13, H17〜H18
  - フェーズ2: H6〜H10, H14〜H16, H19
- `src/lib/constraints/soft-constraints.ts`
  - S1〜S4
- `src/lib/statistics/shift-statistics.ts`
  - 勤務時間計算、夜勤回数、週休回数、日別配置人数

全関数は純粋関数として実装。入力はシフトデータ配列・スタッフ情報・祝日データのみ。

#### 6.2 生成エンジン

- `src/lib/engine/shift-generator.ts` — メインエンジン
  - Step 1: 初期化（希望休反映、夜勤候補抽出）
  - Step 2: 夜勤配置（深夜→準夜セット優先、H17/H18 考慮）
  - Step 3: 週休配置（8回/ターム、H6〜H10 考慮）
  - Step 4: 代休配置（祝日勤務者に holiday_off）
  - Step 5: 日勤配置（残枠を day で埋める）
  - Step 6: 制約検証・修復（最大5回リトライ）
  - Step 7: ソフト制約最適化
- 55秒タイムアウト管理
- 乱数シード対応（再生成で別パターン）

#### 6.3 生成 API

- `POST /api/terms/:termId/shifts/generate`
  - `export const maxDuration = 60`
  - 生成前バリデーション（祝日数考慮の必要スタッフ数計算）
  - ステータス排他制御（`WHERE status = 'collecting'` or `WHERE status = 'adjusting'`）
  - 再生成時: 生成前にスナップショット自動保存
  - 結果を `shift_entries` に保存、`lock_version` インクリメント
  - `generating_started_at` の設定・クリア

#### 6.4 テスト

- 全ハード制約の単体テスト（10_テストケース G-10〜G-19）
- フェーズ2制約の単体テスト（G-20〜G-28）
- ソフト制約のテスト（G-30〜G-33）
- エッジケーステスト（G-40〜G-50）

### 完了条件

- 20名規模で60秒以内にシフトが生成される
- フェーズ1ハード制約が全て満たされる
- フェーズ2制約違反が警告として報告される
- タイムアウト時に途中結果が返却される
- 制約チェック関数がフロントエンドからもインポート可能

---

## Task-7: シフト表UI

**ブランチ:** `task-7`

### 目的

シフト表のグリッドエディタと Zustand によるクライアント側ステート管理を実装する。

### 実装内容

#### 7.1 Zustand ストア

- `src/stores/shift-store.ts`
  - シフトデータの保持（2次元配列: スタッフ × 日付）
  - セル編集（shift_type 変更）
  - Undo / Redo スタック（最大20操作）
  - `isDirty` フラグ管理
  - `lock_version` 保持
  - リアルタイム制約チェック（`src/lib/constraints/` の共有関数を使用）
  - リアルタイム統計計算（`src/lib/statistics/` の共有関数を使用）

#### 7.2 シフト取得 API

- `GET /api/terms/:termId/shifts` — シフトデータ取得（admin: 常時、staff: confirmed のみ）
- `GET /api/terms/:termId/shifts/violations` — 制約違反取得

#### 7.3 画面

- `/admin/shifts/:termId` — シフト表編集画面（08_画面仕様 §7）
  - グリッドコンポーネント（行: スタッフ、列: 日付）
  - セルクリック → 勤務種別選択ポップオーバー（日/準/深/休/代）
  - 背景色: 土曜薄青、日曜薄赤、祝日薄桃
  - 制約違反: 赤枠（ハード）、黄枠（ソフト）
  - 手動編集ドット表示
  - 右端列: スタッフ別統計
  - 下端行: 日別統計
  - ツールバー（自動生成/再生成/保存/Undo/Redo/確定/差し戻し/PDF/履歴）
  - 違反サマリーパネル
  - 統計パネル
  - 生成中ローディングオーバーレイ（クライアント側タイマー）
  - 離脱防止（beforeunload + アプリ内遷移モーダル）

### 完了条件

- セル編集が即座に反映される
- 制約チェックがリアルタイムで動作する
- Undo/Redo が正しく動作する（20操作上限）
- 統計情報がリアルタイム更新される
- 離脱防止が動作する

---

## Task-8: 保存・履歴

**ブランチ:** `task-8`

### 目的

シフトデータの一括保存、楽観的ロック、スナップショット管理を実装する。

### 実装内容

#### 8.1 API

- `POST /api/terms/:termId/shifts/save` — 一括保存
  - 楽観的ロックチェック（`lock_version` 比較）
  - `is_active = true` のスタッフのみ保存対象
  - current working copy の完全置換（DELETE + INSERT）
  - スナップショット作成（5世代超で最古を削除）
  - 制約チェック・統計再計算
  - 操作ログ記録
- `GET /api/terms/:termId/snapshots` — スナップショット一覧
- `POST /api/terms/:termId/snapshots/:id/restore` — スナップショット復元
  - 楽観的ロックチェック
  - 有効スタッフのみ抽出して復元
  - 除外されたスタッフ情報をレスポンスに含める
  - `lock_version` インクリメント
  - 復元後の制約チェック・統計再計算

#### 8.2 フロントエンド連携

- 保存成功時: `isDirty = false`、Undo/Redo スタックリセット、新 `lock_version` 保持
- 409 エラー時: 楽観的ロックエラーダイアログ（08_画面仕様 §7.8）
- 復元時: スタッフ減少メッセージ表示、Undo/Redo リセット
- 履歴パネル UI

### 完了条件

- 保存 → スナップショット作成が動作する
- 6世代目保存で最古が削除される
- 楽観的ロックが正しく動作する（409 エラー）
- スナップショット復元後に制約チェックが再実行される
- 無効化スタッフがいた場合の情報メッセージが表示される

---

## Task-9: 確定・閲覧・PDF

**ブランチ:** `task-9`

### 目的

シフト確定フロー、スタッフ向け閲覧画面、PDF出力を実装する。

### 実装内容

#### 9.1 確定・差し戻し

- `PUT /api/terms/:id/status` の確定フロー強化
  - `adjusting` → `confirmed`: フェーズ1制約違反0件チェック
  - 確認ダイアログ（警告件数表示）
- `confirmed` → `adjusting`: 差し戻し

#### 9.2 スタッフ向け閲覧

- `/shifts/:termId` — シフト表閲覧画面（08_画面仕様 §8）
  - `confirmed` タームのみアクセス可能
  - 読み取り専用グリッド
  - 自分のシフトのハイライト
  - スマートフォン対応（横スクロール + カード形式切替）

#### 9.3 PDF出力

- `GET /api/terms/:termId/shifts/pdf`
  - `@react-pdf/renderer` でサーバーサイド生成
  - A3横向き、1ターム1ページ
  - ヘッダー: 病棟名・ターム期間・出力日時
  - グリッド: 勤務記号 + 背景色
  - 統計情報
  - フッター: ページ番号
  - `adjusting` / `confirmed` のみ出力可能

### 完了条件

- フェーズ1制約違反がある状態で確定がブロックされる
- 確定後にスタッフがシフトを閲覧できる
- 差し戻しで閲覧不可に戻る
- PDF が正しいレイアウトで出力される
- スマートフォンで閲覧画面が使用可能

---

## Task-10: 仕上げ

**ブランチ:** `task-10`

### 目的

ダッシュボード、操作ログ、Cron ジョブ、E2Eテスト、最終調整を行う。

### 実装内容

#### 10.1 ダッシュボード

- `/dashboard` — 管理者ダッシュボード（08_画面仕様 §2）
  - 現在のターム情報、進捗サマリー
  - 希望休申請状況
  - クイックアクション
  - 有効スタッフ数（チーム別）
- `/home` — スタッフダッシュボード（08_画面仕様 §3）
  - 希望休受付状況
  - 申請済み一覧
  - 確定シフトへのリンク

#### 10.2 操作ログ

- `GET /api/audit-logs` — 操作ログ取得（admin のみ、ページネーション）
- 操作ログ閲覧画面（管理者向け）

#### 10.3 Cron ジョブ

- `GET /api/cron/cleanup-audit-logs` — 365日超過の操作ログ削除（`CRON_SECRET` で保護）
- `GET /api/health` — ヘルスチェック
  - `generating` 状態が10分超のタームを検出 → `collecting` に自動ロールバック + ログ記録
- `vercel.json` に Cron 設定追加

#### 10.4 シードデータ完備

- テスト用スタッフ20名（チームA: 10名、チームB: 10名）
- 管理者ユーザー 1名
- テスト用ターム
- 2026〜2027年祝日データ

#### 10.5 E2Eテスト

- Playwright 導入
- 主要ユースケース:
  - ログイン → ダッシュボード遷移
  - スタッフ登録 → 希望休申請 → シフト生成 → 手動調整 → 保存 → 確定
  - 権限テスト（スタッフが admin 画面にアクセス不可）
  - 離脱防止テスト

#### 10.6 最終調整

- エラーハンドリングの統一確認
- レスポンシブ対応の確認（スタッフ向け画面）
- パフォーマンス確認（シフト表表示2秒以内）
- セキュリティヘッダー設定（CSP等）

### 完了条件

- 両ダッシュボードが正しく表示される
- 操作ログの記録・閲覧が動作する
- Cron ジョブが設定される
- E2Eテストが全て通る
- 全画面のエラーハンドリングが統一されている

---

## 横断的な注意事項

### テスト方針

- **単体テスト（Vitest）**: ビジネスロジック（制約チェック、統計計算、日付ユーティリティ等）。カバレッジ目標 80%
- **結合テスト（Vitest）**: API エンドポイント（認可・バリデーション・DB 操作）
- **E2Eテスト（Playwright）**: 主要ユースケース
- 各タスク完了時に該当テストが通ることを確認

### Git 運用

- 各タスクは `task-N` ブランチで作業
- タスク完了後に `main` へマージ
- コミットメッセージは変更の意図を記載

### 環境変数

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
DIRECT_URL=
CRON_SECRET=
```
