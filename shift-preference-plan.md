# 希望シフト提出機能の追加

## Context

現在、一般スタッフは「希望休（特定日を休みにしたい）」のみ提出できる。  
これに加えて「特定の日に日勤/準夜勤/深夜勤をやりたい」という希望シフトも収集できるようにする。  
DBモデルの変更・API・シフト生成エンジン・UIすべてに修正が必要。

---

## 設計方針

- `ShiftRequest`モデルに `shift_type` カラムを追加（`DEFAULT requested_off`）。既存データは無変更で後方互換性を保つ
- 申請可能なshift_type: `requested_off`（希望休）/ `day`（日勤）/ `evening`（準夜）/ `night`（深夜）
- 上限を種別ごとに管理: 希望休 max 3件、希望シフト（日/準夜/深夜）max 3件
- 希望シフトはシフト生成エンジンで「ベストエフォート」配置（Step 1.5で先置き。夜勤制約・`night_shift_available`チェックあり）
- UIはカレンダー日付クリック時に種別選択モーダルを表示

---

## 実装ステップ（実行順）

### 1. DBスキーマ変更
**ファイル**: `prisma/schema.prisma`

`ShiftRequest`モデルの `requested_date` の後に1行追加:
```prisma
shift_type     ShiftType @default(requested_off)
```

その後 `npx prisma migrate dev --name add_shift_type_to_shift_requests` を実行。

---

### 2. バリデーター更新
**ファイル**: `src/lib/validators/request.ts`

```typescript
import { z } from "zod";

export const REQUESTABLE_SHIFT_TYPES = ["requested_off", "day", "evening", "night"] as const;
export type RequestableShiftType = (typeof REQUESTABLE_SHIFT_TYPES)[number];

export const createRequestSchema = z.object({
  staff_id: z.string().uuid("スタッフIDの形式が不正です"),
  requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません"),
  shift_type: z.enum(REQUESTABLE_SHIFT_TYPES).optional().default("requested_off"),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
```

`optional().default("requested_off")` → 既存のPOSTボディ（shift_typeなし）も互換。

---

### 3. API GET/POST 更新
**ファイル**: `src/app/api/terms/[termId]/requests/route.ts`

**GET（53〜59行）**: `formatted`のmapに `shift_type: r.shift_type` を追加。

**POST**:
- ファイル先頭の定数を変更:
  ```typescript
  // 変更前
  const MAX_REQUESTS_PER_TERM = 3;
  // 変更後
  const MAX_REQUESTED_OFFS_PER_TERM = 3;
  const MAX_SHIFT_PREFS_PER_TERM = 3;
  ```
- 86行: `const { staff_id, requested_date, shift_type } = result.data;` に変更
- 上限チェック（133〜138行）を種別分岐に変更:
  - `requested_off` → `shift_type: "requested_off"` でcount、3件上限
  - `day/evening/night` → `shift_type: { in: ["day","evening","night"] }` でcount、3件上限
- staff取得のselectに `night_shift_available: true` を追加し、`evening`/`night`希望かつ `night_shift_available=false` なら403
- `prisma.shiftRequest.create`の`data`に `shift_type` を追加
- レスポンスに `shift_type: newRequest.shift_type` を追加

---

### 4. シフト生成エンジン更新
**ファイル**: `src/lib/engine/shift-generator.ts`

**4-a. GeneratorInput型（7〜14行）に追加**:
```typescript
type ShiftPreference = {
  staff_id: string;
  date: string;
  shift_type: "day" | "evening" | "night";
};

type GeneratorInput = {
  // 既存フィールド...
  shiftPreferences: ShiftPreference[];  // 追加
};
```

**4-b. `generateShift`関数内、Step 1（120〜124行）の直後にStep 1.5を挿入**:
```typescript
// Step 1.5: Place shift preferences (best-effort)
const { shiftPreferences } = input;
const staffMap = new Map(activeStaff.map((s) => [s.id, s]));
for (const pref of shiftPreferences) {
  const staffObj = staffMap.get(pref.staff_id);
  if (!staffObj) continue;
  if (getShift(grid, pref.staff_id, pref.date)) continue; // requested_off優先
  if (pref.shift_type === "evening" || pref.shift_type === "night") {
    if (!staffObj.night_shift_available) continue;
    if (!canAssignNight(grid, pref.staff_id, pref.date, dates, pref.shift_type)) continue;
  }
  setShift(grid, pref.staff_id, pref.date, pref.shift_type);
}
```

Step 2〜5は既存の `if (current) continue` / `if (!getShift(...))` ガードにより、Step 1.5で配置した値を上書きしない。

---

### 5. シフト生成APIでのShiftRequest分類
**ファイル**: `src/app/api/terms/[termId]/shifts/generate/route.ts`

143〜159行（ShiftRequest取得〜generateShift呼び出し）を変更:
```typescript
const shiftRequests = await prisma.shiftRequest.findMany({ where: { term_id: termId } });

const requestedOffs = shiftRequests
  .filter((r) => r.shift_type === "requested_off")
  .map((r) => ({ staff_id: r.staff_id, date: formatDate(r.requested_date) }));

function isShiftPreferenceType(t: string): t is "day" | "evening" | "night" {
  return t === "day" || t === "evening" || t === "night";
}

const shiftPreferences = shiftRequests
  .filter((r) => isShiftPreferenceType(r.shift_type))
  .map((r) => ({
    staff_id: r.staff_id,
    date: formatDate(r.requested_date),
    shift_type: r.shift_type,
  }));

const result = generateShift({
  staffList, dates, holidayDates, requestedOffs, shiftPreferences,  // shiftPreferences追加
  minDayStaff: term.min_day_staff, seed: Date.now(),
});
```

---

### 6. スタッフUI更新
**ファイル**: `src/app/(staff)/requests/page.tsx`

**6-a. `RequestItem`型**（9〜15行）: `shift_type: RequestableShiftType` を追加（`import type { RequestableShiftType } from "@/lib/validators/request"`）

**6-b. useState追加**: `const [pendingDate, setPendingDate] = useState<string | null>(null);`

**6-c. 残件数計算**（79行）:
```typescript
const requestedOffCount = requests.filter((r) => r.shift_type === "requested_off").length;
const shiftPrefCount = requests.filter((r) => r.shift_type !== "requested_off").length;
const remainingOffCount = 3 - requestedOffCount;
const remainingPrefCount = 3 - shiftPrefCount;
```

**6-d. `handleDateClick` をリファクタ**: 未申請日クリック時は `setPendingDate(date)` のみ（POSTせず）。DELETEは分離関数 `handleDeleteRequest(date)` へ。新規追加用 `handleCreateRequest(date, shiftType)` を追加（shift_typeをPOSTボディに含む）。

**6-e. カレンダーセル色分け**（247〜255行）: `isRequested` 時の色をshift_typeで分岐
- `requested_off`: `bg-blue-600 text-white`（既存のまま変更しない）
- `day`: `bg-gray-700 text-white`
- `evening`: `bg-orange-500 text-white`
- `night`: `bg-indigo-700 text-white`

**6-f. 残件数表示**（205〜209行）: 希望休とシフト希望を別行で表示

**6-g. 申請済みリスト**（270〜295行）: 日付の横にshift_typeバッジ（色付き）を追加

**6-h. 種別選択モーダル**: `pendingDate !== null` の時にオーバーレイ表示。4ボタン（希望休/日勤/準夜/深夜）＋キャンセル。残件数0の場合はdisabled。

---

### 7. 管理者UIパネル更新
**ファイル**: `src/components/term/RequestsPanel.tsx`

**7-a. `RequestItem`型**（6〜12行）: `shift_type: "requested_off" | "day" | "evening" | "night"` を追加

**7-b. useState追加**: `const [selectedShiftType, setSelectedShiftType] = useState("requested_off");`

**7-c. 代理入力フォーム**（155〜165行の日付inputの後）: `shift_type` selectを追加（選択肢: 希望休/希望日勤/希望準夜勤/希望深夜勤）

**7-d. `handleProxySubmit`**（80行）: POSTボディに `shift_type: selectedShiftType` を追加

**7-e. ヘッダー件数表示**（187行）: `（{staffRequests.length}/3）` → 種別別カウント `希望休: {offCount}/3 希望シフト: {prefCount}/3` に変更

**7-f. 一覧バッジ**（190〜204行）: shift_typeで色分け（ピンク/グレー/オレンジ/ブルー）+ 種別ラベル（休/日/準/深）を追加

---

### 8. テスト追加
**ファイル**: `src/lib/engine/__tests__/shift-generator.test.ts`（既存テストファイルに追加）

**8-a. シフト生成エンジンのテスト**:
- 日勤希望が正しく配置される（shiftPreferencesに`day`を渡し、生成結果でその日が`day`になる）
- 夜勤不可スタッフの`night`希望がスキップされる（`night_shift_available=false`のスタッフで`night`希望 → `day`等に配置される）
- `requested_off`が希望シフトより優先される（同一日に`requested_off`と`day`希望がある場合、`requested_off`が勝つ）

**ファイル**: `src/lib/validators/__tests__/request.test.ts`（新規作成）

**8-b. バリデーターのテスト**:
- `shift_type`有り（`"day"`, `"evening"`, `"night"`, `"requested_off"`）で正常パース
- `shift_type`無しでデフォルト`requested_off`になる
- 不正な`shift_type`（`"off"`, `"holiday_off"`, `"invalid"`）でバリデーションエラー

---

## 注意事項

- 既存の上限チェック `count({ where: { staff_id, term_id } })` は全種別混合カウントだった。マイグレーション後は **必ず** `shift_type` フィルタ付きに変える（そうしないと希望休と希望シフトの上限が干渉する）
- `@@unique([staff_id, term_id, requested_date])` の制約により同一日の複数種別申請は不可（DB保証）
- Step 1.5はベストエフォート。夜勤制約や `night_shift_available=false` で配置スキップになった場合、その日は通常フロー（Step 2〜5）で埋まる
- `holiday_off` と `off` はシステム自動付与のため申請不可（バリデーターのenumから除外済み）

---

## 検証方法

1. `npm run check`（lint + typecheck + build）がパスすること
2. DBマイグレーション適用後、既存の希望休レコードの `shift_type` が `requested_off` になっていること（`SELECT shift_type, count(*) FROM shift_requests GROUP BY shift_type`）
3. スタッフとしてログイン → 希望休入力ページ → 日付クリックでモーダル表示 → 各種別で申請 → 上限超過でエラー
4. 夜勤不可スタッフで evening/night 希望申請 → 403エラーになること
5. 管理者として希望休一覧パネルを開く → 各種別のバッジ色・ラベルが正しいこと / 代理入力で shift_type を指定して登録できること
6. シフト生成（collecting → generate）後、希望シフトが反映された日付に対応するシフト種別が配置されること（完全一致でなくともベストエフォートで配置が試みられていること）
