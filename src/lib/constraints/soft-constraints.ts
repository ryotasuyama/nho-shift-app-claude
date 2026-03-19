import type {
  ConstraintViolation,
  ShiftEntryInput,
  StaffInput,
} from "./types";

/** S1: 夜勤回数の均等化（目標: ±1回以内） */
export function checkS1(
  entries: ShiftEntryInput[],
  staffList: StaffInput[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const nightEligible = staffList.filter((s) => s.is_active && s.night_shift_available);
  if (nightEligible.length < 2) return violations;

  const nightCounts = nightEligible.map((s) => {
    const count = entries.filter(
      (e) => e.staff_id === s.id && (e.shift_type === "evening" || e.shift_type === "night")
    ).length;
    return { staff_id: s.id, count };
  });

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
export function checkS2(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const activeStaff = staffList.filter((s) => s.is_active);
  if (activeStaff.length < 2) return violations;

  const weekendDates = dates.filter((d) => {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    return dow === 0 || dow === 6;
  });

  const weekendOffCounts = activeStaff.map((s) => {
    const count = entries.filter(
      (e) =>
        e.staff_id === s.id &&
        weekendDates.includes(e.date) &&
        (e.shift_type === "off" || e.shift_type === "requested_off" || e.shift_type === "holiday_off")
    ).length;
    return { staff_id: s.id, count };
  });

  const counts = weekendOffCounts.map((w) => w.count);
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
export function checkS3(
  entries: ShiftEntryInput[],
  staffList: StaffInput[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const activeStaff = staffList.filter((s) => s.is_active);
  if (activeStaff.length < 2) return violations;

  const workCounts = activeStaff.map((s) => {
    const count = entries.filter(
      (e) =>
        e.staff_id === s.id &&
        (e.shift_type === "day" || e.shift_type === "evening" || e.shift_type === "night")
    ).length;
    return count;
  });

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
export function checkS4(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  _dates: string[],
  holidayDates: Set<string>
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const activeStaff = staffList.filter((s) => s.is_active);

  for (const staff of activeStaff) {
    // Count days staff worked on holidays
    const holidayWorkDays = entries.filter(
      (e) =>
        e.staff_id === staff.id &&
        holidayDates.has(e.date) &&
        (e.shift_type === "day" || e.shift_type === "evening" || e.shift_type === "night")
    ).length;

    // Count holiday_off entries
    const holidayOffDays = entries.filter(
      (e) => e.staff_id === staff.id && e.shift_type === "holiday_off"
    ).length;

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
    ...checkS4(entries, staffList, dates, holidayDates),
  ];
}
