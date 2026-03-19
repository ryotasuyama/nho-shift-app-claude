import { describe, it, expect } from "vitest";
import {
  loginSchema,
  changePasswordSchema,
  resetPasswordSchema,
} from "@/lib/validators/auth";

describe("loginSchema", () => {
  it("accepts valid input", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  it("accepts valid input", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "oldpass123",
      new_password: "newPass456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short new password", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "oldpass123",
      new_password: "short1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without digits", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "oldpass123",
      new_password: "onlyletters",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without letters", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "oldpass123",
      new_password: "12345678",
    });
    expect(result.success).toBe(false);
  });

  it("rejects same password as current", () => {
    const result = changePasswordSchema.safeParse({
      current_password: "samePass1",
      new_password: "samePass1",
    });
    expect(result.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts valid UUID", () => {
    const result = resetPasswordSchema.safeParse({
      user_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID", () => {
    const result = resetPasswordSchema.safeParse({
      user_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
