import type { ShiftEntryInput, StaffInput } from "@/lib/constraints/types";
import {
  WORKING_HOURS_PER_SHIFT,
  STANDARD_WORKING_HOURS,
  type StaffStatistics,
  type DailyStatistics,
  type TermStatistics,
} from "./types";

export function calculateStaffStatistics(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  _dates: string[]
): StaffStatistics[] {
  const activeStaff = staffList.filter((s) => s.is_active);

  return activeStaff.map((staff) => {
    const staffEntries = entries.filter((e) => e.staff_id === staff.id);

    let dayCount = 0;
    let eveningCount = 0;
    let nightCount = 0;
    let offCount = 0;
    let requestedOffCount = 0;
    let holidayOffCount = 0;

    for (const entry of staffEntries) {
      switch (entry.shift_type) {
        case "day":
          dayCount++;
          break;
        case "evening":
          eveningCount++;
          break;
        case "night":
          nightCount++;
          break;
        case "off":
          offCount++;
          break;
        case "requested_off":
          requestedOffCount++;
          break;
        case "holiday_off":
          holidayOffCount++;
          break;
      }
    }

    const weeklyOffTotal = offCount + requestedOffCount;
    const totalWorkingHours = (dayCount + eveningCount + nightCount) * WORKING_HOURS_PER_SHIFT;
    // Standard hours adjusted for holiday_off (each reduces standard by one shift)
    const standardWorkingHours = STANDARD_WORKING_HOURS - holidayOffCount * WORKING_HOURS_PER_SHIFT;
    const hoursDiff = totalWorkingHours - standardWorkingHours;

    return {
      staff_id: staff.id,
      total_working_hours: totalWorkingHours,
      standard_working_hours: standardWorkingHours,
      hours_diff: hoursDiff,
      day_count: dayCount,
      evening_count: eveningCount,
      night_count: nightCount,
      off_count: offCount,
      requested_off_count: requestedOffCount,
      holiday_off_count: holidayOffCount,
      weekly_off_total: weeklyOffTotal,
    };
  });
}

export function calculateDailyStatistics(
  entries: ShiftEntryInput[],
  dates: string[]
): DailyStatistics[] {
  return dates.map((date) => {
    const dayEntries = entries.filter((e) => e.date === date);

    let dayCount = 0;
    let eveningCount = 0;
    let nightCount = 0;
    let offCount = 0;

    for (const entry of dayEntries) {
      switch (entry.shift_type) {
        case "day":
          dayCount++;
          break;
        case "evening":
          eveningCount++;
          break;
        case "night":
          nightCount++;
          break;
        case "off":
        case "requested_off":
        case "holiday_off":
          offCount++;
          break;
      }
    }

    return {
      date,
      day_count: dayCount,
      evening_count: eveningCount,
      night_count: nightCount,
      off_count: offCount,
      total_staff: dayEntries.length,
    };
  });
}

export function calculateTermStatistics(
  entries: ShiftEntryInput[],
  staffList: StaffInput[],
  dates: string[]
): TermStatistics {
  return {
    staff_stats: calculateStaffStatistics(entries, staffList, dates),
    daily_stats: calculateDailyStatistics(entries, dates),
  };
}
