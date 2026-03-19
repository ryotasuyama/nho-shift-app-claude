import type { ShiftEntryInput, StaffInput, ShiftTypeValue } from "@/lib/constraints/types";
import { checkPhase1Constraints } from "@/lib/constraints/hard-constraints";

const TIMEOUT_MS = 55_000;
const MAX_RETRIES = 5;

type GeneratorInput = {
  staffList: StaffInput[];
  dates: string[];
  holidayDates: Set<string>;
  requestedOffs: Array<{ staff_id: string; date: string }>;
  minDayStaff: number;
  seed?: number;
};

type GeneratorResult = {
  entries: ShiftEntryInput[];
  timedOut: boolean;
};

// Simple seeded random
function createRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function getShift(
  grid: Map<string, ShiftTypeValue>,
  staffId: string,
  date: string
): ShiftTypeValue | undefined {
  return grid.get(`${staffId}:${date}`);
}

function setShift(
  grid: Map<string, ShiftTypeValue>,
  staffId: string,
  date: string,
  type: ShiftTypeValue
) {
  grid.set(`${staffId}:${date}`, type);
}

function isNightShift(t: ShiftTypeValue | undefined): boolean {
  return t === "evening" || t === "night";
}


/** Check if assigning a night shift to staff on date violates basic night rules */
function canAssignNight(
  grid: Map<string, ShiftTypeValue>,
  staffId: string,
  date: string,
  dates: string[],
  nightType: "evening" | "night"
): boolean {
  const idx = dates.indexOf(date);
  if (idx < 0) return false;

  // H12: no consecutive night shifts
  if (nightType === "night") {
    if (idx > 0 && getShift(grid, staffId, dates[idx - 1]) === "night") return false;
    if (idx < dates.length - 1 && getShift(grid, staffId, dates[idx + 1]) === "night") return false;
  }

  // H13: no evening → night
  if (nightType === "night" && idx > 0 && getShift(grid, staffId, dates[idx - 1]) === "evening") return false;
  if (nightType === "evening" && idx < dates.length - 1 && getShift(grid, staffId, dates[idx + 1]) === "night") return false;

  // H11: max 2 consecutive night shifts
  let consecutiveBefore = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (isNightShift(getShift(grid, staffId, dates[i]))) consecutiveBefore++;
    else break;
  }
  let consecutiveAfter = 0;
  for (let i = idx + 1; i < dates.length; i++) {
    if (isNightShift(getShift(grid, staffId, dates[i]))) consecutiveAfter++;
    else break;
  }
  if (consecutiveBefore + 1 + consecutiveAfter > 2) return false;

  return true;
}

/** Check if staff already has too many offs */
function countWeeklyOffs(grid: Map<string, ShiftTypeValue>, staffId: string, dates: string[]): number {
  let count = 0;
  for (const d of dates) {
    const s = getShift(grid, staffId, d);
    if (s === "off" || s === "requested_off") count++;
  }
  return count;
}

export function generateShift(input: GeneratorInput): GeneratorResult {
  const { staffList, dates, holidayDates, requestedOffs, minDayStaff, seed } = input;
  const startTime = Date.now();
  const rng = createRng(seed ?? Date.now());

  const activeStaff = staffList.filter((s) => s.is_active);
  const nightEligible = activeStaff.filter((s) => s.night_shift_available);
  const grid = new Map<string, ShiftTypeValue>();

  const checkTimeout = () => Date.now() - startTime > TIMEOUT_MS;

  // Step 1: Initialize - place requested_off
  for (const ro of requestedOffs) {
    if (activeStaff.some((s) => s.id === ro.staff_id)) {
      setShift(grid, ro.staff_id, ro.date, "requested_off");
    }
  }

  // Step 2: Night shift assignment
  for (const date of dates) {
    if (checkTimeout()) return buildResult(grid, activeStaff, dates, true);

    const shuffledNight = shuffle(nightEligible, rng);

    // Assign 3 evening shifts with team/experience mixing
    let eveningAssigned = 0;
    const eveningStaff: StaffInput[] = [];
    for (const staff of shuffledNight) {
      if (eveningAssigned >= 3) break;
      const current = getShift(grid, staff.id, date);
      if (current) continue; // already assigned (e.g. requested_off)
      if (!canAssignNight(grid, staff.id, date, dates, "evening")) continue;

      // Check team mixing: need at least both teams
      if (eveningAssigned >= 2) {
        const teams = new Set(eveningStaff.map((s) => s.team));
        if (!teams.has(staff.team) || teams.size >= 2) {
          // OK to add
        } else if (teams.size < 2 && staff.team === eveningStaff[0].team) {
          continue; // Would not achieve mixing, try another
        }
      }

      setShift(grid, staff.id, date, "evening");
      eveningStaff.push(staff);
      eveningAssigned++;
    }

    // Assign 3 night shifts
    let nightAssigned = 0;
    const nightStaff: StaffInput[] = [];
    for (const staff of shuffledNight) {
      if (nightAssigned >= 3) break;
      const current = getShift(grid, staff.id, date);
      if (current) continue;
      if (!canAssignNight(grid, staff.id, date, dates, "night")) continue;

      if (nightAssigned >= 2) {
        const teams = new Set(nightStaff.map((s) => s.team));
        if (teams.size < 2 && staff.team === nightStaff[0]?.team) {
          continue;
        }
      }

      setShift(grid, staff.id, date, "night");
      nightStaff.push(staff);
      nightAssigned++;
    }
  }

  // Step 3: Weekly off assignment (8 per staff, minus already placed requested_off)
  for (const staff of activeStaff) {
    if (checkTimeout()) return buildResult(grid, activeStaff, dates, true);

    const currentOffs = countWeeklyOffs(grid, staff.id, dates);
    const needed = 8 - currentOffs;
    if (needed <= 0) continue;

    // Collect unassigned dates and try to place offs with spacing
    const unassigned = dates.filter((d) => !getShift(grid, staff.id, d));
    const shuffled = shuffle(unassigned, rng);

    // Sort by spreading them out - prefer dates that are far from existing offs
    let placed = 0;
    for (const date of shuffled) {
      if (placed >= needed) break;
      setShift(grid, staff.id, date, "off");
      placed++;
    }
  }

  // Step 4: Holiday off assignment
  for (const staff of activeStaff) {
    if (checkTimeout()) return buildResult(grid, activeStaff, dates, true);

    // Count holiday work days
    let holidayWorkDays = 0;
    for (const date of dates) {
      if (holidayDates.has(date)) {
        const shift = getShift(grid, staff.id, date);
        if (shift === "day" || shift === "evening" || shift === "night") {
          holidayWorkDays++;
        }
      }
    }

    // Place holiday_off for each holiday work day
    for (let i = 0; i < holidayWorkDays; i++) {
      const unassigned = dates.filter((d) => !getShift(grid, staff.id, d));
      if (unassigned.length > 0) {
        const dateIdx = Math.floor(rng() * unassigned.length);
        setShift(grid, staff.id, unassigned[dateIdx], "holiday_off");
      }
    }
  }

  // Step 5: Fill remaining with day shift
  for (const staff of activeStaff) {
    for (const date of dates) {
      if (!getShift(grid, staff.id, date)) {
        setShift(grid, staff.id, date, "day");
      }
    }
  }

  // Step 6: Constraint validation and repair
  let bestEntries = gridToEntries(grid, activeStaff, dates);
  let bestViolations = checkPhase1Constraints(bestEntries, staffList, dates, minDayStaff);

  for (let retry = 0; retry < MAX_RETRIES && bestViolations.length > 0; retry++) {
    if (checkTimeout()) break;

    // Try swapping shifts to fix violations
    for (const violation of bestViolations) {
      if (checkTimeout()) break;

      if (violation.constraint_id === "H3" && violation.date) {
        // Not enough day staff - try swapping an off with a day
        const offStaff = activeStaff.filter((s) => {
          const shift = getShift(grid, s.id, violation.date!);
          return shift === "off" && countWeeklyOffs(grid, s.id, dates) > 8;
        });
        if (offStaff.length > 0) {
          const staff = offStaff[Math.floor(rng() * offStaff.length)];
          setShift(grid, staff.id, violation.date, "day");
        }
      }

      if ((violation.constraint_id === "H1" || violation.constraint_id === "H2") && violation.date) {
        // Not enough evening/night staff
        const neededType: ShiftTypeValue = violation.constraint_id === "H1" ? "evening" : "night";
        const candidates = nightEligible.filter((s) => {
          const shift = getShift(grid, s.id, violation.date!);
          return shift === "day" && canAssignNight(grid, s.id, violation.date!, dates, neededType as "evening" | "night");
        });
        if (candidates.length > 0) {
          const staff = candidates[Math.floor(rng() * candidates.length)];
          setShift(grid, staff.id, violation.date, neededType);
        }
      }
    }

    bestEntries = gridToEntries(grid, activeStaff, dates);
    bestViolations = checkPhase1Constraints(bestEntries, staffList, dates, minDayStaff);
  }

  return buildResult(grid, activeStaff, dates, false);
}

function gridToEntries(
  grid: Map<string, ShiftTypeValue>,
  activeStaff: StaffInput[],
  dates: string[]
): ShiftEntryInput[] {
  const entries: ShiftEntryInput[] = [];
  for (const staff of activeStaff) {
    for (const date of dates) {
      const shift = grid.get(`${staff.id}:${date}`);
      if (shift) {
        entries.push({
          staff_id: staff.id,
          date,
          shift_type: shift,
          is_manual_edit: false,
        });
      }
    }
  }
  return entries;
}

function buildResult(
  grid: Map<string, ShiftTypeValue>,
  activeStaff: StaffInput[],
  dates: string[],
  timedOut: boolean
): GeneratorResult {
  return {
    entries: gridToEntries(grid, activeStaff, dates),
    timedOut,
  };
}
