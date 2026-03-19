import type {
  ConstraintViolation,
  ShiftEntryInput,
  StaffInput,
  ShiftTypeValue,
} from "./types";

// Helper: get shift type for a staff on a date
function getShift(
  entries: ShiftEntryInput[],
  staffId: string,
  date: string
): ShiftTypeValue | undefined {
  return entries.find((e) => e.staff_id === staffId && e.date === date)?.shift_type;
}

// Helper: is a shift type a rest day
function isOff(t: ShiftTypeValue | undefined): boolean {
  return t === "off" || t === "requested_off" || t === "holiday_off";
}

// Helper: is night shift (evening or night)
function isNightShift(t: ShiftTypeValue | undefined): boolean {
  return t === "evening" || t === "night";
}

// =========================================================
// Phase 1 constraints
// =========================================================

/** H1: 準夜勤 毎日3名 */
export function checkH1(
  entries: ShiftEntryInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const date of dates) {
    const count = entries.filter((e) => e.date === date && e.shift_type === "evening").length;
    if (count < 3) {
      violations.push({
        constraint_id: "H1",
        phase: 1,
        severity: "hard",
        date,
        message: `準夜勤が${count}名です（必要: 3名）`,
      });
    }
  }
  return violations;
}

/** H2: 深夜勤 毎日3名 */
export function checkH2(
  entries: ShiftEntryInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const date of dates) {
    const count = entries.filter((e) => e.date === date && e.shift_type === "night").length;
    if (count < 3) {
      violations.push({
        constraint_id: "H2",
        phase: 1,
        severity: "hard",
        date,
        message: `深夜勤が${count}名です（必要: 3名）`,
      });
    }
  }
  return violations;
}

/** H3: 日勤 毎日最低N名（デフォルト7） */
export function checkH3(
  entries: ShiftEntryInput[],
  dates: string[],
  minDayStaff = 7
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const date of dates) {
    const count = entries.filter((e) => e.date === date && e.shift_type === "day").length;
    if (count < minDayStaff) {
      violations.push({
        constraint_id: "H3",
        phase: 1,
        severity: "hard",
        date,
        message: `日勤が${count}名です（最低: ${minDayStaff}名）`,
      });
    }
  }
  return violations;
}

/** H4: 夜勤不可スタッフの除外 */
export function checkH4(
  entries: ShiftEntryInput[],
  staffList: StaffInput[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const noNightStaff = new Set(
    staffList.filter((s) => !s.night_shift_available).map((s) => s.id)
  );
  for (const entry of entries) {
    if (noNightStaff.has(entry.staff_id) && isNightShift(entry.shift_type)) {
      violations.push({
        constraint_id: "H4",
        phase: 1,
        severity: "hard",
        staff_id: entry.staff_id,
        date: entry.date,
        message: "夜勤不可スタッフに夜勤が割り当てられています",
      });
    }
  }
  return violations;
}

/** H5: 週休8回/ターム (off + requested_off = 8) */
export function checkH5(
  entries: ShiftEntryInput[],
  staffList: StaffInput[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const activeStaff = staffList.filter((s) => s.is_active);
  for (const staff of activeStaff) {
    const weeklyOffs = entries.filter(
      (e) =>
        e.staff_id === staff.id &&
        (e.shift_type === "off" || e.shift_type === "requested_off")
    ).length;
    if (weeklyOffs !== 8) {
      violations.push({
        constraint_id: "H5",
        phase: 1,
        severity: "hard",
        staff_id: staff.id,
        message: `週休が${weeklyOffs}回です（必要: 8回）`,
      });
    }
  }
  return violations;
}

/** H11: 夜勤連続最大2日 */
export function checkH11(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const staff of staffList.filter((s) => s.is_active)) {
    let consecutive = 0;
    for (const date of dates) {
      const shift = getShift(entries, staff.id, date);
      if (isNightShift(shift)) {
        consecutive++;
        if (consecutive >= 3) {
          violations.push({
            constraint_id: "H11",
            phase: 1,
            severity: "hard",
            staff_id: staff.id,
            date,
            message: `夜勤が${consecutive}日連続です（最大: 2日）`,
          });
        }
      } else {
        consecutive = 0;
      }
    }
  }
  return violations;
}

/** H12: 深夜勤2連続禁止 */
export function checkH12(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const staff of staffList.filter((s) => s.is_active)) {
    for (let i = 1; i < dates.length; i++) {
      const prev = getShift(entries, staff.id, dates[i - 1]);
      const curr = getShift(entries, staff.id, dates[i]);
      if (prev === "night" && curr === "night") {
        violations.push({
          constraint_id: "H12",
          phase: 1,
          severity: "hard",
          staff_id: staff.id,
          date: dates[i],
          message: "深夜勤が2日連続しています",
        });
      }
    }
  }
  return violations;
}

/** H13: 準夜→深夜禁止 */
export function checkH13(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const staff of staffList.filter((s) => s.is_active)) {
    for (let i = 1; i < dates.length; i++) {
      const prev = getShift(entries, staff.id, dates[i - 1]);
      const curr = getShift(entries, staff.id, dates[i]);
      if (prev === "evening" && curr === "night") {
        violations.push({
          constraint_id: "H13",
          phase: 1,
          severity: "hard",
          staff_id: staff.id,
          date: dates[i],
          message: "準夜勤の翌日に深夜勤が割り当てられています",
        });
      }
    }
  }
  return violations;
}

/** H17: 夜勤帯の経験者混在（各日の evening/night に経験3年以上が1名以上） */
export function checkH17(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const staffMap = new Map(staffList.map((s) => [s.id, s]));

  for (const date of dates) {
    // Check evening shift
    const eveningStaff = entries
      .filter((e) => e.date === date && e.shift_type === "evening")
      .map((e) => staffMap.get(e.staff_id))
      .filter(Boolean);
    if (eveningStaff.length > 0 && !eveningStaff.some((s) => s!.experience_years >= 3)) {
      violations.push({
        constraint_id: "H17",
        phase: 1,
        severity: "hard",
        date,
        message: "準夜勤に経験3年以上のスタッフがいません",
      });
    }

    // Check night shift
    const nightStaff = entries
      .filter((e) => e.date === date && e.shift_type === "night")
      .map((e) => staffMap.get(e.staff_id))
      .filter(Boolean);
    if (nightStaff.length > 0 && !nightStaff.some((s) => s!.experience_years >= 3)) {
      violations.push({
        constraint_id: "H17",
        phase: 1,
        severity: "hard",
        date,
        message: "深夜勤に経験3年以上のスタッフがいません",
      });
    }
  }
  return violations;
}

/** H18: 夜勤帯のチーム混在（各日の evening/night にチームA/B混在） */
export function checkH18(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const staffMap = new Map(staffList.map((s) => [s.id, s]));

  for (const date of dates) {
    // Check evening shift
    const eveningTeams = new Set(
      entries
        .filter((e) => e.date === date && e.shift_type === "evening")
        .map((e) => staffMap.get(e.staff_id)?.team)
        .filter(Boolean)
    );
    if (eveningTeams.size > 0 && eveningTeams.size < 2) {
      violations.push({
        constraint_id: "H18",
        phase: 1,
        severity: "hard",
        date,
        message: "準夜勤のチーム混在が確保されていません",
      });
    }

    // Check night shift
    const nightTeams = new Set(
      entries
        .filter((e) => e.date === date && e.shift_type === "night")
        .map((e) => staffMap.get(e.staff_id)?.team)
        .filter(Boolean)
    );
    if (nightTeams.size > 0 && nightTeams.size < 2) {
      violations.push({
        constraint_id: "H18",
        phase: 1,
        severity: "hard",
        date,
        message: "深夜勤のチーム混在が確保されていません",
      });
    }
  }
  return violations;
}

// =========================================================
// Phase 2 constraints
// =========================================================

/** H6: 週休間隔最大5日 */
export function checkH6(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const staff of staffList.filter((s) => s.is_active)) {
    let lastOffIndex = -1;
    for (let i = 0; i < dates.length; i++) {
      const shift = getShift(entries, staff.id, dates[i]);
      if (shift === "off" || shift === "requested_off") {
        if (lastOffIndex >= 0) {
          const gap = i - lastOffIndex - 1;
          if (gap > 5) {
            // Check if holiday_off exists in the gap (allowed)
            let hasHolidayOff = false;
            for (let j = lastOffIndex + 1; j < i; j++) {
              const s = getShift(entries, staff.id, dates[j]);
              if (s === "holiday_off") {
                hasHolidayOff = true;
                break;
              }
            }
            if (!hasHolidayOff) {
              violations.push({
                constraint_id: "H6",
                phase: 2,
                severity: "hard",
                staff_id: staff.id,
                date: dates[i],
                message: `週休間隔が${gap}日です（最大: 5日）`,
              });
            }
          }
        }
        lastOffIndex = i;
      }
    }
  }
  return violations;
}

/** H7: 土日連休1回以上 */
export function checkH7(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const staff of staffList.filter((s) => s.is_active)) {
    let hasSatSunOff = false;
    for (let i = 0; i < dates.length - 1; i++) {
      const d = new Date(dates[i] + "T00:00:00Z");
      if (d.getUTCDay() === 6) {
        // Saturday
        const satShift = getShift(entries, staff.id, dates[i]);
        const sunShift = getShift(entries, staff.id, dates[i + 1]);
        if (isOff(satShift) && isOff(sunShift)) {
          hasSatSunOff = true;
          break;
        }
      }
    }
    if (!hasSatSunOff) {
      violations.push({
        constraint_id: "H7",
        phase: 2,
        severity: "hard",
        staff_id: staff.id,
        message: "ターム内に土日連休がありません",
      });
    }
  }
  return violations;
}

/** H8: 平日連休1回以上 */
export function checkH8(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const staff of staffList.filter((s) => s.is_active)) {
    let hasWeekdayConsecutiveOff = false;
    for (let i = 0; i < dates.length - 1; i++) {
      const d1 = new Date(dates[i] + "T00:00:00Z");
      const d2 = new Date(dates[i + 1] + "T00:00:00Z");
      const dow1 = d1.getUTCDay();
      const dow2 = d2.getUTCDay();
      // Both weekdays (not Saturday or Sunday)
      if (dow1 !== 0 && dow1 !== 6 && dow2 !== 0 && dow2 !== 6) {
        const s1 = getShift(entries, staff.id, dates[i]);
        const s2 = getShift(entries, staff.id, dates[i + 1]);
        if (isOff(s1) && isOff(s2)) {
          hasWeekdayConsecutiveOff = true;
          break;
        }
      }
    }
    if (!hasWeekdayConsecutiveOff) {
      violations.push({
        constraint_id: "H8",
        phase: 2,
        severity: "hard",
        staff_id: staff.id,
        message: "ターム内に平日連休がありません",
      });
    }
  }
  return violations;
}

/** H9: 48時間以上休み（2日連続休み + 初日前日がevening以外） */
export function checkH9(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const staff of staffList.filter((s) => s.is_active)) {
    let has48hRest = false;
    for (let i = 0; i < dates.length - 1; i++) {
      const s1 = getShift(entries, staff.id, dates[i]);
      const s2 = getShift(entries, staff.id, dates[i + 1]);
      if (isOff(s1) && isOff(s2)) {
        // Check prev day is not evening
        const prevShift = i > 0 ? getShift(entries, staff.id, dates[i - 1]) : undefined;
        if (prevShift !== "evening") {
          has48hRest = true;
          break;
        }
      }
    }
    if (!has48hRest) {
      violations.push({
        constraint_id: "H9",
        phase: 2,
        severity: "hard",
        staff_id: staff.id,
        message: "ターム内に48時間以上の休みがありません",
      });
    }
  }
  return violations;
}

/** H10: 法定週休4回以上（前日がevening以外の休み） */
export function checkH10(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const staff of staffList.filter((s) => s.is_active)) {
    let legalOff = 0;
    for (let i = 0; i < dates.length; i++) {
      const shift = getShift(entries, staff.id, dates[i]);
      if (isOff(shift)) {
        const prevShift = i > 0 ? getShift(entries, staff.id, dates[i - 1]) : undefined;
        if (prevShift !== "evening") {
          legalOff++;
        }
      }
    }
    if (legalOff < 4) {
      violations.push({
        constraint_id: "H10",
        phase: 2,
        severity: "hard",
        staff_id: staff.id,
        message: `法定週休が${legalOff}回です（必要: 4回以上）`,
      });
    }
  }
  return violations;
}

/** H14: 準夜→休→深夜禁止 */
export function checkH14(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const staff of staffList.filter((s) => s.is_active)) {
    for (let i = 2; i < dates.length; i++) {
      const s0 = getShift(entries, staff.id, dates[i - 2]);
      const s1 = getShift(entries, staff.id, dates[i - 1]);
      const s2 = getShift(entries, staff.id, dates[i]);
      if (s0 === "evening" && isOff(s1) && s2 === "night") {
        violations.push({
          constraint_id: "H14",
          phase: 2,
          severity: "hard",
          staff_id: staff.id,
          date: dates[i],
          message: "準夜→休→深夜のパターンが検出されました",
        });
      }
    }
  }
  return violations;
}

/** H15: 準夜→休→日勤→深夜禁止 */
export function checkH15(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const staff of staffList.filter((s) => s.is_active)) {
    for (let i = 3; i < dates.length; i++) {
      const s0 = getShift(entries, staff.id, dates[i - 3]);
      const s1 = getShift(entries, staff.id, dates[i - 2]);
      const s2 = getShift(entries, staff.id, dates[i - 1]);
      const s3 = getShift(entries, staff.id, dates[i]);
      if (s0 === "evening" && isOff(s1) && s2 === "day" && s3 === "night") {
        violations.push({
          constraint_id: "H15",
          phase: 2,
          severity: "hard",
          staff_id: staff.id,
          date: dates[i],
          message: "準夜→休→日勤→深夜のパターンが検出されました",
        });
      }
    }
  }
  return violations;
}

/** H16: 夜勤ブロック間3日以上 */
export function checkH16(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  for (const staff of staffList.filter((s) => s.is_active)) {
    let lastNightBlockEnd = -1;
    let inNightBlock = false;

    for (let i = 0; i < dates.length; i++) {
      const shift = getShift(entries, staff.id, dates[i]);
      if (isNightShift(shift)) {
        if (!inNightBlock) {
          // Start of new night block
          if (lastNightBlockEnd >= 0) {
            const gap = i - lastNightBlockEnd - 1;
            if (gap < 3) {
              violations.push({
                constraint_id: "H16",
                phase: 2,
                severity: "hard",
                staff_id: staff.id,
                date: dates[i],
                message: `夜勤ブロック間が${gap}日です（最低: 3日）`,
              });
            }
          }
          inNightBlock = true;
        }
      } else {
        if (inNightBlock) {
          lastNightBlockEnd = i - 1;
          inNightBlock = false;
        }
      }
    }
  }
  return violations;
}

// =========================================================
// Aggregate check functions
// =========================================================

export function checkPhase1Constraints(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[],
  minDayStaff = 7
): ConstraintViolation[] {
  return [
    ...checkH1(entries, dates),
    ...checkH2(entries, dates),
    ...checkH3(entries, dates, minDayStaff),
    ...checkH4(entries, staffList),
    ...checkH5(entries, staffList),
    ...checkH11(entries, staffList, dates),
    ...checkH12(entries, staffList, dates),
    ...checkH13(entries, staffList, dates),
    ...checkH17(entries, staffList, dates),
    ...checkH18(entries, staffList, dates),
  ];
}

export function checkPhase2Constraints(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): ConstraintViolation[] {
  return [
    ...checkH6(entries, staffList, dates),
    ...checkH7(entries, staffList, dates),
    ...checkH8(entries, staffList, dates),
    ...checkH9(entries, staffList, dates),
    ...checkH10(entries, staffList, dates),
    ...checkH14(entries, staffList, dates),
    ...checkH15(entries, staffList, dates),
    ...checkH16(entries, staffList, dates),
  ];
}

export function checkAllHardConstraints(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[],
  minDayStaff = 7
): ConstraintViolation[] {
  return [
    ...checkPhase1Constraints(entries, staffList, dates, minDayStaff),
    ...checkPhase2Constraints(entries, staffList, dates),
  ];
}
