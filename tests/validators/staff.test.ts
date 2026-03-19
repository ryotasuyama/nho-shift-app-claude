import { describe, it, expect } from "vitest";
import { createStaffSchema, updateStaffSchema } from "@/lib/validators/staff";

describe("createStaffSchema", () => {
  const validInput = {
    staff_code: "N001",
    name: "田中花子",
    email: "tanaka@example.com",
    experience_years: 5,
    team: "A" as const,
    night_shift_available: true,
  };

  it("accepts valid input", () => {
    const result = createStaffSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects staff_code shorter than 2 chars", () => {
    const result = createStaffSchema.safeParse({ ...validInput, staff_code: "N" });
    expect(result.success).toBe(false);
  });

  it("rejects staff_code with special characters", () => {
    const result = createStaffSchema.safeParse({ ...validInput, staff_code: "N-001" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = createStaffSchema.safeParse({ ...validInput, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name longer than 30 chars", () => {
    const result = createStaffSchema.safeParse({ ...validInput, name: "あ".repeat(31) });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createStaffSchema.safeParse({ ...validInput, email: "not-email" });
    expect(result.success).toBe(false);
  });

  it("rejects experience_years < 1", () => {
    const result = createStaffSchema.safeParse({ ...validInput, experience_years: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects experience_years > 50", () => {
    const result = createStaffSchema.safeParse({ ...validInput, experience_years: 51 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid team", () => {
    const result = createStaffSchema.safeParse({ ...validInput, team: "C" });
    expect(result.success).toBe(false);
  });

  it("defaults night_shift_available to true", () => {
    const { night_shift_available: _, ...withoutNight } = validInput;
    const result = createStaffSchema.safeParse(withoutNight);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.night_shift_available).toBe(true);
    }
  });
});

describe("updateStaffSchema", () => {
  it("accepts partial update", () => {
    const result = updateStaffSchema.safeParse({ name: "山田太郎" });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (no fields)", () => {
    const result = updateStaffSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid experience_years", () => {
    const result = updateStaffSchema.safeParse({ experience_years: 0 });
    expect(result.success).toBe(false);
  });
});
