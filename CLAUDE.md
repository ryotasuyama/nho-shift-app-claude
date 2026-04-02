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

## 並列開発（Git Worktree）

複数の機能・修正を同時に開発する場合、Git Worktree を使って並列作業する。

### セットアップ

```bash
# ターミナル1: 認証機能を開発
git worktree add ~/projects/nho-shift-app-claude-auth feature/auth
cd ~/projects/nho-shift-app-claude-auth
claude

# ターミナル2: UI修正を並行して開発
git worktree add ~/projects/nho-shift-app-claude-ui feature/ui-redesign
cd ~/projects/nho-shift-app-claude-ui
claude

# ターミナル3: バグ修正も同時に
git worktree add ~/projects/nho-shift-app-claude-fix fix/critical-bug
cd ~/projects/nho-shift-app-claude-fix
claude
```

### ディレクトリ構成

```
~/projects/
├── nho-shift-app-claude/         # メイン（mainブランチ）
├── nho-shift-app-claude-auth/    # feature/auth
├── nho-shift-app-claude-ui/      # feature/ui-redesign
└── nho-shift-app-claude-fix/     # fix/critical-bug
```

### ワークフロー

1. 各 Worktree のブランチで作業・コミットする
2. 全てのコミットが完了したら、プッシュコマンドを出力する（**Claude は push を実行しない**）
3. ユーザーが手動でプッシュし、GitHub 上で PR を作成・マージする
4. プッシュ完了後、ローカルブランチと Worktree を削除する（**プッシュ前に削除するとコミットが失われる**）

- **プッシュコマンド出力**: 作業完了時に `git push -u origin <ブランチ名>` を表示する。ユーザーが手動で実行する
- **プッシュ後のクリーンアップ**: ユーザーからプッシュ完了の通知を受けたら、以下のコマンドを表示する
  ```bash
  git worktree remove ~/projects/nho-shift-app-claude-<名前>
  git branch -d <ブランチ名>
  ```
