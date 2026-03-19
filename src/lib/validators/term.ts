import { z } from "zod/v4";

export const createTermSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません"),
});

export type CreateTermInput = z.infer<typeof createTermSchema>;

export const bulkCreateTermSchema = z.object({
  year_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません"),
});

export type BulkCreateTermInput = z.infer<typeof bulkCreateTermSchema>;

export const updateTermSchema = z.object({
  request_deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません")
    .nullable()
    .optional(),
  min_day_staff: z
    .number()
    .int()
    .min(1, "日勤最低人数は1〜20の範囲で設定してください")
    .max(20, "日勤最低人数は1〜20の範囲で設定してください")
    .optional(),
});

export type UpdateTermInput = z.infer<typeof updateTermSchema>;

export const statusChangeSchema = z.object({
  status: z.enum(["collecting", "adjusting", "confirmed"], {
    message: "このステータス変更は許可されていません",
  }),
});

export type StatusChangeInput = z.infer<typeof statusChangeSchema>;
