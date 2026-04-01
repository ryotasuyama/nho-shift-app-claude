import { z } from "zod";

export const createRequestSchema = z.object({
  staff_id: z.string().uuid("スタッフIDの形式が不正です"),
  requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません"),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const batchCreateRequestSchema = z.object({
  staff_id: z.string().uuid("スタッフIDの形式が不正です"),
  requested_dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません"))
    .min(1, "日付を1つ以上選択してください")
    .max(3, "希望休は最大3日までです"),
});

export type BatchCreateRequestInput = z.infer<typeof batchCreateRequestSchema>;
