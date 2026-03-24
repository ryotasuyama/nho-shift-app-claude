# フロア（階）対応 — テーブル設計・全体設計の改修プラン

## Context

現在のシフト管理アプリは「全スタッフで1つのシフト表」という設計。病院では階ごとに管理者・スタッフ・シフト表が独立しているため、フロア単位でのシフト管理が必要。

**ゴール**: 各フロア（1階、2階、3階…）が独立したシフト表を持ち、フロア管理者がそれぞれ管理できるようにする。

**前提**:
- `floor_admin` は管理専任（Staff レコードを持たない）。自身もシフトに入るケースは MVP 後の拡張とする
- `floor_admin` の作成は専用フロー（`POST /api/users` で User のみ作成、Staff レコードは作らない）。詳細は Phase 3 参照
- フロア削除はソフトデリート（`is_active = false`）。進行中の Term やアクティブなスタッフが存在するフロアは削除不可
- スタッフのフロア異動は MVP では「進行中の期間がないスタッフのみ異動可能」とする（詳細は Phase 3 参照）
- Holiday（祝日）テーブルはグローバルのまま変更しない（全フロア共通の祝日カレンダーを使用）
- Term の日程はフロアごとに独立（同一日程の Term が複数フロアに存在可能）。全フロア共通の28日サイクルを想定するが、DB レベルでは強制しない

---

## Phase 1: スキーマ変更

### 1-1. 新テーブル: `floors`

```prisma
model Floor {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name       String   @db.VarChar(60)   // "1階", "2階東" など
  sort_order Int      @default(0)
  is_active  Boolean  @default(true)
  created_at DateTime @default(now())
  updated_at DateTime @default(now()) @updatedAt

  staffs Staff[]
  terms  Term[]
  admins FloorAdmin[]

  @@map("floors")
}
```

### 1-2. 新テーブル: `floor_admins`（管理者とフロアの紐付け）

```prisma
model FloorAdmin {
  id       String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id  String @db.Uuid
  floor_id String @db.Uuid

  user  User  @relation(fields: [user_id], references: [id])
  floor Floor @relation(fields: [floor_id], references: [id])

  @@unique([user_id, floor_id], name: "uk_floor_admins")
  @@map("floor_admins")
}
```

### 1-3. Role enum 置換

旧 enum (`admin`, `staff`) を新 enum (`super_admin`, `floor_admin`, `staff`) に**完全に置換**する。

> PostgreSQL は既存 enum 値の削除・リネームをサポートしないため、`ALTER TYPE ADD VALUE` ではなく新型作成→置換→旧型 DROP で対応する。

```prisma
enum Role {
  super_admin    // 全フロア管理（旧 admin）
  floor_admin    // 特定フロアのみ管理（新規）
  staff          // 既存
}
```

### 1-4. 既存テーブルへの `floor_id` 追加

- **Staff**: `floor_id String @db.Uuid` + relation + index
- **Term**: `floor_id String @db.Uuid` + relation + index
- **AuditLog**: `floor_id String? @db.Uuid`（nullable、フロア関連操作時に記録。FK 制約なし — 監査ログはフロアのソフトデリート後も参照可能であるべきため）+ **インデックス追加**（`floor_id` での絞り込みクエリに対応）
- ShiftEntry, ShiftRequest, ShiftSnapshot は Term/Staff 経由で間接的にフロアに紐づくため直接の変更不要

### 1-5. マイグレーション手順

**`prisma migrate dev --create-only` で空のマイグレーションを作成し、生成された `migration.sql` に以下の SQL を記述する**。手書き SQL と Prisma スキーマの整合性を保つため、必ず `schema.prisma` の変更を先に行い、`--create-only` で SQL だけ生成 → 手書き編集 → `prisma migrate dev` で適用の順序を守ること。

> **注意: メンテナンスウィンドウが必要**。Step 5 の enum 置換（`DROP TYPE "Role"` → `RENAME`）の間にアプリがアクセスすると型エラーになる。マイグレーション適用中はアプリを停止するか、メンテナンスモードに切り替えること。

```sql
-- Step 1: Floor, FloorAdmin テーブル作成
CREATE TABLE floors (...);
CREATE TABLE floor_admins (...);

-- Step 2: Staff/Term/AuditLog に nullable floor_id 追加
ALTER TABLE staffs ADD COLUMN floor_id UUID;
ALTER TABLE terms ADD COLUMN floor_id UUID;
ALTER TABLE audit_logs ADD COLUMN floor_id UUID;

-- Step 3: デフォルトフロア作成 → 既存データ紐付け
-- NOTE: ORDER BY で確定的な行を取得（複数環境での再現性を担保）
INSERT INTO floors (id, name, sort_order) VALUES (gen_random_uuid(), 'デフォルト', 0);
UPDATE staffs SET floor_id = (SELECT id FROM floors ORDER BY created_at ASC LIMIT 1);
UPDATE terms SET floor_id = (SELECT id FROM floors ORDER BY created_at ASC LIMIT 1);

-- Step 4: NOT NULL 制約 + FK + インデックス追加
ALTER TABLE staffs ALTER COLUMN floor_id SET NOT NULL;
ALTER TABLE terms ALTER COLUMN floor_id SET NOT NULL;
ALTER TABLE staffs ADD CONSTRAINT fk_staffs_floor FOREIGN KEY (floor_id) REFERENCES floors(id);
ALTER TABLE terms ADD CONSTRAINT fk_terms_floor FOREIGN KEY (floor_id) REFERENCES floors(id);
CREATE INDEX idx_staffs_floor_id ON staffs(floor_id);
CREATE INDEX idx_terms_floor_id ON terms(floor_id);
CREATE INDEX idx_audit_logs_floor_id ON audit_logs(floor_id);

-- Step 5: Role enum 完全置換（ADD VALUE ではなく型の作り直し）
-- ⚠️ この間はアプリを停止すること（DROP〜RENAME の間に参照されると型エラー）
CREATE TYPE "Role_new" AS ENUM ('super_admin', 'floor_admin', 'staff');
ALTER TABLE users
  ALTER COLUMN role TYPE "Role_new"
  USING (
    CASE
      WHEN role::text = 'admin' THEN 'super_admin'::"Role_new"
      ELSE role::text::"Role_new"
    END
  );
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
```

### 1-6. Supabase Auth metadata 同期（重要）

Prisma だけでなく **Supabase Auth の `user_metadata.role` も更新が必要**。
middleware は `user.user_metadata?.role` を参照しているため、ここが不整合だとルーティングが壊れる。

#### 実行順序（厳守）

1. **アプリ停止**（メンテナンスモード）
2. **DB マイグレーション適用**（`prisma migrate dev`）— enum 置換を含む
3. **アプリデプロイ**（新コード。middleware に `admin → super_admin` フォールバックあり）
4. **Supabase Auth metadata 同期スクリプト実行**（下記）
5. **動作確認**

> Step 3 → 4 の間にユーザーがログインした場合、middleware の `parseRole()` が `admin` を `super_admin` にフォールバックするため、ルーティングは正常に動作する。API 層は Prisma DB を参照するため影響なし。

```typescript
// マイグレーションスクリプト（Step 4 で実行）
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(url, serviceRoleKey)
const { data: users } = await supabaseAdmin.auth.admin.listUsers()

for (const user of users.data) {
  if (user.user_metadata?.role === 'admin') {
    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: { role: 'super_admin' }
    })
  }
}
```

### 1-7. ロール変更時の同期ルール（運用）

初回マイグレーションだけでなく、**運用中のロール変更でも Prisma DB と Supabase metadata の同期が必要**。ロールを変更する全ての API で以下を徹底する:

```typescript
// ロール変更時は必ず両方を更新
await prisma.user.update({ where: { id: userId }, data: { role: newRole } });
await supabaseAdmin.auth.admin.updateUserById(userId, {
  user_metadata: { role: newRole }
});
```

---

## Phase 2: 認可・権限モデル

### 対象ファイル
- `src/lib/api/auth-guard.ts`
- `src/middleware.ts`

### 変更内容

**auth-guard.ts**:

#### ロールの Source of Truth を Prisma DB に統一

現状 `getAuthUser()` は Supabase metadata からロールを取得しているが、Prisma DB を正とするように変更する。middleware は Supabase metadata のまま（高速パス）とし、API 層で Prisma DB から正確なロールを取得する2層構造にする。

```typescript
type AuthResult = {
  userId: string;
  role: "super_admin" | "floor_admin" | "staff";
  email: string;
};

export const getAuthUser = async (): Promise<AuthResult | null> => {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Prisma DB を正とする（Supabase metadata はキャッシュ的位置づけ）
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  return {
    userId: user.id,
    role: dbUser?.role ?? 'staff',
    email: user.email ?? '',
  };
};
```

#### 新規ヘルパー

- `requireSuperAdmin()` 新規追加
- `requireFloorAccess(user, floorId)` 新規追加 — **全 API で共通利用するフロア認可ヘルパー**
- `requireAdminAny()` 新規追加（super_admin + floor_admin 両方通過）
- 既存の `requireAdmin()` → `requireAdminAny()` にリネーム

#### `requireFloorAccess` の実装（既存パターンに統一 + デフォルト拒否）

```typescript
// フロア認可の共通ヘルパー（全 API で使用）
// 既存の { error } パターンに統一。末尾にデフォルト拒否を設ける。
export const requireFloorAccess = async (
  user: AuthResult,
  floorId: string
): Promise<{ error: NextResponse | null }> => {
  if (user.role === 'super_admin') {
    return { error: null }; // 全フロアOK
  }

  if (user.role === 'floor_admin') {
    const access = await prisma.floorAdmin.findUnique({
      where: { uk_floor_admins: { user_id: user.userId, floor_id: floorId } }
    });
    if (!access) {
      return { error: errorResponse(ERROR_CODES.FORBIDDEN.code, 'このフロアへのアクセス権がありません', ERROR_CODES.FORBIDDEN.status) };
    }
    return { error: null };
  }

  if (user.role === 'staff') {
    const staff = await prisma.staff.findFirst({
      where: { user_id: user.userId, floor_id: floorId }
    });
    if (!staff) {
      return { error: errorResponse(ERROR_CODES.FORBIDDEN.code, 'このフロアへのアクセス権がありません', ERROR_CODES.FORBIDDEN.status) };
    }
    return { error: null };
  }

  // デフォルト拒否（未知のロールは常に拒否）
  return { error: errorResponse(ERROR_CODES.FORBIDDEN.code, 'アクセス権がありません', ERROR_CODES.FORBIDDEN.status) };
};
```

**呼び出し側パターン**:
```typescript
const { user, error: authError } = await requireAdminAny();
if (authError) return authError;
const { error: floorError } = await requireFloorAccess(user!, floorId);
if (floorError) return floorError;
```

**middleware.ts**:
- `parseRole()` を3値対応。**`admin` → `super_admin` のフォールバックを恒久的に残す**（metadata 更新漏れへの安全策）

```typescript
function parseRole(value: unknown): "super_admin" | "floor_admin" | "staff" {
  if (value === 'super_admin' || value === 'admin') return 'super_admin';
  if (value === 'floor_admin') return 'floor_admin';
  return 'staff';
}
```

- admin パス: `super_admin` と `floor_admin` 両方許可
- **`/admin/floors` は middleware レベルで `super_admin` のみに制限する**（API 側の制御だけでは、`floor_admin` がページにアクセスした際に空の管理画面が表示されてしまうため）

```typescript
// middleware.ts — super_admin 専用パスの制御
const superAdminOnlyPaths = ['/admin/floors'];
if (superAdminOnlyPaths.some(p => pathname.startsWith(p)) && role !== 'super_admin') {
  return NextResponse.redirect(new URL('/dashboard', request.url));
}
```

> **Note**: auth-guard.ts は Prisma DB から直接ロールを取得するため、`admin → super_admin` のフォールバックは不要（DB のマイグレーションで admin は消滅済み）。フォールバックが必要なのは Supabase metadata を参照する middleware のみ。

---

## Phase 3: API 変更

### 新規 API
| エンドポイント | メソッド | 権限 | 目的 |
|---|---|---|---|
| `/api/floors` | GET | `requireAdminAny()` | フロア一覧（ロールに応じてフィルタ）。スタッフはセッション API の `floors` で十分なため対象外 |
| `/api/floors` | POST | `requireSuperAdmin()` | フロア作成 |
| `/api/floors/[id]` | PUT | `requireSuperAdmin()` | フロア編集 |
| `/api/floors/[id]` | DELETE | `requireSuperAdmin()` | フロア無効化（ソフトデリート） |
| `/api/floors/[id]/admins` | GET/POST/DELETE | `requireSuperAdmin()` | フロア管理者の割当 |
| `/api/users` | POST | `requireSuperAdmin()` | floor_admin 専用ユーザー作成（User のみ、Staff レコードなし） |
| `/api/users/[id]/role` | PUT | `requireSuperAdmin()` | ユーザーのロール変更 |

**`GET /api/floors` のロール別レスポンス:**
- `super_admin`: 全フロア返却
- `floor_admin`: `floor_admins` テーブルで紐付いたフロアのみ

**`DELETE /api/floors/[id]` のビジネスルール:**
```typescript
// 削除前チェック（TermStatus enum を使用して型安全に）
const activeTerms = await prisma.term.count({
  where: { floor_id: floorId, status: { not: TermStatus.confirmed } }
});
if (activeTerms > 0) {
  return errorResponse(400, '進行中の期間があるため無効化できません');
}
const activeStaffs = await prisma.staff.count({
  where: { floor_id: floorId, is_active: true }
});
if (activeStaffs > 0) {
  return errorResponse(400, '所属スタッフがいるため無効化できません。先にスタッフを他のフロアに移動してください');
}
await prisma.floor.update({ where: { id: floorId }, data: { is_active: false } });
```

**`POST /api/users` — floor_admin 専用ユーザー作成:**

`floor_admin` は Staff レコードを持たないため、**既存の `POST /api/staffs`（User + Staff 同時作成）とは別の専用 API** で作成する。

```typescript
// POST /api/users — floor_admin 用ユーザー作成
const { user, error } = await requireSuperAdmin();
if (error) return error;

const { email, name } = validate(createFloorAdminSchema, body);

// 1. Supabase Auth ユーザー作成
const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
  email,
  password: generateTempPassword(),
  email_confirm: true,
  user_metadata: { role: 'floor_admin' }
});

// 2. Prisma User レコード作成（Staff レコードは作らない）
await prisma.user.create({
  data: {
    id: authData.user.id,
    email,
    role: 'floor_admin',
    must_change_password: true,
  }
});

// 補償: Prisma 失敗時は Supabase Auth ユーザーを削除
```

**floor_admin 作成の完全フロー:**
1. `POST /api/users` で User のみ作成（role=floor_admin、Staff レコードなし）
2. `POST /api/floors/[id]/admins` でフロアに紐付け

**`PUT /api/users/[id]/role` — ロール変更:**

```typescript
// PUT /api/users/[id]/role
const { user, error } = await requireSuperAdmin();
if (error) return error;

const { role: newRole } = validate(roleChangeSchema, body);

// 降格時の処理（floor_admin → staff）
if (newRole === 'staff') {
  // floor_admins テーブルの紐付けを全て削除
  await prisma.floorAdmin.deleteMany({ where: { user_id: userId } });

  // Staff レコードが存在しない場合はエラー（先に POST /api/staffs で作成が必要）
  // → または、降格と同時に Staff レコードを作成する UI フローを用意する
  // MVP では「降格前に Staff レコードの作成を促すエラーメッセージ」を返す
  const hasStaff = await prisma.staff.findUnique({ where: { user_id: userId } });
  if (!hasStaff) {
    return errorResponse(400,
      'スタッフレコードが存在しません。先にスタッフ情報を登録してからロールを変更してください');
  }
}

// 昇格時の処理（staff → floor_admin）
if (newRole === 'floor_admin') {
  // 進行中の Term に ShiftEntry がある場合は拒否（シフト生成に含まれなくなるため）
  const staff = await prisma.staff.findUnique({ where: { user_id: userId } });
  if (staff) {
    const activeEntries = await prisma.shiftEntry.count({
      where: {
        staff_id: staff.id,
        term: { status: { notIn: ['confirmed'] } }
      }
    });
    if (activeEntries > 0) {
      return errorResponse(400,
        '進行中のシフトがあるためロール変更できません。先にシフトを確定してください');
    }
    // Staff レコードを無効化（シフト生成対象から除外）
    await prisma.staff.update({
      where: { id: staff.id },
      data: { is_active: false }
    });
  }
}

// Prisma と Supabase metadata を同時更新
await prisma.user.update({ where: { id: userId }, data: { role: newRole } });
await supabaseAdmin.auth.admin.updateUserById(userId, {
  user_metadata: { role: newRole }
});

await createAuditLog(user, 'role_change', 'user', userId, { new_role: newRole });
```

### 既存 API 修正

全エンドポイントで `requireFloorAccess(user, floorId)` を呼び出し、フロア認可を統一的に適用する。

#### `floorId` 取得元の統一ルール

API ごとに `floorId` の取得元が異なる。以下の3パターンに分類し、統一的に扱う:

| パターン | 取得元 | 用途 | 処理順序 |
|---|---|---|---|
| **A: クエリパラメータ** | `?floor_id=xxx` | 一覧取得系（GET） | 認可チェック → データ取得 |
| **B: リクエストボディ** | `body.floor_id` | 作成系（POST） | バリデーション → 認可チェック → 作成 |
| **C: DB 逆引き** | リソースから取得 | 更新・削除系（PUT/DELETE） | リソース取得（404チェック）→ `resource.floor_id` で認可チェック → 更新 |

> **パターン C の注意**: リソースの存在確認（404）を認可チェック（403）より先に行う。これにより「存在しないリソースへのアクセス」と「権限のないリソースへのアクセス」を区別できる。ただし、リソースの存在自体を秘匿したい場合は 404 の代わりに 403 を返すことも検討する（MVP では区別する方針）。

| ファイル | floorId 取得 | 変更内容 |
|---|---|---|
| `src/app/api/terms/route.ts` | GET: **A**（クエリ）、POST: **B**（ボディ） | GET: `requireFloorAccess` + floor_id フィルタ。POST: floor_id 必須 + `requireFloorAccess`。重複チェックを**同一フロア内**に限定 |
| `src/app/api/terms/bulk/route.ts` | **B**（ボディ） | `floor_id` パラメータ（**単一値、必須**）を追加。指定フロアに対して1年分の Term を一括作成。複数フロアへの一括作成はフロント側で順次呼び出しで対応 |
| `src/app/api/staffs/route.ts` | GET: **A**（クエリ）、POST: **B**（ボディ） | GET: `requireFloorAccess` + floor_id フィルタ。POST: floor_id 必須 + `requireFloorAccess` |
| `src/app/api/staffs/[id]/route.ts` | **C**（`staff.floor_id`） | PUT: リソース取得 → `requireFloorAccess` + floor_id 変更対応（後述）。DELETE: リソース取得 → `requireFloorAccess` |
| `src/app/api/staffs/[id]/restore/route.ts` | **C**（`staff.floor_id`） | 復帰時に `staff.floor_id` のフロアが `is_active = true` か検証。無効なら復帰拒否 |
| `src/app/api/terms/[termId]/shifts/generate/route.ts` | **C**（`term.floor_id`） | Term 取得 → `requireFloorAccess` → スタッフ取得を `term.floor_id` でフィルタ（**最重要**） |
| `src/app/api/terms/[termId]/shifts/route.ts` | **C**（`term.floor_id`） | Term 取得 → `requireFloorAccess` → スタッフ取得を floor_id でフィルタ |
| `src/app/api/terms/[termId]/shifts/pdf/route.ts` | **C**（`term.floor_id`） | PDF ヘッダーにフロア名を表示（Term → Floor リレーションで取得） |
| `src/app/api/terms/[termId]/requests/route.ts` | **C**（`term.floor_id`） | Term 取得 → `requireFloorAccess` → スタッフの floor_id と Term の floor_id 一致チェック |
| `src/app/api/terms/[termId]/snapshots/[id]/restore/route.ts` | **C**（`term.floor_id`） | Term 取得 → `requireFloorAccess` → 復元時に `term.floor_id` に属する active staff のみフィルタ |
| `src/app/api/dashboard/route.ts` | **A**（クエリ、任意） | フロア別集計に変更 + `requireFloorAccess`（後述） |
| `src/app/api/staff-home/route.ts` | **C**（`staff.floor_id`） | collecting/confirmed Term をスタッフの floor_id でフィルタ |
| `src/app/api/auth/session/route.ts` | N/A | レスポンスに `floors` 配列を追加（下記参照） |
| `src/app/api/auth/login/route.ts` | N/A | レスポンスに `floors` 配列を追加 |
| `src/app/api/audit-logs/route.ts` | **A**（クエリ、任意） | フロア別フィルタ対応。`floor_id` パラメータで絞り込み可能に |
| `src/app/api/health/route.ts` | **C**（`term.floor_id`） | スタック Term のロールバック時に AuditLog に `floor_id` を記録 |

### スタッフのフロア異動ルール

`PUT /api/staffs/[id]` で `floor_id` の変更を許可するが、制約付きとする。

```typescript
// PUT /api/staffs/[id] — floor_id 変更時のバリデーション
if (data.floor_id && data.floor_id !== staff.floor_id) {
  // 進行中の Term（confirmed 以外）に ShiftEntry がある場合は拒否
  const activeEntries = await prisma.shiftEntry.count({
    where: {
      staff_id: staffId,
      term: { floor_id: staff.floor_id, status: { notIn: ['confirmed'] } }
    }
  });
  if (activeEntries > 0) {
    return errorResponse(400,
      '進行中のシフトがあるため異動できません。先にシフトを確定するか、該当期間からスタッフを除外してください');
  }
  // confirmed 済みの ShiftEntry は履歴として残す（変更不可の過去データ）
}
```

**ルール**:
- confirmed 済み Term の ShiftEntry → 履歴として残す
- collecting/generating/adjusting の Term に ShiftEntry がある → 異動を拒否
- draft の Term → ShiftEntry は未生成のため、`floor_id` 変更は常に通過する（draft Term にはスタッフの直接的な紐付けがないため影響なし）

### ダッシュボード集計仕様

```typescript
// GET /api/dashboard?floor_id=xxx
// floor_id 省略時（super_admin の「全フロア」選択）: フロア横断サマリーを返却
// floor_id 指定時: 該当フロアのみで集計
// floor_admin: 自フロアの集計のみ（floor_id 必須、認可チェックあり）

if (!floorId) {
  // 「全フロア」選択時 → フロア横断サマリーテーブル
  const floors = await prisma.floor.findMany({
    where: { is_active: true },
    include: {
      terms: { where: { status: { not: 'confirmed' } } },
      _count: { select: { staffs: { where: { is_active: true } } } }
    },
    orderBy: { sort_order: 'asc' }
  });
  // レスポンス: フロアごとの { floorName, activeTermCount, termStatuses[], staffCount }
} else {
  // 個別フロア選択時 → 既存のダッシュボード集計（フロアフィルタ付き）
  const floorFilter = { floor_id: floorId };
  const terms = await prisma.term.findMany({ where: { ...floorFilter }, ... });
  const staffCount = await prisma.staff.count({
    where: { ...floorFilter, is_active: true }
  });
}
```

| ロール | 表示内容 |
|---|---|
| `super_admin` | セレクターで「全フロア」（フロア × ステータスのマトリクス表示）or 個別フロアを切替可能 |
| `floor_admin` | 自分の管理フロアの集計（複数フロア管理時はセレクターで切替。「全フロア」オプションなし） |

### Session / Login レスポンス変更

`floor_id` 単一値ではなく **`floors` 配列** で返す（`floor_admin` が複数フロアを管理するケースに対応）。

```typescript
// GET /api/auth/session のレスポンス
{
  user_id: "...",
  email: "...",
  role: "super_admin" | "floor_admin" | "staff",
  staff_id: "..." | null,
  staff_name: "..." | null,
  team: "A" | "B" | null,
  // 新規追加
  floors: [
    { id: "uuid-1", name: "3階東" },
    { id: "uuid-2", name: "3階西" }
  ]
  // super_admin → 全 active フロア返却
  // floor_admin → floor_admins テーブルの紐付け分
  // staff → 自分の所属フロア1件
}
```

### ShiftSnapshot の既存データ互換性

スナップショットの構造は変更しない。復元ロジックで対応する。

```typescript
// snapshot restore 時（既存の active staff フィルタを拡張）
const currentFloorStaffIds = await prisma.staff.findMany({
  where: { floor_id: term.floor_id, is_active: true },
  select: { id: true }
});
const validStaffIds = new Set(currentFloorStaffIds.map(s => s.id));
const filteredEntries = snapshotEntries.filter(e => validStaffIds.has(e.staff_id));
```

フロア対応前のスナップショットも、復元時に「現在の Term のフロアに属する active staff」でフィルタされるため、自然に後方互換性が保たれる。

### バリデーター修正
- `src/lib/validators/term.ts`: `floor_id` フィールド追加
- `src/lib/validators/staff.ts`: `floor_id` フィールド追加

---

## Phase 4: フロントエンド変更

### フロア選択状態の管理

**Zustand ストア + `sessionStorage` 永続化**で管理する。

```typescript
// src/stores/floor-store.ts（新規）
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type Floor = { id: string; name: string };

type FloorStore = {
  availableFloors: Floor[];
  selectedFloorId: string | null;
  setFloors: (floors: Floor[]) => void;
  selectFloor: (floorId: string) => void;
};

export const useFloorStore = create<FloorStore>()(
  persist(
    (set) => ({
      availableFloors: [],
      selectedFloorId: null,
      setFloors: (floors) => set((state) => ({
        availableFloors: floors,
        // 既存の選択が有効ならそのまま、なければ先頭を選択
        selectedFloorId: floors.some(f => f.id === state.selectedFloorId)
          ? state.selectedFloorId
          : floors[0]?.id ?? null,
      })),
      selectFloor: (floorId) => set({ selectedFloorId: floorId }),
    }),
    {
      name: 'floor-selection',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ selectedFloorId: state.selectedFloorId }),
    }
  )
);
```

**`sessionStorage` を選ぶ理由**:
- タブごとに独立 → 複数タブで異なるフロアを操作可能
- ページリロードでも選択が維持される
- `localStorage` だとタブ間で共有され、複数フロア同時操作時に競合する

**初期化フロー**:
- 管理者レイアウト（`layout.tsx`）の初期化時に session API から `floors` を取得してストアに設定
- `floors[0]` をデフォルト選択（sessionStorage に既存値があればそちらを優先）
- **フロア選択が確定するまで子コンポーネントをレンダリングしない**（`selectedFloorId === null` の間はローディングスピナーを表示）。これにより、フロア未選択状態で API が呼ばれる問題を防止する
- セレクター変更時に `selectFloor` を呼び、各ページはストアの `selectedFloorId` を参照して API に渡す
- 認可チェックは API 側の `requireFloorAccess` で担保（フロントは表示制御のみ）

```typescript
// src/app/(admin)/layout.tsx — フロア初期化ガード
function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { selectedFloorId, setFloors } = useFloorStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        setFloors(data.data.floors);
        setIsLoading(false);
      });
  }, [setFloors]);

  if (isLoading || selectedFloorId === null) {
    return <LoadingSpinner />;
  }

  return <>{children}</>;
}
```

### 新規ページ
- `src/app/(admin)/admin/floors/page.tsx` — フロア管理画面（super_admin のみ）

### フロアセレクター
- 管理者レイアウト（`src/app/(admin)/layout.tsx`）のヘッダーまたはサイドバーにフロア切替ドロップダウンを追加
- super_admin: 「全フロア」オプション + 各フロアを選択可能
- floor_admin: 自分のフロアのみ表示

### 既存ページ修正
| ページ | 変更内容 |
|---|---|
| ダッシュボード | フロアセレクターに連動したデータ表示。super_admin は「全フロア」合算も選択可能 |
| スタッフ管理 | 作成/編集フォームに floor_id 追加、フロアフィルタ追加。floor_id 変更（異動）UI を追加 |
| 期間管理 | 作成フォームに floor_id 追加（ストアの `selectedFloorId` をデフォルト値に）、フロア列追加。一括作成ダイアログでフロア選択 |
| シフト表（admin） | ヘッダーにフロア名表示（Term 経由で自動スコープ） |
| PDF出力 | フロア名がヘッダーに表示される（API 側で対応） |
| スタッフホーム/リクエスト | 変更なし（API 側で自動フィルタ） |

---

## Phase 5: シフト生成・制約

- **shift-generator.ts**: 変更不要（API 層でフロア内スタッフのみ渡される）
- **constraints/**: 変更不要（渡されたスタッフリストに対して動作）
- **shift-store.ts**: `TermInfo` に `floorId`, `floorName` を追加（表示用）。`loadData` で API レスポンスの `term.floor_id`, `term.floor_name` をパースする

```typescript
// shift-store.ts の TermInfo 型を拡張
type TermInfo = {
  // 既存フィールド...
  floorId: string;
  floorName: string;
};
```

API 側（`GET /api/terms/[termId]/shifts`）で Term → Floor を include して `floor_name` を返す。

---

## Phase 6: シードデータ更新

`prisma/seed.ts` を更新:
- 3フロア作成（例: "3階東", "3階西", "4階"）
- 20人のスタッフをフロアに分配
- フロアごとに Term 作成
- super_admin 1名 + floor_admin 各フロア1名を作成
- floor_admin を `floor_admins` テーブルで各フロアに紐付け
- floor_admin ユーザーは `must_change_password: true` で作成

---

## 実装順序

認可と API を並行して進める（認可単体ではテスト不能なため統合して実装）。

1. **スキーマ変更 + マイグレーション（enum 完全置換含む）+ Supabase Auth metadata 同期**（Phase 1）
2. **認可ヘルパー（`getAuthUser` の Prisma DB 化、`requireFloorAccess` 等）+ フロア CRUD API + ロール変更 API**（Phase 2 + Phase 3 新規部分を統合）
3. **既存 API のフロアスコープ対応**（Phase 3 修正部分）— 各エンドポイントに `requireFloorAccess` を追加
4. **フロア選択ストア（sessionStorage 永続化）+ フロア管理画面 + フロアセレクター**（Phase 4 新規部分）
5. **既存画面のフロア対応**（Phase 4 修正部分）
6. **シードデータ更新**（Phase 6）

---

## 検証方法

### 自動テスト
- `requireFloorAccess` のユニットテスト（super_admin/floor_admin/staff × 自フロア/他フロア × デフォルト拒否）
- ロール別アクセス制御の API テスト（各エンドポイントで権限外アクセスが 403 になること）
- スタッフ異動テスト（進行中 Term ありで拒否、confirmed のみで許可）

### マイグレーション検証
1. `npm run db:migrate` でマイグレーション適用確認（enum 置換が正常に完了すること）
2. `npm run db:seed` でシードデータ投入確認
3. `npm run check`（lint + typecheck + build）が通ることを確認
4. Supabase Auth metadata 同期スクリプトの実行確認

### 手動テスト
- super_admin でログイン → 全フロアのシフト表が見える、「全フロア」合算ダッシュボードが表示される
- floor_admin でログイン → 自分のフロアのみ管理可能、他フロアへの API アクセスが 403
- staff でログイン → 自分のフロアの確定済みシフト表のみ閲覧可能
- フロアAで生成したシフトにフロアBのスタッフが含まれないこと
- フロアごとに独立した Term ステータス管理ができること
- 進行中の Term があるフロアの削除が拒否されること
- フロア対応前の ShiftSnapshot が正しく復元できること（フロア内 active staff のみに絞られること）
- ページリロード後もフロア選択が維持されること（sessionStorage）
- 複数タブで異なるフロアを同時操作できること
- スタッフのフロア異動が進行中 Term ありで拒否されること
- ロール変更（staff → floor_admin）後、再ログインせずに middleware のルーティングが正しく動作すること

---

## 設計決定事項（レビュー反映）

以下はレビューで指摘され、本プランに反映済みの設計決定:

1. **floor_admin の Staff レコード**: floor_admin は Staff レコードを持たない。専用の `POST /api/users` で User のみ作成する。既存 staff → floor_admin 昇格時は Staff を `is_active = false` に変更する
2. **enum マイグレーション**: `prisma migrate dev --create-only` で生成 → 手書き編集の手順。メンテナンスウィンドウ必須
3. **マイグレーション実行順序**: アプリ停止 → DB マイグレーション → アプリデプロイ → Supabase metadata 同期
4. **floorId 取得元**: A（クエリパラメータ）/ B（リクエストボディ）/ C（DB 逆引き）の3パターンを統一ルール化
5. **GET /api/floors の権限**: `requireAdminAny()`（スタッフはセッション API の floors で十分）
6. **middleware でのページアクセス制御**: `/admin/floors` は middleware レベルで `super_admin` のみに制限
7. **ダッシュボード「全フロア」**: 単純合算ではなくフロア × ステータスのマトリクス表示
8. **フロア選択の初期化**: `selectedFloorId` が確定するまで子コンポーネントをレンダリングしない
9. **Holiday テーブル**: グローバルのまま変更なし（全フロア共通）
10. **Term 日程の独立性**: フロアごとに独立（同一日程の Term が複数フロアに存在可能）
11. **AuditLog.floor_id**: FK なし + インデックス追加
12. **ロール降格パス**: floor_admin → staff 降格時に floor_admins 紐付けを全削除 + Staff レコード存在チェック
13. **デフォルトフロアの SELECT**: `ORDER BY created_at ASC LIMIT 1` で確定的に取得

---

## 未決事項

- `floor_admin` が自身もシフトに入る（Staff レコードを持つ）ケースが必要か → MVP 後に検討
- Term 一括作成の全フロア一括 API が必要か → MVP ではフロント側で順次呼び出しで対応。運用負荷が高い場合は `POST /api/terms/bulk-all-floors` を検討
