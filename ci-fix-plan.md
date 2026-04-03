# CI/CD 失敗 修正計画書

**対象ワークフロー実行**: [#6 edit · a0298ac](https://github.com/ryotasuyama/nho-shift-app-claude/actions/runs/23903292717/job/69705291291)
**失敗日時**: 2026-04-02 13:40
**失敗ステップ**: `Run npm run check`（typecheck フェーズ）
**作成日**: 2026-04-03

---

## 1. エラー全体像

`npm run check`（= `lint && typecheck && build`）の `typecheck`（`tsc --noEmit`）フェーズで **計46件のエラー** が発生し、exit code 2 で終了。

| 分類 | 件数 | 主な原因 |
|------|------|---------|
| `@prisma/client` エクスポートなし（TS2305） | 6件 | CI 環境で `prisma generate` 未実行 |
| コールバック引数の暗黙的 `any`（TS7006） | 約36件 | 型注釈の欠落 |
| `Set<unknown>` 型不一致（TS2322/TS2345） | 4件 | Prisma 型なし状態での推論崩れ |

---

## 2. 原因詳細

### 原因①：CI 環境で `prisma generate` が未実行（最重要）

Prisma 7 では `@prisma/client` の型は **`prisma generate` を実行して初めて生成される**。
ローカル開発環境では既に `generate` 済みのため気づかないが、CI の `npm ci` はパッケージのインストールのみで型生成は行わない。

その結果、以下のファイルで `PrismaClient` / `Prisma` が見つからないエラーが発生している。

| ファイル | エラー内容 |
|---------|-----------|
| `src/lib/prisma.ts` | `'PrismaClient'` has no exported member |
| `prisma/seed.ts` | `'PrismaClient'` has no exported member |
| `scripts/setup-users.ts` | `'PrismaClient'` has no exported member |
| `src/app/api/holidays/route.ts` | `'Prisma'` has no exported member |
| `src/app/api/staffs/route.ts` | `'Prisma'` has no exported member |
| `src/app/api/terms/route.ts` | `'Prisma'` has no exported member |

### 原因②：コールバック引数の型注釈欠落（TS7006）

`.map()` / `.filter()` / Prisma `$transaction()` 等のコールバック引数に型が明示されていない。
`noImplicitAny: true` の TypeScript 設定により、ローカルでも `prisma generate` がなければ同様のエラーになる。

主な対象ファイル：

- `src/app/api/dashboard/route.ts`（`s`, `t`）
- `src/app/api/audit-logs/route.ts`（`l`）
- `src/app/api/holidays/route.ts`（`h`）
- `src/app/api/staff-home/route.ts`（`r`, `t`）
- `src/app/api/staffs/[id]/route.ts`（`tx`）
- `src/app/api/staffs/route.ts`（`tx`）
- `src/app/api/terms/[termId]/requests/route.ts`（`r`）
- `src/app/api/terms/[termId]/shifts/generate/route.ts`（`s`, `h`, `e`, `r`, `tx`）
- `src/app/api/terms/[termId]/shifts/pdf/route.ts`（`h`, `e`）
- `src/app/api/terms/[termId]/shifts/route.ts`（`h`, `e`, `s`）
- `src/app/api/terms/[termId]/shifts/save/route.ts`（`s`, `e`, `tx`, `h`）
- `src/app/api/terms/[termId]/snapshots/[id]/restore/route.ts`（`s`, `tx`, `h`）
- `src/app/api/terms/[termId]/snapshots/route.ts`（`s`）
- `src/app/api/terms/[termId]/status/route.ts`（`s`, `e`）
- `src/app/api/terms/bulk/route.ts`（`et`, `tx`, `t`）
- `src/app/api/terms/route.ts`（`t`）

### 原因③：`Set<unknown>` 型不一致（TS2322/TS2345）

原因①により Prisma 型が存在しない状態で推論が `unknown` になり、`Set<string>` として宣言した変数に代入できなくなっている。原因①を解消すれば連鎖的に解消される可能性が高い。

対象ファイル：

- `src/app/api/terms/[termId]/shifts/generate/route.ts`（L156, L201）
- `src/app/api/terms/[termId]/shifts/pdf/route.ts`（L69）
- `src/app/api/terms/[termId]/shifts/save/route.ts`（L155）
- `src/app/api/terms/[termId]/snapshots/[id]/restore/route.ts`（L156）

---

## 3. 修正計画

### Step 1：CI ワークフローに `prisma generate` を追加（優先度：高）

`.github/workflows/` のワークフローファイルを修正し、`npm ci` の直後に `npx prisma generate` を追加する。

**修正イメージ（`.github/workflows/ci.yml` 等）:**

```yaml
- name: Install dependencies
  run: npm ci

# ↓ この1ステップを追加
- name: Generate Prisma Client
  run: npx prisma generate

- name: Run check
  run: npm run check
```

**期待効果**: 原因①が解消され、それに起因する ③ の `Set<unknown>` エラーも多くが連鎖解消される。

---

### Step 2：コールバック引数への型注釈追加（優先度：高）

各ファイルのコールバック引数に Prisma の生成型または適切な型を明示する。

**修正パターン例（`dashboard/route.ts`）:**

```typescript
// Before（エラー）
shifts.map(s => s.staffId)

// After（修正）
import type { Shift } from '@prisma/client'
shifts.map((s: Shift) => s.staffId)
```

**`$transaction` コールバックの例:**

```typescript
// Before（エラー）
prisma.$transaction(async tx => { ... })

// After（修正）
import type { Prisma } from '@prisma/client'
prisma.$transaction(async (tx: Prisma.TransactionClient) => { ... })
```

---

### Step 3：ローカルで `npm run check` を実行して全パス確認

修正後、プッシュ前に必ずローカルで以下を実行し、エラーゼロを確認する。

```bash
npm run db:generate   # prisma generate を先に実行
npm run check         # lint + typecheck + build
```

---

### Step 4：修正をプッシュして CI の通過を確認

```bash
git push -u origin <ブランチ名>
```

GitHub Actions で `check` ジョブが ✅ になることを確認する。

---

## 4. プッシュ前にローカルで防げたこと

| 問題 | ローカルでの防止策 |
|------|------------------|
| `any` 型エラー | `npm run check` をプッシュ前に必ず実行する（CLAUDE.md のルール通り） |
| `Set<unknown>` 型不一致 | 同上。`prisma generate` 後に `tsc --noEmit` を実行すれば検出可能 |
| CI での `prisma generate` 未実行 | ワークフローファイルを新規作成・変更した際に、`prisma generate` ステップの有無を確認する |

---

## 5. 警告（影響なし）

以下はエラーではなく警告のため、CI の失敗とは無関係。ただし将来的には修正が望ましい。

| ファイル | 内容 |
|---------|------|
| `src/lib/statistics/shift-statistics.ts:13` | `'_dates'` is defined but never used |
| `tests/validators/staff.test.ts:60` | `'_'` is assigned a value but never used |
| GitHub Actions Node.js 20 deprecation | 2026年6月以降、Node.js 24 がデフォルトになる。`actions/checkout@v4`, `actions/setup-node@v4` を最新版に更新推奨 |

---

## 6. 作業ブランチ

```bash
git checkout -b fix/ci-prisma-typecheck
```

---

*本計画書は GitHub Actions ログ（run #23903292717）の解析に基づいて作成。*
