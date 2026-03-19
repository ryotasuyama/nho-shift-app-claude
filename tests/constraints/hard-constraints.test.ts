import { describe, it, expect } from "vitest";
import {
  checkH1, checkH2, checkH3, checkH4, checkH5,
  checkH11, checkH12, checkH13,
  checkH17, checkH18,
  checkH6,
  checkH14, checkH15, checkH16,
} from "@/lib/constraints/hard-constraints";
import type { ShiftEntryInput, StaffInput } from "@/lib/constraints/types";

// Helpers
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

function makeStaff(overrides: Partial<StaffInput> = {}): StaffInput {
  return {
    id: "s1",
    experience_years: 5,
    team: "A",
    night_shift_available: true,
    is_active: true,
    ...overrides,
  };
}

function entry(staffId: string, date: string, shiftType: ShiftEntryInput["shift_type"]): ShiftEntryInput {
  return { staff_id: staffId, date, shift_type: shiftType, is_manual_edit: false };
}

// ============================
// Phase 1 Tests
// ============================

describe("H1: 準夜勤 毎日3名", () => {
  const dates = makeDates("2026-04-01", 1);

  it("3名で違反なし", () => {
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s2", dates[0], "evening"),
      entry("s3", dates[0], "evening"),
    ];
    expect(checkH1(entries, dates)).toHaveLength(0);
  });

  it("2名で違反", () => {
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s2", dates[0], "evening"),
    ];
    expect(checkH1(entries, dates)).toHaveLength(1);
  });
});

describe("H2: 深夜勤 毎日3名", () => {
  const dates = makeDates("2026-04-01", 1);

  it("3名で違反なし", () => {
    const entries = [
      entry("s1", dates[0], "night"),
      entry("s2", dates[0], "night"),
      entry("s3", dates[0], "night"),
    ];
    expect(checkH2(entries, dates)).toHaveLength(0);
  });

  it("1名で違反", () => {
    const entries = [entry("s1", dates[0], "night")];
    expect(checkH2(entries, dates)).toHaveLength(1);
  });
});

describe("H3: 日勤 毎日最低N名", () => {
  const dates = makeDates("2026-04-01", 1);

  it("7名で違反なし", () => {
    const entries = Array.from({ length: 7 }, (_, i) => entry(`s${i}`, dates[0], "day"));
    expect(checkH3(entries, dates, 7)).toHaveLength(0);
  });

  it("6名で違反", () => {
    const entries = Array.from({ length: 6 }, (_, i) => entry(`s${i}`, dates[0], "day"));
    expect(checkH3(entries, dates, 7)).toHaveLength(1);
  });
});

describe("H4: 夜勤不可スタッフの除外", () => {
  it("夜勤不可スタッフが夜勤で違反", () => {
    const staff = [makeStaff({ id: "s1", night_shift_available: false })];
    const entries = [entry("s1", "2026-04-01", "evening")];
    expect(checkH4(entries, staff)).toHaveLength(1);
  });

  it("夜勤可スタッフは問題なし", () => {
    const staff = [makeStaff({ id: "s1", night_shift_available: true })];
    const entries = [entry("s1", "2026-04-01", "evening")];
    expect(checkH4(entries, staff)).toHaveLength(0);
  });
});

describe("H5: 週休8回/ターム", () => {
  const dates = makeDates("2026-04-01", 28);
  const staff = [makeStaff({ id: "s1" })];

  it("8回で違反なし", () => {
    const entries = dates.map((d, i) =>
      i < 8 ? entry("s1", d, "off") : entry("s1", d, "day")
    );
    expect(checkH5(entries, staff)).toHaveLength(0);
  });

  it("off+requested_off合計8回で違反なし", () => {
    const entries = dates.map((d, i) =>
      i < 5 ? entry("s1", d, "off") :
      i < 8 ? entry("s1", d, "requested_off") :
      entry("s1", d, "day")
    );
    expect(checkH5(entries, staff)).toHaveLength(0);
  });

  it("7回で違反", () => {
    const entries = dates.map((d, i) =>
      i < 7 ? entry("s1", d, "off") : entry("s1", d, "day")
    );
    expect(checkH5(entries, staff)).toHaveLength(1);
  });

  it("holiday_offは週休にカウントしない", () => {
    const entries = dates.map((d, i) =>
      i < 7 ? entry("s1", d, "off") :
      i === 7 ? entry("s1", d, "holiday_off") :
      entry("s1", d, "day")
    );
    // 7 offs (off) + 1 holiday_off = 7 weekly offs → violation
    expect(checkH5(entries, staff)).toHaveLength(1);
  });
});

describe("H11: 夜勤連続最大2日", () => {
  const dates = makeDates("2026-04-01", 4);
  const staff = [makeStaff({ id: "s1" })];

  it("2日連続で違反なし", () => {
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s1", dates[1], "evening"),
      entry("s1", dates[2], "day"),
      entry("s1", dates[3], "day"),
    ];
    expect(checkH11(entries, staff, dates)).toHaveLength(0);
  });

  it("3日連続で違反", () => {
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s1", dates[1], "night"),
      entry("s1", dates[2], "evening"),
      entry("s1", dates[3], "day"),
    ];
    expect(checkH11(entries, staff, dates)).toHaveLength(1);
  });
});

describe("H12: 深夜勤2連続禁止", () => {
  const dates = makeDates("2026-04-01", 3);
  const staff = [makeStaff({ id: "s1" })];

  it("night→dayで違反なし", () => {
    const entries = [
      entry("s1", dates[0], "night"),
      entry("s1", dates[1], "day"),
      entry("s1", dates[2], "day"),
    ];
    expect(checkH12(entries, staff, dates)).toHaveLength(0);
  });

  it("night→nightで違反", () => {
    const entries = [
      entry("s1", dates[0], "night"),
      entry("s1", dates[1], "night"),
      entry("s1", dates[2], "day"),
    ];
    expect(checkH12(entries, staff, dates)).toHaveLength(1);
  });
});

describe("H13: 準夜→深夜禁止", () => {
  const dates = makeDates("2026-04-01", 3);
  const staff = [makeStaff({ id: "s1" })];

  it("evening→dayで違反なし", () => {
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s1", dates[1], "day"),
      entry("s1", dates[2], "day"),
    ];
    expect(checkH13(entries, staff, dates)).toHaveLength(0);
  });

  it("evening→nightで違反", () => {
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s1", dates[1], "night"),
      entry("s1", dates[2], "day"),
    ];
    expect(checkH13(entries, staff, dates)).toHaveLength(1);
  });
});

describe("H17: 夜勤帯の経験者混在", () => {
  const dates = makeDates("2026-04-01", 1);

  it("経験3年以上含むで違反なし", () => {
    const staff = [
      makeStaff({ id: "s1", experience_years: 5 }),
      makeStaff({ id: "s2", experience_years: 1 }),
      makeStaff({ id: "s3", experience_years: 2 }),
    ];
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s2", dates[0], "evening"),
      entry("s3", dates[0], "evening"),
    ];
    expect(checkH17(entries, staff, dates)).toHaveLength(0);
  });

  it("全員経験3年未満で違反", () => {
    const staff = [
      makeStaff({ id: "s1", experience_years: 1 }),
      makeStaff({ id: "s2", experience_years: 2 }),
      makeStaff({ id: "s3", experience_years: 1 }),
    ];
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s2", dates[0], "evening"),
      entry("s3", dates[0], "evening"),
    ];
    const violations = checkH17(entries, staff, dates);
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });
});

describe("H18: 夜勤帯のチーム混在", () => {
  const dates = makeDates("2026-04-01", 1);

  it("A/B混在で違反なし", () => {
    const staff = [
      makeStaff({ id: "s1", team: "A" }),
      makeStaff({ id: "s2", team: "B" }),
      makeStaff({ id: "s3", team: "A" }),
    ];
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s2", dates[0], "evening"),
      entry("s3", dates[0], "evening"),
    ];
    expect(checkH18(entries, staff, dates)).toHaveLength(0);
  });

  it("全員同一チームで違反", () => {
    const staff = [
      makeStaff({ id: "s1", team: "A" }),
      makeStaff({ id: "s2", team: "A" }),
      makeStaff({ id: "s3", team: "A" }),
    ];
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s2", dates[0], "evening"),
      entry("s3", dates[0], "evening"),
    ];
    const violations = checkH18(entries, staff, dates);
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });
});

// ============================
// Phase 2 Tests
// ============================

describe("H6: 週休間隔最大5日", () => {
  const dates = makeDates("2026-04-01", 10);
  const staff = [makeStaff({ id: "s1" })];

  it("間隔5日で違反なし", () => {
    // off on day0 and day6 → gap = 5
    const entries = dates.map((d, i) =>
      i === 0 || i === 6 ? entry("s1", d, "off") : entry("s1", d, "day")
    );
    expect(checkH6(entries, staff, dates)).toHaveLength(0);
  });

  it("間隔6日で違反", () => {
    // off on day0 and day7 → gap = 6
    const entries = dates.map((d, i) =>
      i === 0 || i === 7 ? entry("s1", d, "off") : entry("s1", d, "day")
    );
    expect(checkH6(entries, staff, dates)).toHaveLength(1);
  });
});

describe("H12+H13 combined: night patterns", () => {
  const dates = makeDates("2026-04-01", 3);
  const staff = [makeStaff({ id: "s1" })];

  it("night→evening is OK (H12 only checks night→night)", () => {
    const entries = [
      entry("s1", dates[0], "night"),
      entry("s1", dates[1], "evening"),
      entry("s1", dates[2], "day"),
    ];
    expect(checkH12(entries, staff, dates)).toHaveLength(0);
  });
});

describe("H14: 準夜→休→深夜禁止", () => {
  const dates = makeDates("2026-04-01", 3);
  const staff = [makeStaff({ id: "s1" })];

  it("evening→off→nightで違反", () => {
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s1", dates[1], "off"),
      entry("s1", dates[2], "night"),
    ];
    expect(checkH14(entries, staff, dates)).toHaveLength(1);
  });

  it("evening→off→dayで違反なし", () => {
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s1", dates[1], "off"),
      entry("s1", dates[2], "day"),
    ];
    expect(checkH14(entries, staff, dates)).toHaveLength(0);
  });
});

describe("H15: 準夜→休→日勤→深夜禁止", () => {
  const dates = makeDates("2026-04-01", 4);
  const staff = [makeStaff({ id: "s1" })];

  it("evening→off→day→nightで違反", () => {
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s1", dates[1], "off"),
      entry("s1", dates[2], "day"),
      entry("s1", dates[3], "night"),
    ];
    expect(checkH15(entries, staff, dates)).toHaveLength(1);
  });
});

describe("H16: 夜勤ブロック間3日以上", () => {
  const dates = makeDates("2026-04-01", 6);
  const staff = [makeStaff({ id: "s1" })];

  it("ブロック間3日で違反なし", () => {
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s1", dates[1], "day"),
      entry("s1", dates[2], "day"),
      entry("s1", dates[3], "day"),
      entry("s1", dates[4], "evening"),
      entry("s1", dates[5], "day"),
    ];
    expect(checkH16(entries, staff, dates)).toHaveLength(0);
  });

  it("ブロック間2日で違反", () => {
    const entries = [
      entry("s1", dates[0], "evening"),
      entry("s1", dates[1], "day"),
      entry("s1", dates[2], "day"),
      entry("s1", dates[3], "evening"),
      entry("s1", dates[4], "day"),
      entry("s1", dates[5], "day"),
    ];
    expect(checkH16(entries, staff, dates)).toHaveLength(1);
  });
});
