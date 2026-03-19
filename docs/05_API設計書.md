# API設計書

## NHO 看護師シフト管理アプリ — MVP

---

## 1. 共通仕様

### 1.1 ベースURL

```
/api
```

> Next.js App Router のファイルベースルーティングに合わせ、`/api/v1` プレフィックスは使用しない。APIバージョニングが必要になった場合はヘッダーベース（`Accept-Version`）で対応する。

### 1.2 認証

すべてのAPI（認証系・ヘルスチェックを除く）に Supabase Auth の JWT が必要。JWT は `@supabase/ssr` により Cookie で自動管理される。

Next.js Middleware が Cookie 内の JWT を検証し、Route Handler に認証情報を渡す。API クライアントが明示的に `Authorization` ヘッダーを付与する必要はない。未認証のAPIアクセスはリダイレクトではなく `401 UNAUTHORIZED` のJSONレスポンスで返す。

### 1.3 レスポンス形式

**成功レスポンス:**
```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2026-04-01T09:00:00Z"
  }
}
```

**エラーレスポンス:**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "入力値が不正です",
    "details": [
      { "field": "email", "message": "メールアドレスの形式が正しくありません" }
    ]
  }
}
```

### 1.4 共通エラーコード

| HTTPステータス | コード | 説明 |
|:---:|------|------|
| 400 | VALIDATION_ERROR | バリデーションエラー |
| 401 | UNAUTHORIZED | 認証エラー |
| 403 | FORBIDDEN | 権限不足 |
| 404 | NOT_FOUND | リソースが見つからない |
| 409 | CONFLICT | 競合（重複登録等） |
| 429 | RATE_LIMITED | レート制限超過 |
| 500 | INTERNAL_ERROR | サーバー内部エラー |

---

## 2. 認証 API

> **方針:** 認証委任の正本は `01_機能要件定義書.md` と `06_技術スタック・アーキテクチャ設計書.md` を参照。ここでは API の振る舞いのみを定義する。認証 API は Supabase Auth SDK の薄いラッパーとし、JWT は `@supabase/ssr` により Cookie で自動管理するため、フロントエンドに access_token / refresh_token を明示返却しない。

### POST /api/auth/login

ログイン処理。Supabase Auth の `signInWithPassword` を呼び出す薄いラッパー。

**リクエスト:**
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

**レスポンス (200):**
```json
{
  "data": {
    "user": {
      "id": "uuid",
      "email": "admin@example.com",
      "role": "admin",
      "must_change_password": false,
      "staff_id": "uuid"
    }
  }
}
```

> **注意:** JWT トークンはレスポンスボディに含めない。`@supabase/ssr` が自動的に Cookie にセットする。

> **`staff_id` について:** フロントエンドが希望休申請（`POST /api/terms/:termId/requests`）等で `staff_id` を送信する必要があるため、ログインレスポンスに `staff_id` を含める。`users.id` から `staffs` テーブルを参照して取得する。フロントエンドはこの値をストア（Zustand 等）に保持し、セッション中に再利用する。

**エラー:**
- 401: メールアドレスまたはパスワードが不正
- 429: レート制限超過（Supabase Auth の Rate Limiting）

> **Token Refresh について:** `@supabase/ssr` が Cookie 内の Refresh Token を用いて自動的に Access Token を更新するため、明示的な refresh API エンドポイントは不要。Next.js Middleware 内で `supabase.auth.getUser()` を呼び出すことで、自動的にトークンリフレッシュが行われる。

---

### PUT /api/auth/password

パスワード変更。現パスワードの検証後に新パスワードを設定する。

**処理手順:**
1. 認証済みセッションの `user.email` を取得する（リクエストボディに `email` は含めない）
2. `signInWithPassword({ email: session.user.email, password: current_password })` で現パスワードを再認証する（Supabase Auth の `updateUser` は現パスワードを検証しないため、明示的に確認が必要）
3. 検証成功後、`updateUser({ password: new_password })` で新パスワードを設定
4. `public.users.must_change_password` を `false` に更新

> **再認証方針:** 再認証に使うメールアドレスは常に現在のセッションから取得する。クライアントが任意の `email` を送る方式は採用しない。

**リクエスト:**
```json
{
  "current_password": "old_pass",
  "new_password": "new_pass123"
}
```

**レスポンス (200):**
```json
{
  "data": { "message": "パスワードを変更しました" }
}
```

**エラー:**
- 401: 現在のパスワードが不正

---

### POST /api/auth/logout

ログアウト処理。Supabase Auth のセッションを破棄し、Cookie をクリアする。

**レスポンス (200):**
```json
{
  "data": { "message": "ログアウトしました" }
}
```

---

### POST /api/auth/reset-password

管理者によるパスワード再発行。対象スタッフの仮パスワードを再生成する。

**権限: admin のみ**

**リクエスト:**
```json
{
  "user_id": "uuid"
}
```

**処理手順:**
1. `supabaseAdmin.auth.admin.updateUserById(user_id, { password: 仮パスワード })` で仮パスワードを設定
2. `public.users.must_change_password` を `true` に更新（Prisma で更新）
3. 仮パスワードをレスポンスで1度だけ返却

**レスポンス (200):**
```json
{
  "data": {
    "user_id": "uuid",
    "temporary_password": "newTemp123"
  }
}
```

---

## 3. スタッフ管理 API

**権限: admin のみ**

> **スタッフ向けシフト閲覧との関係:** スタッフがシフト表を閲覧する際に必要なスタッフ情報（氏名・チーム等）は `GET /api/terms/:termId/shifts` のレスポンスに含めて返却する（§6 参照）。スタッフ管理APIへの直接アクセスは不要。

### GET /api/staffs

スタッフ一覧を取得。

**権限:** admin のみ

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|----------|------|:--:|------|
| team | string | — | チームで絞り込み（`A` / `B`） |
| is_active | boolean | — | 有効フラグで絞り込み（デフォルト: true） |
| search | string | — | 氏名またはスタッフコードで部分一致検索 |

**レスポンス (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "staff_code": "N001",
      "name": "田中花子",
      "experience_years": 5,
      "team": "A",
      "night_shift_available": true,
      "is_active": true
    }
  ]
}
```

---

### POST /api/staffs

スタッフを新規登録（ユーザーアカウントも同時作成）。

**処理手順と整合性保証:**
1. `supabaseAdmin.auth.admin.createUser()` で Supabase Auth ユーザーを作成（仮パスワード設定）
2. Prisma トランザクション内で `users` テーブルと `staffs` テーブルにレコードを作成
3. Step 2 が失敗した場合、`supabaseAdmin.auth.admin.deleteUser()` で Step 1 の Auth ユーザーを削除（補償トランザクション）
4. Step 3 も失敗した場合は、Auth 側にゴミユーザーが残る可能性があるため、エラーログに Auth ユーザー ID を記録し、管理者に手動削除を促す

> **注意:** Supabase Auth API 呼び出しは外部 API のためDBトランザクションに含められない。上記の補償トランザクションパターンで整合性を担保する。

**リクエスト:**
```json
{
  "staff_code": "N001",
  "name": "田中花子",
  "email": "tanaka@example.com",
  "experience_years": 5,
  "team": "A",
  "night_shift_available": true
}
```

**レスポンス (201):**
```json
{
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "staff_code": "N001",
    "name": "田中花子",
    "temporary_password": "abc123XY"
  }
}
```

---

### PUT /api/staffs/:id

スタッフ情報を更新。

> **email の変更:** MVP では email の変更は対応しない。email を変更するには Supabase Auth 側の email も同期する必要があり、確認メールフローが発生するため、MVP スコープ外とする。変更が必要な場合は、スタッフを無効化して新規作成する運用とする。

**リクエスト:**
```json
{
  "name": "田中花子",
  "experience_years": 6,
  "team": "B",
  "night_shift_available": true
}
```

**レスポンス (200):** 更新後のスタッフオブジェクト

---

### DELETE /api/staffs/:id

スタッフを論理削除（is_active を false に変更）。

**レスポンス (200):**
```json
{
  "data": { "message": "スタッフを無効化しました" }
}
```

---

### PUT /api/staffs/:id/restore

論理削除したスタッフを復元。

**レスポンス (200):** 復元後のスタッフオブジェクト

---

## 4. ターム管理 API

**権限: admin のみ（GET /api/terms を除く）**

### GET /api/terms

ターム一覧を取得。

**権限:**
- **admin:** 全ステータスのタームを取得可能
- **staff:** `collecting`（希望休受付中）および `confirmed`（確定済み）のタームのみ取得可能。スタッフダッシュボードでの希望休受付状況確認・確定シフト一覧表示に使用する。それ以外のステータスのタームはレスポンスから自動的に除外される。

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|----------|------|:--:|------|
| year | integer | — | 年度で絞り込み |
| status | string | — | ステータスで絞り込み |

**レスポンス (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "start_date": "2026-04-06",
      "end_date": "2026-05-03",
      "fiscal_year": 2026,
      "status": "draft",
      "request_deadline": null,
      "min_day_staff": 7
    }
  ]
}
```

---

### POST /api/terms

タームを個別登録。

**リクエスト:**
```json
{
  "start_date": "2026-04-06"
}
```

**レスポンス (201):** 作成されたタームオブジェクト（end_dateは自動計算）

---

### POST /api/terms/bulk

年度一括登録。

**リクエスト:**
```json
{
  "year_start_date": "2026-04-06"
}
```

**トランザクション方針:** 一括登録は **all-or-nothing** で実行する。13ターム中1件でも既存タームとの重複が検出された場合、全件ロールバックしエラーを返す（部分登録は行わない）。相互重複チェック（13ターム間）も同時に実施する。

**レスポンス (201):**
```json
{
  "data": {
    "terms": [ /* 13ターム分の配列 */ ],
    "count": 13
  }
}
```

---

### PUT /api/terms/:id

ターム設定を更新（締切日・日勤最低人数等）。

**リクエスト:**
```json
{
  "request_deadline": "2026-03-25",
  "min_day_staff": 8
}
```

---

### DELETE /api/terms/:id

タームを削除（`draft` ステータスの場合のみ）。

**レスポンス (200):**
```json
{
  "data": { "message": "タームを削除しました" }
}
```

**エラー:**
- 409: ステータスが `draft` 以外の場合

---

### PUT /api/terms/:id/status

タームのステータスを変更。

> **責務:** このAPIは管理者の明示操作による**手動遷移のみ**を扱う。`collecting` → `generating`、`generating` → `adjusting`、`generating` → `collecting` は `POST /api/terms/:termId/shifts/generate` の副作用としてのみ発生し、status API では受け付けない。

**リクエスト:**
```json
{
  "status": "collecting"
}
```

**バリデーション:**
- 許可される状態遷移のみ受け付ける
- `draft` → `collecting`: `request_deadline` 設定必須
- `adjusting` → `confirmed`: フェーズ1必須制約違反が0件であること
- `collecting` → `generating`: **このAPIでは受け付けない。** `POST /api/terms/:termId/shifts/generate` 内で自動遷移する
- `generating` → `collecting`: 通常は生成APIの副作用でのみ発生する。ただし `generating` に遷移してから **5分以上** 経過している場合に限り、このAPIで `collecting` への強制ロールバックを受け付ける（サーバークラッシュ等によるスタック復旧用）。5分未満の場合は `GENERATION_IN_PROGRESS` エラーを返す
- その他 `generating` を含む遷移: **このAPIでは受け付けない。** 生成APIの副作用でのみ発生する
- `confirmed` → `adjusting`: 差し戻し（このAPIで受け付ける）

---

## 5. 希望休 API

### GET /api/terms/:termId/requests

希望休一覧を取得。

- **admin:** 全スタッフ分を取得
- **staff:** 自分の分のみ取得

**レスポンス (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "staff_id": "uuid",
      "staff_name": "田中花子",
      "requested_date": "2026-04-15",
      "created_at": "2026-03-20T10:00:00Z"
    }
  ]
}
```

---

### POST /api/terms/:termId/requests

希望休を申請。**1リクエストにつき1日分を登録する。** 複数日を申請する場合はフロントエンドから日数分のリクエストを順次送信する（バッチ申請APIはMVPでは提供しない）。

**権限:** staff（自分の分） / admin（代理入力）

**リクエスト:**
```json
{
  "staff_id": "uuid",
  "requested_date": "2026-04-15"
}
```

> **スタッフ操作時の `staff_id`:** スタッフが自分の希望休を申請する場合も `staff_id` を送信する。サーバー側で JWT のユーザーIDに紐づく `staffs.id` と一致するかを検証し、不一致の場合は `403 FORBIDDEN` を返す。管理者は任意の `staff_id` を指定可能（代理入力）。

**バリデーション:**
- 対象タームが `collecting` ステータスであること（adminは締切後も可）
- スタッフ操作時は `現在のJST日付 > request_deadline` の場合に締切後として扱う（締切日当日の 23:59:59 JST までは申請可能）
- 同一スタッフの同一タームで3件を超えないこと
- 日付がターム期間内であること

---

### DELETE /api/terms/:termId/requests/:id

希望休を取消。

**バリデーション:** スタッフ操作は締切前のみ（`現在のJST日付 > request_deadline` で締切後判定、adminは締切後も可）

---

## 6. シフト管理 API

> **設計方針（MVP）:** シフト編集はクライアント側ステート管理を採用する。セル変更ごとにサーバーAPIを呼び出す設計（逐次保存）は採用しない。使用するエンドポイントは以下に限定する:
> - `GET /shifts` — シフトデータ取得
> - `POST /shifts/generate` — 自動生成
> - `POST /shifts/save` — 一括保存（スナップショット作成）
> - `GET /shifts/violations` — 制約違反取得
> - `GET /snapshots` / `POST /snapshots/:id/restore` — 履歴・復元
>
> これにより Undo/Redo・isDirty・違反再計算の責務がフロントエンドに集中し、実装の境界が明確になる。

### POST /api/terms/:termId/shifts/generate

シフトを自動生成する。

**権限: admin のみ**

> **責務:** シフト生成ロジックの実行に加え、`collecting` → `generating` → `adjusting`（失敗時は `collecting` へロールバック）の内部ステータス遷移を担う。status API はこれらの遷移を扱わない。

**生成前バリデーション:**
- ターム期間内の祝日数（`estimated_holidays`）を祝日マスタから取得する
- 有効スタッフ数が `ceil((min_day_staff + 6) × 28 / (20 - estimated_holidays))` 以上であること
- `min_day_staff = 7`・祝日0日の既定では 19名以上を必要とする。祝日が多いタームでは代休による勤務可能日数の減少を考慮し、必要スタッフ数が増加する
- 夜勤可能スタッフ数が `ceil(6 × 28 / (20 - estimated_holidays))` 以上であること
- 祝日0日の既定では 9名以上を必要とする
- チームA/Bそれぞれに夜勤可能スタッフが3名以上いること

**レスポンス (200):**
```json
{
  "data": {
    "term": {
      "id": "uuid",
      "status": "adjusting",
      "lock_version": 2
    },
    "entries": [
      {
        "staff_id": "uuid",
        "date": "2026-04-06",
        "shift_type": "day"
      }
    ],
    "statistics": {
      "generation_time_ms": 15200,
      "hard_violations": [],
      "soft_violations": [
        {
          "constraint_id": "S1",
          "message": "夜勤回数の差が2回（目標: ±1回以内）",
          "staff_ids": ["uuid1", "uuid2"]
        }
      ]
    }
  },
  "meta": {
    "timed_out": false
  }
}
```

**エラー:**
- 400: 入力バリデーションエラー（スタッフ不足等）
- 500: 生成エンジンの例外エラー（タームステータスを `collecting` にロールバックしてエラーを返却）

> **タイムアウト時の扱い:** 55秒以内に最終解が得られない場合でも、利用可能な途中結果を `200 OK` で返す。`meta.timed_out = true` とし、タームは `adjusting` に遷移する。

> **ステータス遷移:** 生成開始時に `collecting` → `generating` に遷移。生成完了（タイムアウト含む）で `generating` → `adjusting` に遷移。例外エラー時は `generating` → `collecting` にロールバック。

> **排他制御:** `collecting` → `generating` のステータス遷移は `WHERE status = 'collecting'` 条件付き UPDATE でアトミックに実行する。更新行数が0の場合（他のリクエストが先に `generating` に遷移済み）は `409 CONFLICT`（GENERATION_IN_PROGRESS: 「シフト生成が既に実行中です」）を返す。

> **永続化方針:** 生成結果はレスポンス返却前に `shift_entries` へ current working copy として保存し、`terms.lock_version` を +1 する。初回生成時（`collecting` → `generating`）はスナップショットを作成しない。再生成時（`adjusting` 状態で再実行）は、生成前に現在の `shift_entries` をスナップショットとして自動保存し、手動調整済みデータの消失を防止する。

---

### GET /api/terms/:termId/shifts

シフトデータを取得。

**権限:**
- admin: 常に取得可能
- staff: タームが `confirmed` の場合のみ

**レスポンス (200):**
```json
{
  "data": {
    "term": { "id": "uuid", "start_date": "2026-04-06", "end_date": "2026-05-03", "lock_version": 2 },
    "entries": [
      {
        "id": "uuid",
        "staff_id": "uuid",
        "staff_name": "田中花子",
        "date": "2026-04-06",
        "shift_type": "day",
        "is_manual_edit": false
      }
    ],
    "statistics": {
      "staff_summary": [
        {
          "staff_id": "uuid",
          "name": "田中花子",
          "total_hours": 155.0,
          "standard_hours": 155.0,
          "difference_hours": 0.0,
          "day_count": 12,
          "evening_count": 4,
          "night_count": 4,
          "off_count": 8,
          "legal_off_count": 4
        }
      ],
      "daily_summary": [
        {
          "date": "2026-04-06",
          "day_count": 8,
          "evening_count": 3,
          "night_count": 3,
          "is_holiday": false,
          "is_weekend": false
        }
      ]
    },
    "violations": [
      {
        "constraint_id": "H11",
        "level": "hard",
        "staff_id": "uuid",
        "dates": ["2026-04-10", "2026-04-11", "2026-04-12"],
        "message": "夜勤の連続が3日以上です"
      }
    ]
  }
}
```

---

### POST /api/terms/:termId/shifts/save

シフトデータを一括保存し、スナップショットを作成する。フロントエンドの「保存」ボタンが呼び出すエンドポイント。**対象タームの current working copy はこのリクエスト内容で完全置換される。**

**権限: admin のみ**

**リクエスト:**
```json
{
  "entries": [
    { "staff_id": "uuid", "date": "2026-04-06", "shift_type": "evening", "is_manual_edit": true },
    { "staff_id": "uuid", "date": "2026-04-07", "shift_type": "off", "is_manual_edit": false }
  ],
  "lock_version": 2
}
```

> **楽観的ロック:** `lock_version` はクライアントがシフトデータ取得時に受け取った `terms.lock_version` の値。サーバー側で現在の `terms.lock_version` と一致するかチェックし、不一致の場合は `409 OPTIMISTIC_LOCK_ERROR` を返す。一致した場合は保存後に `lock_version` を +1 インクリメントして返却する。

> **保存単位:** クライアントは保存時点の current working copy 全体を送信する。**未送信行は削除対象**となる。無効化済みスタッフの行が含まれていても、サーバーは `is_active = true` のスタッフのみを保存対象とし、無効化済みスタッフ分は current working copy から**自動除去**する。

**レスポンス (200):**
```json
{
  "data": {
    "snapshot": {
      "id": "uuid",
      "version": 3,
      "created_at": "2026-03-28T14:30:00Z"
    },
    "lock_version": 3,
    "violations": [ /* 保存後の制約違反一覧 */ ],
    "statistics": { /* 保存後の統計情報 */ }
  }
}
```

**エラー:**
- 409 (OPTIMISTIC_LOCK_ERROR): 他のセッションによりデータが更新済み。「他の操作によりシフトデータが更新されました。最新データを読み込んでください。」

**処理:**
1. 楽観的ロックチェック（リクエストの `lock_version` と `terms.lock_version` を比較）
2. 対象ターム時点で有効なスタッフ（`staffs.is_active = true`）のみを保存対象として抽出
3. 対象 term の current working copy（`shift_entries`）を全削除
4. フィルタ後の `entries` を一括 insert（`staff_id`, `date`, `shift_type`, `is_manual_edit`）
5. `terms.lock_version` を +1 インクリメント、`terms.updated_at` を更新
6. フィルタ後の current working copy 全体でスナップショットを作成（5世代超過時は最古を削除）
7. 制約チェック・統計再計算
8. 操作ログ記録

---

### GET /api/terms/:termId/shifts/violations

制約違反の一覧を取得。

**レスポンス (200):**
```json
{
  "data": {
    "hard_violations": [ /* ... */ ],
    "soft_violations": [ /* ... */ ],
    "summary": {
      "hard_count": 2,
      "soft_count": 5
    }
  }
}
```

---

### GET /api/terms/:termId/shifts/pdf

シフト表をPDFで出力。

**レスポンス:**
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="shift_2026-04-06_2026-05-03.pdf"`

---

## 7. シフト履歴 API

### GET /api/terms/:termId/snapshots

スナップショット一覧を取得。

**レスポンス (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "version": 3,
      "created_by": "admin@example.com",
      "created_at": "2026-03-28T14:30:00Z"
    }
  ]
}
```

---

### POST /api/terms/:termId/snapshots/:id/restore

指定世代のスナップショットに復元。

**権限: admin のみ**

> **復元対象:** `snapshot.data.entries` に含まれる `staff_id` / `date` / `shift_type` / `is_manual_edit` を current working copy に復元する。`violations` や統計値は履歴参照用であり、復元後の `shift_entries` から再計算する。

**リクエスト:**
```json
{
  "lock_version": 3
}
```

**処理手順:**
1. 楽観的ロックチェック（リクエストの `lock_version` と `terms.lock_version` を比較）
2. スナップショットの `data.entries` から、復元時点で有効なスタッフ（`staffs.is_active = true`）のみを抽出する
3. 対象 term の current working copy（`shift_entries`）を全削除し、`staff_id` / `date` / `shift_type` / `is_manual_edit` を一括復元（DELETE + INSERT）
4. `terms.lock_version` を +1 インクリメント
5. 復元操作自体はスナップショットを新規作成しない（復元後に手動編集→保存した時点で新スナップショットが作成される）
6. 制約チェック・統計再計算
7. 操作ログ記録（`snapshot.restore`）

> **フロントエンド:** 復元成功後、クライアントの Undo/Redo スタックをリセットし、`isDirty = false` とする。復元されたデータはサーバーに永続化済みの状態。

**レスポンス (200):**
```json
{
  "data": {
    "entries": [ /* 復元後のシフトデータ */ ],
    "lock_version": 4,
    "violations": [ /* 復元後の制約違反一覧 */ ],
    "statistics": { /* 復元後の統計情報 */ }
  }
}
```

**エラー:**
- 409 (OPTIMISTIC_LOCK_ERROR): 他のセッションによりデータが更新済み

---

## 8. 祝日 API

### GET /api/holidays

祝日一覧を取得。

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|----------|------|:--:|------|
| year | integer | — | **暦年**で絞り込み（例: 2026） |
| from | string | — | 日付範囲の開始（ISO 8601 日付。ターム期間での検索に使用） |
| to | string | — | 日付範囲の終了（ISO 8601 日付） |

---

### POST /api/holidays

祝日を追加（病院独自の祝日等）。

**権限: admin のみ**

**リクエスト:**
```json
{
  "date": "2026-10-15",
  "name": "病院記念日"
}
```

---

### DELETE /api/holidays/:id

祝日を削除（カスタム祝日のみ）。

---

## 9. 操作ログ API

### GET /api/audit-logs

操作ログを取得する。

**権限: admin のみ**

**クエリパラメータ:**

| パラメータ | 型 | 必須 | 説明 |
|----------|------|:--:|------|
| action | string | — | 操作種別で絞り込み（例: `shift.edit`） |
| resource_type | string | — | リソース種別で絞り込み |
| resource_id | string | — | リソースIDで絞り込み |
| from | string | — | 期間の開始（ISO 8601） |
| to | string | — | 期間の終了（ISO 8601） |
| limit | integer | — | 取得件数（デフォルト: 50、最大: 200） |
| offset | integer | — | オフセット |

**レスポンス (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "action": "shift.edit",
      "resource_type": "shift",
      "resource_id": "uuid",
      "detail": { "changes": [...] },
      "created_at": "2026-03-28T14:30:00Z"
    }
  ],
  "meta": {
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

---

## 10. ヘルスチェック API

### GET /api/health

サーバーの稼働状態を確認（認証不要）。

**レスポンス (200):**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-04-01T09:00:00Z"
}
```
