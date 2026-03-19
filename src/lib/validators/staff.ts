import { z } from "zod";

export const createStaffSchema = z.object({
  staff_code: z
    .string()
    .min(2, "スタッフコードは英数字2〜10文字で入力してください")
    .max(10, "スタッフコードは英数字2〜10文字で入力してください")
    .regex(/^[a-zA-Z0-9]+$/, "スタッフコードは英数字2〜10文字で入力してください"),
  name: z
    .string()
    .min(1, "氏名を入力してください")
    .max(30, "氏名は1〜30文字で入力してください"),
  email: z.email("メールアドレスの形式が正しくありません"),
  experience_years: z
    .number()
    .int("経験年数は整数で入力してください")
    .min(1, "経験年数は1〜50の範囲で入力してください")
    .max(50, "経験年数は1〜50の範囲で入力してください"),
  team: z.enum(["A", "B"], { message: "所属チームはAまたはBを選択してください" }),
  night_shift_available: z.boolean().default(true),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z.object({
  name: z
    .string()
    .min(1, "氏名を入力してください")
    .max(30, "氏名は1〜30文字で入力してください")
    .optional(),
  experience_years: z
    .number()
    .int("経験年数は整数で入力してください")
    .min(1, "経験年数は1〜50の範囲で入力してください")
    .max(50, "経験年数は1〜50の範囲で入力してください")
    .optional(),
  team: z.enum(["A", "B"], { message: "所属チームはAまたはBを選択してください" }).optional(),
  night_shift_available: z.boolean().optional(),
});

export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
