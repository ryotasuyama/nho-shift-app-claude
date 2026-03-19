import { z } from "zod/v4";

export const loginSchema = z.object({
  email: z
    .email("メールアドレスの形式が正しくありません"),
  password: z
    .string()
    .min(1, "パスワードを入力してください"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "現在のパスワードを入力してください"),
    new_password: z
      .string()
      .min(8, "パスワードは英数字混在で8文字以上にしてください")
      .regex(
        /^(?=.*[a-zA-Z])(?=.*[0-9])/,
        "パスワードは英数字混在で8文字以上にしてください"
      ),
  })
  .refine((data) => data.current_password !== data.new_password, {
    message: "現在のパスワードと同じパスワードは設定できません",
    path: ["new_password"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const resetPasswordSchema = z.object({
  user_id: z.uuid("IDの形式が正しくありません"),
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
