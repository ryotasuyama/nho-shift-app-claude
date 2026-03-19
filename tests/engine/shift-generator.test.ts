import { describe, it, expect } from "vitest";
import { generateShift } from "@/lib/engine/shift-generator";
import type { StaffInput } from "@/lib/constraints/types";

function makeDates(startDate: string, count: number): string[] {
  const dates: string[] = [];
  const d = new Date(startDate + "T00:00:00Z");
  for (let i = 0; i < count; i++) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${day}`);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

function makeStaff(count: number): StaffInput[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `staff-${i + 1}`,
    experience_years: i < 5 ? 5 : 1, // first 5 are experienced
    team: i % 2 === 0 ? "A" as const : "B" as const,
    night_shift_available: i < 15, // first 15 can do nights
    is_active: true,
  }));
}

describe("Shift Generator", () => {
  const dates = makeDates("2026-04-01", 28);
  const staffList = makeStaff(20);
  const holidayDates = new Set<string>();

  it("generates entries for all staff and dates", () => {
    const result = generateShift({
      staffList,
      dates,
      holidayDates,
      requestedOffs: [],
      minDayStaff: 7,
      seed: 12345,
    });

    expect(result.timedOut).toBe(false);
    // 20 staff × 28 days = 560 entries
    expect(result.entries.length).toBe(560);
  });

  it("respects requested_off", () => {
    const requestedOffs = [
      { staff_id: "staff-1", date: "2026-04-10" },
      { staff_id: "staff-1", date: "2026-04-15" },
    ];

    const result = generateShift({
      staffList,
      dates,
      holidayDates,
      requestedOffs,
      minDayStaff: 7,
      seed: 12345,
    });

    const staff1Apr10 = result.entries.find(
      (e) => e.staff_id === "staff-1" && e.date === "2026-04-10"
    );
    expect(staff1Apr10?.shift_type).toBe("requested_off");

    const staff1Apr15 = result.entries.find(
      (e) => e.staff_id === "staff-1" && e.date === "2026-04-15"
    );
    expect(staff1Apr15?.shift_type).toBe("requested_off");
  });

  it("assigns evening and night shifts each day", () => {
    const result = generateShift({
      staffList,
      dates,
      holidayDates,
      requestedOffs: [],
      minDayStaff: 7,
      seed: 42,
    });

    for (const date of dates) {
      const dayEntries = result.entries.filter((e) => e.date === date);
      const eveningCount = dayEntries.filter((e) => e.shift_type === "evening").length;
      const nightCount = dayEntries.filter((e) => e.shift_type === "night").length;

      // Should attempt to place 3 evening and 3 night
      expect(eveningCount).toBeGreaterThanOrEqual(1);
      expect(nightCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not assign night shifts to ineligible staff", () => {
    const result = generateShift({
      staffList,
      dates,
      holidayDates,
      requestedOffs: [],
      minDayStaff: 7,
      seed: 99,
    });

    const ineligibleIds = staffList
      .filter((s) => !s.night_shift_available)
      .map((s) => s.id);

    const nightForIneligible = result.entries.filter(
      (e) =>
        ineligibleIds.includes(e.staff_id) &&
        (e.shift_type === "evening" || e.shift_type === "night")
    );

    expect(nightForIneligible).toHaveLength(0);
  });

  it("deterministic with same seed", () => {
    const r1 = generateShift({
      staffList,
      dates,
      holidayDates,
      requestedOffs: [],
      minDayStaff: 7,
      seed: 777,
    });

    const r2 = generateShift({
      staffList,
      dates,
      holidayDates,
      requestedOffs: [],
      minDayStaff: 7,
      seed: 777,
    });

    expect(r1.entries).toEqual(r2.entries);
  });

  it("different seed produces different output", () => {
    const r1 = generateShift({
      staffList,
      dates,
      holidayDates,
      requestedOffs: [],
      minDayStaff: 7,
      seed: 111,
    });

    const r2 = generateShift({
      staffList,
      dates,
      holidayDates,
      requestedOffs: [],
      minDayStaff: 7,
      seed: 222,
    });

    // Very likely to produce different results
    const same = r1.entries.every(
      (e, i) => e.shift_type === r2.entries[i].shift_type
    );
    expect(same).toBe(false);
  });
});
