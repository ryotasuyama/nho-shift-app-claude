# 開発セットアップガイド

# NHO 看護師シフト管理アプリ — 開発セットアップ

NHO シフト管理アプリの開発環境構築手順書。新規参画者はこのドキュメントに従って初期セットアップを行う。

> **技術詳細:** 技術スタック・アーキテクチャの詳細は `docs/06_技術スタック・アーキテクチャ設計書.md` を参照。

---

## 目次

### Part 1: 技術スタック・ルール

1. [技術スタック](#1-技術スタック)
2. [TypeScript厳格ルール](#2-typescript厳格ルール)
3. [コーディング規約](#3-コーディング規約)
4. [ディレクトリ構造](#4-ディレクトリ構造)
5. [命名規則](#5-命名規則)

### Part 2: プロジェクトセットアップ

6. [前提条件](#6-前提条件)
7. [Next.jsプロジェクト作成](#7-nextjsプロジェクト作成)
8. [ESLint・Prettier設定](#8-eslintprettier設定)
9. [Git・GitHub設定](#9-gitgithub設定)

### Part 3: Supabase・Prisma統合

10. [Supabaseプロジェクト作成](#10-supabaseプロジェクト作成)
11. [Prismaセットアップ](#11-prismaセットアップ)
12. [認証システム構築](#12-認証システム構築)
13. [データベース設計・マイグレーション](#13-データベース設計マイグレーション)

### Part 4: CI/CD・デプロイ

14. [CI/CD構築](#14-cicd構築)
15. [環境変数管理](#15-環境変数管理)
16. [Vercelデプロイ](#16-vercelデプロイ)

### Part 5: 品質管理

17. [テスト戦略](#17-テスト戦略)
18. [セキュリティチェックリスト](#18-セキュリティチェックリスト)
19. [ドキュメント管理](#19-ドキュメント管理)

---

# Part 1: 技術スタック・ルール

## 1. 技術スタック

### コア技術

| **カテゴリ** | **技術** | **バージョン** | **用途** |
| --- | --- | --- | --- |
| フレームワーク | Next.js (App Router) | 14.x | フルスタックReact |
| 言語 | TypeScript | 5.x | 型安全な開発 |
| UIライブラリ | Tailwind CSS + shadcn/ui | 3.x / latest | ユーティリティCSS + コンポーネント |
| 状態管理 | Zustand | 4.x | シフトグリッド編集の軽量・高速な状態管理 |
| ORM | Prisma | 7.x | 型安全なDB操作 |
| データベース | Supabase (PostgreSQL 15) | — | マネージドDB |
| 認証 | Supabase Auth | — | Email + Password認証。JWT自動管理 |
| バリデーション | Zod | 4.x | フロント/バック共通のスキーマ検証 |
| PDF生成 | @react-pdf/renderer | 3.x | サーバーサイドPDF生成 |

> **Zod v4 注意:** `errorMap` は使用不可。`ZodError.issues` を使用すること（v3 の `.errors` は廃止）。

> **Prisma 7 注意:** `prisma generate` 実行前は `@prisma/client` の型が存在しない。implicit any エラーは想定内。

### 開発ツール

| **カテゴリ** | **技術** | **用途** |
| --- | --- | --- |
| リンター | ESLint | コード品質 |
| フォーマッター | Prettier | コード整形 |
| テスト | Vitest | ユニット・制約テスト |
| テストUI | Testing Library | コンポーネントテスト |
| E2Eテスト | Playwright | 主要ユースケースのE2Eテスト |
| Git hooks | husky + lint-staged | コミット前チェック |

### 選定理由

- **Next.js App Router**: サーバーコンポーネント、Vercel との親和性が最高
- **Prisma**: 型安全なDB操作。Supabase PostgreSQL との接続実績。Supabase Client SDK ではなく Prisma 経由で全 DB 操作を行う
- **Supabase Auth**: Email/Password 認証 + JWT 自動管理。RLS連携。認証のみ Supabase SDK を使用
- **Zustand**: シフトグリッドの Undo/Redo・isDirty・リアルタイム制約チェックに最適な軽量ステート管理
- **Zod v4**: ランタイムバリデーション + TypeScript型推論。フロント/バック共通スキーマ
- **shadcn/ui**: Tailwind ベースの高品質コンポーネント。コピーして使うためカスタマイズ自由

---

## 2. TypeScript厳格ルール

### ⚠️ 絶対に守るルール

### 2.1 `any`は禁止

```tsx
// ❌ 絶対にダメ
function process(data: any) { ... }
const result: any = fetchData();

// ✅ 正しい
function process(data: unknown) { ... }
function process<T>(data: T) { ... }

interface MyData { field: string; }
const result: MyData = fetchData();
```

### 2.2 型アサーション(`as`)は原則禁止

```tsx
// ❌ 避ける
const user = data as User;
const element = document.getElementById("app") as HTMLDivElement;

// ✅ 型ガードを使う
function isUser(data: unknown): data is User {
  return typeof data === "object" && data !== null && "id" in data;
}

if (isUser(data)) {
  // ここでdataはUser型
}

// ✅ nullチェックを使う
const element = document.getElementById("app");
if (element instanceof HTMLDivElement) {
  // ここでelementはHTMLDivElement型
}
```

### 2.3 例外: `as`が許可されるケース

```tsx
// ✅ JSONBカラムの型キャスト(Prismaから取得した値)
const snapshotData = snapshot.data as unknown as ShiftSnapshotData;

// ✅ Zodでバリデーション済みの値
const validated = schema.parse(data);  // Zodが型を保証
```

### 2.4 未使用変数はエラー

```tsx
// ❌ エラーになる
const unused = "value";  // 使われていない

// ✅ 意図的に無視する場合はアンダースコア
const [_ignored, used] = tuple;
function handler(_event: Event) { ... }
```

### tsconfig.json 推奨設定

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## 3. コーディング規約

### 3.1 関数の書き方

```tsx
// ✅ 名前付きエクスポート + アロー関数(コンポーネント以外)
export const calculateTotal = (items: Item[]): number => {
  return items.reduce((sum, item) => sum + item.price, 0);
};

// ✅ React コンポーネントは function 宣言
export default function UserProfile({ user }: { user: User }) {
  return <div>{user.name}</div>;
}

// ✅ 非同期関数
export const fetchUser = async (id: string): Promise<User | null> => {
  const response = await fetch(`/api/users/${id}`);
  if (!response.ok) return null;
  return response.json();
};
```

### 3.2 エラーハンドリング

```tsx
// ✅ Result型パターン(推奨)
type Result<T, E = string> =
  | { success: true; data: T }
  | { success: false; error: E };

export const createStaff = async (
  input: StaffInput
): Promise<Result<Staff>> => {
  try {
    const staff = await prisma.staff.create({ data: input });
    return { success: true, data: staff };
  } catch (error) {
    console.error("Failed to create staff:", error);
    return { success: false, error: "スタッフの作成に失敗しました" };
  }
};

// 使用側
const result = await createStaff(input);
if (!result.success) {
  showError(result.error);
  return;
}
const staff = result.data;  // 型安全
```

### 3.3 Zodバリデーション（v4）

```tsx
import { z } from "zod/v4";

// ✅ スキーマ定義
export const staffSchema = z.object({
  staff_code: z.string().min(2).max(10).regex(/^[a-zA-Z0-9]+$/),
  name: z.string().min(1).max(30),
  email: z.email(),
  experience_years: z.int().min(1).max(50),
  team: z.enum(["A", "B"]),
  night_shift_available: z.boolean().default(true),
});

// ✅ 型推論
export type StaffInput = z.infer<typeof staffSchema>;

// ✅ バリデーション（v4: issuesを使用）
const result = staffSchema.safeParse(data);
if (!result.success) {
  const issues = result.error.issues;
  return { errors: issues };
}
const validData = result.data;  // StaffInput型
```

### 3.4 APIルート

```tsx
// src/app/api/staffs/route.ts
import { NextResponse } from "next/server";
import { staffSchema } from "@/lib/validators/staff";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Zodバリデーション
    const result = staffSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "入力値が不正です",
            details: result.error.issues,
          },
        },
        { status: 400 }
      );
    }

    // Prisma でDB操作
    const staff = await prisma.staff.create({
      data: result.data,
    });

    return NextResponse.json(
      { data: staff, meta: { timestamp: new Date().toISOString() } },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/staffs error:", error);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "サーバー内部エラー" } },
      { status: 500 }
    );
  }
}
```

> **レスポンス形式:** 成功時は `{ data, meta }` 、エラー時は `{ error: { code, message, details? } }` を統一する（`docs/05_API設計書.md` §1.3 参照）。

### 3.5 コンポーネント

```tsx
// ✅ shadcn/ui ベースのコンポーネント
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type ShiftCellProps = {
  shiftType: ShiftType;
  isViolation?: boolean;
  onClick?: () => void;
};

export default function ShiftCell({
  shiftType,
  isViolation = false,
  onClick,
}: ShiftCellProps) {
  return (
    <button
      className={cn(
        "w-10 h-10 text-center text-sm font-medium rounded",
        shiftType === "day" && "bg-white",
        shiftType === "evening" && "bg-yellow-100",
        shiftType === "night" && "bg-blue-100",
        shiftType === "off" && "bg-gray-100",
        isViolation && "ring-2 ring-red-500"
      )}
      onClick={onClick}
    >
      {SHIFT_LABELS[shiftType]}
    </button>
  );
}
```

---

## 4. ディレクトリ構造

```
nho-shift-app/
├── .github/
│   └── workflows/
│       └── ci.yml                # PR時のCI(lint, typecheck, test, build)
│
├── docs/                         # 設計書(10ファイル)
│   ├── 01_機能要件定義書.md
│   ├── 02_非機能要件定義書.md
│   ├── ...
│   └── 10_テストケース一覧.md
│
├── prisma/
│   ├── schema.prisma             # スキーマ定義（Supabase接続）
│   ├── migrations/               # マイグレーションファイル
│   └── seed.ts                   # シードデータ
│
├── supabase/
│   ├── config.toml               # Supabase CLI ローカル設定
│   └── migrations/               # RLSポリシー・DB関数等のSQL
│
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   ├── (admin)/
│   │   │   ├── layout.tsx        # 管理者レイアウト（認証ガード）
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── staff/
│   │   │   │   └── page.tsx
│   │   │   ├── terms/
│   │   │   │   └── page.tsx
│   │   │   └── shifts/
│   │   │       └── [termId]/
│   │   │           └── page.tsx
│   │   ├── (staff)/
│   │   │   ├── layout.tsx        # スタッフレイアウト（認証ガード）
│   │   │   ├── home/
│   │   │   │   └── page.tsx
│   │   │   ├── requests/
│   │   │   │   └── page.tsx
│   │   │   └── shifts/
│   │   │       └── [termId]/
│   │   │           └── page.tsx
│   │   ├── (common)/
│   │   │   ├── layout.tsx        # 共通レイアウト（認証済み全ロール）
│   │   │   └── settings/
│   │   │       └── password/
│   │   │           └── page.tsx  # パスワード変更画面（全ユーザー）
│   │   ├── api/                  # Route Handlers（API設計書§2〜§10に対応）
│   │   │   ├── auth/
│   │   │   ├── staffs/
│   │   │   ├── terms/
│   │   │   ├── holidays/
│   │   │   ├── audit-logs/
│   │   │   └── health/
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── middleware.ts              # Supabase JWT検証 Middleware（src/ 直下）
│   │
│   ├── components/
│   │   ├── ui/                   # shadcn/ui コンポーネント
│   │   ├── layout/               # レイアウトコンポーネント
│   │   ├── staff/                # スタッフ管理画面
│   │   ├── shift/                # シフトグリッド関連
│   │   └── term/                 # ターム管理画面
│   │
│   ├── lib/
│   │   ├── prisma.ts             # Prisma Client（Serverless対応シングルトン）
│   │   ├── supabase/
│   │   │   ├── client.ts         # ブラウザ用 Supabase Client（認証のみ）
│   │   │   ├── server.ts         # Server Component / Route Handler用
│   │   │   └── admin.ts          # service_role Client（ユーザー作成等）
│   │   ├── auth.ts               # 認証ヘルパー
│   │   ├── constants.ts          # 定数定義
│   │   └── validators/           # Zod スキーマ
│   │
│   ├── engine/                   # シフト生成エンジン（グリーディ + 局所探索）
│   ├── hooks/                    # カスタムフック
│   ├── stores/                   # Zustand ストア（シフトグリッド状態管理）
│   └── types/                    # 共通型定義
│
├── tests/                        # テストファイル
├── vercel.json                   # Vercel Functions 設定（maxDuration等）
├── .env.local.example            # 環境変数テンプレート
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── vitest.config.ts
```

> **重要:** `middleware.ts` は `src/` 直下に配置する（Next.js の仕様）。`src/app/` の中ではない。

> **DBアクセス方針:** Supabase Client SDK は**認証のみ**に使用する。DB操作はすべて **Prisma Client** 経由で行う。`src/lib/supabase/` に `database.types.ts` は不要（Prisma が型を生成する）。

---

## 5. 命名規則

### 5.1 ファイル・ディレクトリ

| **種類** | **規則** | **例** |
| --- | --- | --- |
| Reactコンポーネント | PascalCase | `ShiftGrid.tsx` |
| ページ | kebab-case (フォルダ) | `shifts/[termId]/page.tsx` |
| ユーティリティ | camelCase | `formatDate.ts` |
| 定数ファイル | camelCase | `constants.ts` |
| 型定義ファイル | camelCase | `types.ts` |
| Zodスキーマ | camelCase | `staff.ts`（validators/配下） |
| テストファイル | `*.test.ts` | `constraintChecker.test.ts` |

### 5.2 変数・関数

| **種類** | **規則** | **例** |
| --- | --- | --- |
| 変数 | camelCase | `staffName`, `isLoading` |
| 定数 | UPPER_SNAKE_CASE | `MAX_REQUESTS_PER_TERM`, `SHIFT_GENERATION_TIMEOUT_MS` |
| 関数 | camelCase + 動詞 | `fetchStaffs`, `generateShifts` |
| イベントハンドラ | handle + 名詞 + 動詞 | `handleCellClick`, `handleSaveSubmit` |
| ブール値 | is/has/can/should + 形容詞/名詞 | `isDirty`, `hasViolations`, `canEdit` |

### 5.3 型・インターフェース

| **種類** | **規則** | **例** |
| --- | --- | --- |
| 型 | PascalCase | `Staff`, `ShiftEntry`, `ApiResponse` |
| Props型 | コンポーネント名 + Props | `ShiftCellProps`, `StaffFormProps` |
| 列挙型 | PascalCase | `ShiftType`, `TermStatus` |
| ジェネリクス | T, K, V または意味のある名前 | `T`, `TData`, `TError` |

### 5.4 DB関連（Prisma スキーマ）

| **種類** | **規則** | **例** |
| --- | --- | --- |
| モデル名 | PascalCase (単数形) | `Staff`, `ShiftEntry` |
| テーブル名 (@@map) | snake_case (複数形) | `staffs`, `shift_entries` |
| カラム名 | snake_case | `created_at`, `staff_id` |
| 外部キー | 参照テーブル単数_id | `user_id`, `term_id` |
| インデックス | idx_テーブル_カラム | `idx_staffs_team` |

---

# Part 2: プロジェクトセットアップ

## 6. 前提条件

### 必要なツール

```bash
# Node.js (v20.x)
node --version  # v20.0.0以上

# npm
npm --version

# Supabase CLI
brew install supabase/tap/supabase
supabase --version

# GitHub CLI
brew install gh
gh auth login
```

### 必要なアカウント

- [Supabase](https://supabase.com/) — 開発用・本番用の2プロジェクト
- [GitHub](https://github.com/) — リポジトリ・Actions
- [Vercel](https://vercel.com/) — デプロイ（**Pro プラン以上**必須: シフト生成に60秒必要）

---

## 7. Next.jsプロジェクト作成

### 7.1 プロジェクト作成

```bash
npx create-next-app@latest nho-shift-app \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd nho-shift-app
```

### 7.2 必須パッケージ

```bash
# Supabase（認証のみ使用）
npm install @supabase/supabase-js @supabase/ssr

# ORM
npm install prisma @prisma/client

# 状態管理
npm install zustand

# バリデーション（v4）
npm install zod

# UIコンポーネント
npm install clsx tailwind-merge
npx shadcn@latest init

# PDF生成
npm install @react-pdf/renderer
```

### 7.3 開発用パッケージ

```bash
# テスト
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom

# E2Eテスト
npm install -D @playwright/test

# Git hooks
npm install -D husky lint-staged

# Prettier
npm install -D prettier eslint-config-prettier
```

### 7.4 package.json scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "check": "npm run lint && npm run typecheck && npm run build",
    "prepare": "husky",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio"
  }
}
```

> **初回セットアップ:** `npm run db:generate` → `prisma migrate dev` → `npm run db:seed` の順で実行。

---

## 8. ESLint・Prettier設定

### 8.1 .eslintrc.json

```json
{
  "extends": [
    "next/core-web-vitals",
    "next/typescript",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }
    ],
    "no-console": ["warn", { "allow": ["error", "warn"] }]
  }
}
```

### 8.2 .prettierrc

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": false,
  "tabWidth": 2,
  "printWidth": 100
}
```

### 8.3 lint-staged設定 (package.json)

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

### 8.4 husky設定

```bash
npx husky init
echo "npx lint-staged" > .husky/pre-commit
```

---

## 9. Git・GitHub設定

### 9.1 .gitignore

```
# dependencies
node_modules/
.pnpm-store/

# next.js
.next/
out/

# production
build/
dist/

# env files
.env
.env.local
.env.*.local
!.env.local.example

# debug
npm-debug.log*
.pnpm-debug.log*

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Supabase
.supabase/

# Prisma
prisma/*.db

# test
coverage/

# misc
*.tsbuildinfo
next-env.d.ts
```

### 9.2 CLAUDE.md テンプレート

```markdown
# CLAUDE.md

## Project Overview

NHO 看護師シフト管理アプリ（MVP）。Next.js 14 + Prisma 7 + Supabase + Zustand。

## Commands

npm run dev          # 開発サーバー起動
npm run build        # 本番ビルド（prisma generate 含む）
npm run lint         # ESLint実行
npm run typecheck    # 型チェック
npm run test         # テスト実行
npm run check        # lint + typecheck + build（コミット前に必ず実行）
npm run db:generate  # Prisma Client 生成
npm run db:migrate   # マイグレーション適用
npm run db:seed      # シードデータ投入

## TypeScript Rules

- `any`は禁止 — ESLintでエラー
- 型アサーション(`as`)は原則禁止 — 型ガードを使用
- 未使用変数はエラー — アンダースコアで明示的に無視

## Architecture

- DB操作: Prisma Client 経由（Supabase Client SDK は認証のみ）
- 認証: Supabase Auth（Email + Password）
- 状態管理: Zustand（シフトグリッド編集状態）
- バリデーション: Zod v4（errorMap 非対応、issues を使用）

## Database

- スキーマ変更は prisma/schema.prisma で管理
- マイグレーションは Prisma Migrate で適用
- RLSポリシーは supabase/migrations/ で管理
```

### 9.3 ブランチ戦略

| **ブランチ** | **用途** |
| --- | --- |
| `main` | 本番環境。直接pushしない |
| `task-N` | 機能単位の開発ブランチ（例: `task-1`, `task-2`） |

---

# Part 3: Supabase・Prisma統合

## 10. Supabaseプロジェクト作成

### ⚠️ 重要: 必ず2つのプロジェクトを作成

| **環境** | **用途** | **命名例** |
| --- | --- | --- |
| 開発用 | ローカル開発・テスト | `nho-shift-dev` |
| 本番用 | 本番環境 | `nho-shift-prod` |

### 10.1 プロジェクト作成

1. https://supabase.com/dashboard にログイン
2. 「New Project」をクリック
3. 設定:
    - **Name**: `nho-shift-dev`
    - **Database Password**: 強力なパスワード(保存必須)
    - **Region**: Tokyo (`ap-northeast-1`)
4. 同様に `nho-shift-prod` も作成

### 10.2 必要情報の取得

Settings → API から:

```
開発用:
- Project URL: https://xxxxxxxxxx.supabase.co
- anon key: eyJhbG...
- service_role key: eyJhbG...
- Reference ID: xxxxxxxxxx (Settings → General)

本番用:
- Project URL: https://yyyyyyyyyy.supabase.co
- anon key: eyJhbG...
- service_role key: eyJhbG...
- Reference ID: yyyyyyyyyy (Settings → General)
```

### 10.3 Supabase Auth 設定

Supabase Dashboard → Authentication → Settings で以下を設定:

| **項目** | **設定** |
| --- | --- |
| Site URL | `http://localhost:3000`（開発用） |
| Email Auth | 有効 |
| Email Confirm | **無効**（管理者がアカウント作成するため不要） |
| JWT expiry | 3600（1時間） |

### 10.4 Supabase CLI セットアップ

```bash
supabase init
supabase link --project-ref $SUPABASE_PROJECT_ID
# パスワード入力を求められる
```

---

## 11. Prismaセットアップ

### 11.1 初期化

```bash
npx prisma init
```

### 11.2 schema.prisma の接続設定

```prisma
// prisma/schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")       // Transaction Pooler (port 6543)
  directUrl = env("DIRECT_URL")         // Session Pooler (port 5432) — Migrate用
}

generator client {
  provider = "prisma-client-js"
}
```

> **Supabase の接続先:**
> - `DATABASE_URL`: Transaction Pooler（port 6543）— Prisma クエリ用（Serverless対応）
> - `DIRECT_URL`: Session Pooler（port 5432）— Prisma Migrate 用

### 11.3 Prisma Client（Serverless対応シングルトン）

**src/lib/prisma.ts**:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_URL },
  },
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
```

### 11.4 主要コマンド

```bash
# Prisma Client の型を生成
npx prisma generate

# マイグレーション作成・適用（開発環境）
npx prisma migrate dev --name <name>

# マイグレーション適用（本番環境）
npx prisma migrate deploy

# シードデータ投入
npx prisma db seed

# Prisma Studio（DBブラウザ）
npx prisma studio
```

---

## 12. 認証システム構築

> **方針:** 認証は Supabase Auth に全面委任する。DB操作は Prisma で行い、Supabase Client SDK は認証のみに使用する。

### 12.1 Supabaseクライアント

**src/lib/supabase/client.ts**（ブラウザ用 — 認証のみ）:

```tsx
import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
```

**src/lib/supabase/server.ts**（Server Component / Route Handler 用）:

```tsx
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const createServerSupabase = () => {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
};
```

**src/lib/supabase/admin.ts**（service_role — ユーザー作成等）:

```tsx
import { createClient } from "@supabase/supabase-js";

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

### 12.2 認証フロー

```
[ログイン]
  Browser → POST /api/auth/login（薄いラッパー）
  Route Handler → supabase.auth.signInWithPassword({ email, password })
  ← Supabase Auth が JWT を返却
  → @supabase/ssr が Cookie に自動保存（レスポンスボディにトークンは含めない）
  → ユーザー情報のみ返却（role, must_change_password 等）

[API リクエスト]
  Browser → Next.js Middleware (src/middleware.ts)
  Middleware: supabase.auth.getUser() で JWT を検証（自動トークンリフレッシュ含む）
  → role を取得
  → 権限不足なら 403 / 未認証なら /login にリダイレクト
  → Route Handler: Prisma で DB 操作（service_role で RLS バイパス）

[スタッフ作成（管理者操作）]
  Route Handler → supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { role: 'staff', staff_id: '...' }
  })
  → Prisma で public.users + staffs テーブルにレコード作成

[パスワード変更]
  Route Handler → supabase.auth.signInWithPassword() で現パスワード検証
  → supabase.auth.updateUser({ password: newPassword })
  → Prisma で public.users.must_change_password を false に更新
```

> **注意:** OAuth/Magic Link は使用しないため、`auth/callback` ルートは不要。

---

## 13. データベース設計・マイグレーション

### 13.1 スキーマ管理の役割分担

| **管理対象** | **ツール** | **ファイル** |
| --- | --- | --- |
| テーブル定義・リレーション | Prisma Migrate | `prisma/schema.prisma` |
| RLSポリシー・DB関数 | Supabase CLI | `supabase/migrations/*.sql` |
| シードデータ | Prisma Seed | `prisma/seed.ts` |

> **理由:** Prisma はテーブル定義とマイグレーションに最適。RLSポリシーは PostgreSQL 固有機能であり Prisma では管理できないため、Supabase CLI で別管理する。

### 13.2 RLS設計原則

Prisma 経由のアクセスは `service_role` キーを使用するため、RLS をバイパスする設計。API Route Handler 内でアプリケーションレベルの認可チェックを実施する。

将来的に Supabase クライアントSDKを直接使用する場合に備え、主要テーブルにRLSポリシーを定義しておく。

```sql
-- staffs: スタッフは自分のレコードのみ参照可
ALTER TABLE public.staffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on staffs"
  ON public.staffs FOR ALL
  USING (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Staff can view own record"
  ON public.staffs FOR SELECT
  USING (auth.uid() = user_id);
```

### 13.3 型の使用（Prisma）

```tsx
// Prisma が自動生成する型を使用
import type { Staff, Term, ShiftEntry } from "@prisma/client";

// カスタム型が必要な場合は src/types/ に定義
import type { ShiftType, TermStatus } from "@/types/shift";
```

> **Supabase の `database.types.ts` は不要。** DB型は Prisma Client が `prisma generate` で自動生成する。

---

# Part 4: CI/CD・デプロイ

## 14. CI/CD構築

### 14.1 PR時のCI

**.github/workflows/ci.yml**:

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
```

### 14.2 DBマイグレーション（本番）

本番 DB へのマイグレーション適用は手動で行う（MVP フェーズ）。

```bash
# 本番DBへのマイグレーション適用
DATABASE_URL=<prod-transaction-pooler-url> \
DIRECT_URL=<prod-session-pooler-url> \
npx prisma migrate deploy
```

> **Supabase CLI のマイグレーション:** RLSポリシー等のSQL は `supabase db push` で別途適用する。

### ⚠️ GitHub Secrets設定

| **Secret** | **値** | **注意** |
| --- | --- | --- |
| `DATABASE_URL` | 本番 Transaction Pooler URL | **絶対に開発用を設定しない** |
| `DIRECT_URL` | 本番 Session Pooler URL | マイグレーション用 |

---

## 15. 環境変数管理

### .env.local.example

```bash
# Supabase (開発用)
NEXT_PUBLIC_SUPABASE_URL=https://your-dev-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database (Supabase PostgreSQL)
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.<project-ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres

# Application
SHIFT_GENERATION_TIMEOUT_MS=55000

# Monitoring (optional)
SENTRY_DSN=https://...@sentry.io/...
```

---

## 16. Vercelデプロイ

### プロジェクト設定

| **項目** | **設定** |
| --- | --- |
| Framework | Next.js（自動検出） |
| Build Command | `prisma generate && next build` |
| Output Directory | `.next` |
| Node.js Version | 20.x |
| リージョン | `hnd1`（東京）推奨 |

### ⚠️ Pro プラン必須

シフト自動生成機能は最大60秒を要するため、Vercel **Pro プラン以上**が必要。Hobby プランでは10秒でタイムアウトする。

### 環境変数設定（Vercel Dashboard）

| **変数** | **値** |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 本番Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 本番anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | 本番service_role key |
| `DATABASE_URL` | 本番 Transaction Pooler URL |
| `DIRECT_URL` | 本番 Session Pooler URL |
| `SHIFT_GENERATION_TIMEOUT_MS` | `55000` |

### vercel.json

```json
{
  "functions": {
    "src/app/api/terms/[termId]/shifts/generate/route.ts": {
      "maxDuration": 60
    },
    "src/app/api/terms/[termId]/shifts/pdf/route.ts": {
      "maxDuration": 30
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" }
      ]
    }
  ]
}
```

---

# Part 5: 品質管理

## 17. テスト戦略

### 17.1 vitest.config.ts

```tsx
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### 17.2 テストカテゴリ

| **種類** | **対象** | **ツール** | **カバレッジ目標** |
| --- | --- | --- | --- |
| ユニット | ビジネスロジック（制約チェック等） | Vitest | 80%以上 |
| 結合テスト | API エンドポイント | Vitest + Supertest | — |
| 制約テスト | シフト生成エンジンの全ハード制約 | Vitest（専用テストスイート） | 100%（ハード制約） |
| コンポーネント | Reactコンポーネント | Testing Library | — |
| E2E | 主要ユースケース | Playwright | — |

> **テストケース詳細:** `docs/10_テストケース一覧.md` を参照。

---

## 18. セキュリティチェックリスト

### 初期セットアップ

- [ ] 開発/本番で別Supabaseプロジェクト
- [ ] `.env.local`が`.gitignore`に含まれる
- [ ] `service_role`キーがクライアントコード（`NEXT_PUBLIC_`なし）で使用されていない
- [ ] `SUPABASE_SERVICE_ROLE_KEY` が `src/lib/supabase/admin.ts` のみで使用

### 認証

- [ ] Middleware で保護ルート設定（`/admin/*` は admin ロールのみ）
- [ ] `must_change_password = true` 時のアクセス制限
- [ ] パスワードポリシー（英数字混在8文字以上）の Zod スキーマ定義

### DB

- [ ] 主要テーブルで RLS 有効（将来の Supabase Client 直接使用に備え）
- [ ] Prisma の `service_role` 接続で RLS バイパスを確認
- [ ] 楽観的ロック（`lock_version`）が shift save API で機能

### デプロイ前

- [ ] `npm run check` が通る
- [ ] 本番環境変数が Vercel Dashboard に設定済み
- [ ] `vercel.json` の `maxDuration` 設定を確認

---

## 19. ドキュメント管理

### 必須ドキュメント

| **ファイル** | **内容** | **更新タイミング** |
| --- | --- | --- |
| `CLAUDE.md` | AI向け開発ガイド | 構造変更時 |
| `setup.md` | 開発セットアップガイド（本ファイル） | セットアップ手順変更時 |
| `docs/01〜10_*.md` | 設計書（10ファイル） | 設計変更時 |
| `prisma/schema.prisma` | DBスキーマ | スキーマ変更時 |
| `.env.local.example` | 環境変数テンプレート | 変数追加時 |

---

## クイックスタートチェックリスト

新規参画者向け:

1. [ ] リポジトリ clone
2. [ ] Node.js 20.x インストール
3. [ ] `npm install`
4. [ ] `.env.local.example` をコピーして `.env.local` 作成、値を設定
5. [ ] `npm run db:generate`（Prisma Client 生成）
6. [ ] `npx prisma migrate dev`（マイグレーション適用）
7. [ ] `npm run db:seed`（シードデータ投入）
8. [ ] `npm run dev` で開発サーバー起動
9. [ ] `npm run check` が通ることを確認

---

*このドキュメントは NHO 看護師シフト管理アプリの開発セットアップ用に作成されました。汎用テンプレートではなく、本プロジェクト固有の設定を反映しています。*
