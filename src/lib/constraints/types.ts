export type ConstraintPhase = 1 | 2;

export type ConstraintSeverity = "hard" | "soft";

export type ConstraintId =
  | "H1"
  | "H2"
  | "H3"
  | "H4"
  | "H5"
  | "H6"
  | "H7"
  | "H8"
  | "H9"
  | "H10"
  | "H11"
  | "H12"
  | "H13"
  | "H14"
  | "H15"
  | "H16"
  | "H17"
  | "H18"
  | "H19"
  | "S1"
  | "S2"
  | "S3"
  | "S4";

export type ConstraintViolation = {
  constraint_id: ConstraintId;
  phase: ConstraintPhase;
  severity: ConstraintSeverity;
  staff_id?: string;
  date?: string;
  message: string;
};

export type ConstraintDefinition = {
  id: ConstraintId;
  phase: ConstraintPhase;
  severity: ConstraintSeverity;
  description: string;
};

export const HARD_CONSTRAINTS_PHASE1: ConstraintDefinition[] = [
  { id: "H1", phase: 1, severity: "hard", description: "準夜勤 毎日3名" },
  { id: "H2", phase: 1, severity: "hard", description: "深夜勤 毎日3名" },
  { id: "H3", phase: 1, severity: "hard", description: "日勤 毎日最低7名" },
  { id: "H4", phase: 1, severity: "hard", description: "夜勤不可スタッフの除外" },
  { id: "H5", phase: 1, severity: "hard", description: "週休8回/ターム" },
  { id: "H11", phase: 1, severity: "hard", description: "夜勤連続最大2日" },
  { id: "H12", phase: 1, severity: "hard", description: "深夜勤2連続禁止" },
  { id: "H13", phase: 1, severity: "hard", description: "準夜→深夜禁止" },
  { id: "H17", phase: 1, severity: "hard", description: "夜勤帯の経験者混在" },
  { id: "H18", phase: 1, severity: "hard", description: "夜勤帯のチーム混在" },
];

export const HARD_CONSTRAINTS_PHASE2: ConstraintDefinition[] = [
  { id: "H6", phase: 2, severity: "hard", description: "週休間隔最大5日" },
  { id: "H7", phase: 2, severity: "hard", description: "土日連休1回以上" },
  { id: "H8", phase: 2, severity: "hard", description: "平日連休1回以上" },
  { id: "H9", phase: 2, severity: "hard", description: "48時間以上休み" },
  { id: "H10", phase: 2, severity: "hard", description: "法定週休4回以上" },
  { id: "H14", phase: 2, severity: "hard", description: "準夜→休→深夜禁止" },
  { id: "H15", phase: 2, severity: "hard", description: "準夜→休→日勤→深夜禁止" },
  { id: "H16", phase: 2, severity: "hard", description: "夜勤ブロック間3日以上" },
  { id: "H19", phase: 2, severity: "hard", description: "ターム境界制約" },
];

export const SOFT_CONSTRAINTS: ConstraintDefinition[] = [
  { id: "S1", phase: 2, severity: "soft", description: "夜勤回数の均等化" },
  { id: "S2", phase: 2, severity: "soft", description: "週末休みの均等化" },
  { id: "S3", phase: 2, severity: "soft", description: "勤務時間の均等化" },
  { id: "S4", phase: 2, severity: "soft", description: "代休の同一ターム消化" },
];

export type ShiftTypeValue =
  | "day"
  | "evening"
  | "night"
  | "off"
  | "holiday_off"
  | "requested_off";

export type ShiftEntryInput = {
  staff_id: string;
  date: string;
  shift_type: ShiftTypeValue;
  is_manual_edit: boolean;
};

export type StaffInput = {
  id: string;
  experience_years: number;
  team: "A" | "B";
  night_shift_available: boolean;
  is_active: boolean;
};
