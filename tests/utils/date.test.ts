import { describe, it, expect } from "vitest";
import {
  deriveFiscalYear,
  addDays,
  formatDate,
  parseDate,
  isWeekend,
  isSaturday,
  isSunday,
  getDateRange,
} from "@/lib/utils/date";

describe("deriveFiscalYear", () => {
  it("April start → same year", () => {
    expect(deriveFiscalYear(parseDate("2026-04-01"))).toBe(2026);
  });

  it("March start → previous year", () => {
    expect(deriveFiscalYear(parseDate("2027-03-01"))).toBe(2026);
  });

  it("January start → previous year", () => {
    expect(deriveFiscalYear(parseDate("2027-01-01"))).toBe(2026);
  });

  it("December start → same year", () => {
    expect(deriveFiscalYear(parseDate("2026-12-01"))).toBe(2026);
  });
});

describe("addDays", () => {
  it("adds positive days", () => {
    const result = addDays(parseDate("2026-04-01"), 27);
    expect(formatDate(result)).toBe("2026-04-28");
  });

  it("handles month boundary", () => {
    const result = addDays(parseDate("2026-01-30"), 3);
    expect(formatDate(result)).toBe("2026-02-02");
  });
});

describe("formatDate / parseDate", () => {
  it("round-trips correctly", () => {
    const dateStr = "2026-04-15";
    expect(formatDate(parseDate(dateStr))).toBe(dateStr);
  });
});

describe("weekend checks", () => {
  it("identifies Saturday", () => {
    // 2026-04-04 is a Saturday
    const sat = parseDate("2026-04-04");
    expect(isSaturday(sat)).toBe(true);
    expect(isSunday(sat)).toBe(false);
    expect(isWeekend(sat)).toBe(true);
  });

  it("identifies Sunday", () => {
    // 2026-04-05 is a Sunday
    const sun = parseDate("2026-04-05");
    expect(isSaturday(sun)).toBe(false);
    expect(isSunday(sun)).toBe(true);
    expect(isWeekend(sun)).toBe(true);
  });

  it("identifies weekday", () => {
    // 2026-04-06 is a Monday
    const mon = parseDate("2026-04-06");
    expect(isWeekend(mon)).toBe(false);
  });
});

describe("getDateRange", () => {
  it("generates correct range for a term (28 days)", () => {
    const start = parseDate("2026-04-01");
    const end = parseDate("2026-04-28");
    const range = getDateRange(start, end);
    expect(range).toHaveLength(28);
    expect(formatDate(range[0]!)).toBe("2026-04-01");
    expect(formatDate(range[27]!)).toBe("2026-04-28");
  });
});
