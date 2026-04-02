# CLAUDE.md

## Workflow Rules

- **ブランチ必須**: コード変更前に必ず新しいブランチを作成する。`main` ブランチで直接編集しない
- **ブランチ命名**: `feature/〇〇`のように、変更内容がわかる名前を自分で決める
- **コミット前チェック**: コミット前に `npm run check`（lint + typecheck + build）を必ず実行し、全てパスすることを確認する
- **コミットメッセージ**: 変更内容を簡潔に日本語で記述する
- **小さな単位でコミット**: 1つの論理的な変更ごとにコミットする。大きな変更を1コミットにまとめない
- **既存コードの尊重**: 依頼された変更以外のコード（フォーマット修正、リファクタリング等）を勝手に変更しない
- **確認してから変更**: ファイルを編集する前に必ず現在の内容を読み、既存の実装を理解してから変更する
- **テスト**: 既存テストが壊れないことを確認する。機能追加時はテストも追加する
- **環境変数・秘密情報**: `.env` ファイルや認証情報を含むファイルをコミットしない
- **破壊的操作の禁止**: `git push --force`、`git reset --hard`、ファイル削除などは明示的に指示されない限り実行しない

## Project Overview

NHO 看護師シフト管理アプリ（MVP）。Next.js 16 + Prisma 7 + Supabase + Zustand。

## Commands

```
npm run dev          # 開発サーバー起動
npm run build        # 本番ビルド（prisma generate 含む）
npm run lint         # ESLint実行
npm run typecheck    # 型チェック
npm run test         # テスト実行
npm run check        # lint + typecheck + build（コミット前に必ず実行）
npm run db:generate  # Prisma Client 生成
npm run db:migrate   # マイグレーション適用
npm run db:seed      # シードデータ投入
```

## TypeScript Rules

- `any`は禁止 — ESLintでエラー
- 型アサーション(`as`)は原則禁止 — 型ガードを使用
- 未使用変数はエラー — アンダースコアで明示的に無視

## Architecture

- DB操作: Prisma Client 経由（Supabase Client SDK は認証のみ）
- 認証: Supabase Auth（Email + Password）
- 状態管理: Zustand（シフトグリッド編集状態）
- バリデーション: Zod v4（errorMap 非対応、issues を使用）

## Prisma 7 Notes

- `datasource` の `url` / `directUrl` は `prisma/prisma.config.ts` で管理
- `prisma generate` 実行前は `@prisma/client` の型なし → implicit any エラーは想定内
- PrismaClient のコンストラクタに接続文字列を直接渡す

## Database

- スキーマ変更は prisma/schema.prisma で管理
- マイグレーションは Prisma Migrate で適用
