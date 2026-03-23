import type {
  ConstraintViolation,
  ShiftEntryInput,
  StaffInput,
} from "./types";

/** S1: 夜勤回数の均等化（目標: ±1回以内） */
function checkS1(
  entries: ShiftEntryInput[],
  staffList: StaffInput[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const nightEligible = staffList.filter((s) => s.is_active && s.night_shift_available);
  if (nightEligible.length < 2) return violations;

  // Build night counts in one pass
  const nightCountMap = new Map<string, number>();
  for (const e of entries) {
    if (e.shift_type === "evening" || e.shift_type === "night") {
      nightCountMap.set(e.staff_id, (nightCountMap.get(e.staff_id) ?? 0) + 1);
    }
  }

  const nightCounts = nightEligible.map((s) => ({
    staff_id: s.id,
    count: nightCountMap.get(s.id) ?? 0,
  }));

  const counts = nightCounts.map((n) => n.count);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const diff = maxCount - minCount;

  if (diff > 1) {
    const maxStaff = nightCounts.filter((n) => n.count === maxCount).map((n) => n.staff_id);
    const minStaff = nightCounts.filter((n) => n.count === minCount).map((n) => n.staff_id);
    violations.push({
      constraint_id: "S1",
      phase: 2,
      severity: "soft",
      message: `夜勤回数の差が${diff}回（目標: ±1回以内）`,
      staff_id: [...maxStaff, ...minStaff][0],
    });
  }
  return violations;
}

/** S2: 週末休みの均等化（目標: ±1回以内） */
function checkS2(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const activeStaff = staffList.filter((s) => s.is_active);
  if (activeStaff.length < 2) return violations;

  const weekendDateSet = new Set<string>();
  for (const d of dates) {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    if (dow === 0 || dow === 6) weekendDateSet.add(d);
  }

  // Build weekend-off counts in one pass
  const weekendOffMap = new Map<string, number>();
  for (const e of entries) {
    if (
      weekendDateSet.has(e.date) &&
      (e.shift_type === "off" || e.shift_type === "requested_off" || e.shift_type === "holiday_off")
    ) {
      weekendOffMap.set(e.staff_id, (weekendOffMap.get(e.staff_id) ?? 0) + 1);
    }
  }

  const counts = activeStaff.map((s) => weekendOffMap.get(s.id) ?? 0);
  const diff = Math.max(...counts) - Math.min(...counts);

  if (diff > 1) {
    violations.push({
      constraint_id: "S2",
      phase: 2,
      severity: "soft",
      message: `週末休みの差が${diff}回（目標: ±1回以内）`,
    });
  }
  return violations;
}

/** S3: 勤務時間の均等化（目標: ±7.75h = 1シフト分） */
function checkS3(
  entries: ShiftEntryInput[],
  staffList: StaffInput[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const activeStaff = staffList.filter((s) => s.is_active);
  if (activeStaff.length < 2) return violations;

  // Build work counts in one pass
  const workCountMap = new Map<string, number>();
  for (const e of entries) {
    if (e.shift_type === "day" || e.shift_type === "evening" || e.shift_type === "night") {
      workCountMap.set(e.staff_id, (workCountMap.get(e.staff_id) ?? 0) + 1);
    }
  }

  const workCounts = activeStaff.map((s) => workCountMap.get(s.id) ?? 0);
  const diff = Math.max(...workCounts) - Math.min(...workCounts);
  if (diff > 1) {
    violations.push({
      constraint_id: "S3",
      phase: 2,
      severity: "soft",
      message: `勤務回数の差が${diff}回（目標: ±1回以内）`,
    });
  }
  return violations;
}

/** S4: 代休の同一ターム消化 */
function checkS4(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  holidayDates: Set<string>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const activeStaff = staffList.filter((s) => s.is_active);

  // Build counts in one pass
  const holidayWorkMap = new Map<string, number>();
  const holidayOffMap = new Map<string, number>();
  for (const e of entries) {
    if (e.shift_type === "holiday_off") {
      holidayOffMap.set(e.staff_id, (holidayOffMap.get(e.staff_id) ?? 0) + 1);
    } else if (
      holidayDates.has(e.date) &&
      (e.shift_type === "day" || e.shift_type === "evening" || e.shift_type === "night")
    ) {
      holidayWorkMap.set(e.staff_id, (holidayWorkMap.get(e.staff_id) ?? 0) + 1);
    }
  }

  for (const staff of activeStaff) {
    const holidayWorkDays = holidayWorkMap.get(staff.id) ?? 0;
    const holidayOffDays = holidayOffMap.get(staff.id) ?? 0;

    if (holidayWorkDays > holidayOffDays) {
      violations.push({
        constraint_id: "S4",
        phase: 2,
        severity: "soft",
        staff_id: staff.id,
        message: `代休が${holidayWorkDays - holidayOffDays}日不足しています`,
      });
    }
  }
  return violations;
}

export function checkAllSoftConstraints(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[],
  holidayDates: Set<string>
): ConstraintViolation[] {
  return [
    ...checkS1(entries, staffList),
    ...checkS2(entries, staffList, dates),
    ...checkS3(entries, staffList),
    ...checkS4(entries, staffList, holidayDates),
  ];
}
