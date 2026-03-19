import { describe, it, expect } from "vitest";
import {
  generateTemporaryPassword,
  isValidPassword,
} from "@/lib/utils/password";

describe("generateTemporaryPassword", () => {
  it("generates a 12-character password", () => {
    const pw = generateTemporaryPassword();
    expect(pw).toHaveLength(12);
  });

  it("contains at least one uppercase letter", () => {
    const pw = generateTemporaryPassword();
    expect(/[A-Z]/.test(pw)).toBe(true);
  });

  it("contains at least one lowercase letter", () => {
    const pw = generateTemporaryPassword();
    expect(/[a-z]/.test(pw)).toBe(true);
  });

  it("contains at least one digit", () => {
    const pw = generateTemporaryPassword();
    expect(/[0-9]/.test(pw)).toBe(true);
  });

  it("contains only alphanumeric characters", () => {
    const pw = generateTemporaryPassword();
    expect(/^[a-zA-Z0-9]+$/.test(pw)).toBe(true);
  });

  it("passes the password validation", () => {
    const pw = generateTemporaryPassword();
    expect(isValidPassword(pw)).toBe(true);
  });

  it("generates different passwords each time", () => {
    const passwords = new Set(
      Array.from({ length: 10 }, () => generateTemporaryPassword())
    );
    expect(passwords.size).toBeGreaterThan(1);
  });
});

describe("isValidPassword", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(isValidPassword("Ab1")).toBe(false);
    expect(isValidPassword("Abc1234")).toBe(false);
  });

  it("rejects passwords without letters", () => {
    expect(isValidPassword("12345678")).toBe(false);
  });

  it("rejects passwords without digits", () => {
    expect(isValidPassword("abcdefgh")).toBe(false);
  });

  it("accepts valid passwords", () => {
    expect(isValidPassword("Abcdef12")).toBe(true);
    expect(isValidPassword("password123")).toBe(true);
  });
});
