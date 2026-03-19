import { describe, it, expect } from "vitest";
import { generateTemporaryPassword, isValidPassword } from "../password";

describe("generateTemporaryPassword", () => {
  it("12文字のパスワードを生成する", () => {
    const password = generateTemporaryPassword();
    expect(password).toHaveLength(12);
  });

  it("英大文字を含む", () => {
    const password = generateTemporaryPassword();
    expect(/[A-Z]/.test(password)).toBe(true);
  });

  it("英小文字を含む", () => {
    const password = generateTemporaryPassword();
    expect(/[a-z]/.test(password)).toBe(true);
  });

  it("数字を含む", () => {
    const password = generateTemporaryPassword();
    expect(/[0-9]/.test(password)).toBe(true);
  });

  it("英数字のみで構成される", () => {
    const password = generateTemporaryPassword();
    expect(/^[a-zA-Z0-9]+$/.test(password)).toBe(true);
  });

  it("パスワードポリシーを満たす", () => {
    const password = generateTemporaryPassword();
    expect(isValidPassword(password)).toBe(true);
  });

  it("毎回異なるパスワードを生成する", () => {
    const passwords = new Set(
      Array.from({ length: 10 }, () => generateTemporaryPassword())
    );
    expect(passwords.size).toBeGreaterThan(1);
  });
});

describe("isValidPassword", () => {
  it("8文字以上の英数字混在パスワードを許可する", () => {
    expect(isValidPassword("Abc12345")).toBe(true);
  });

  it("7文字以下を拒否する", () => {
    expect(isValidPassword("Abc1234")).toBe(false);
  });

  it("数字のみを拒否する", () => {
    expect(isValidPassword("12345678")).toBe(false);
  });

  it("英字のみを拒否する", () => {
    expect(isValidPassword("abcdefgh")).toBe(false);
  });
});
