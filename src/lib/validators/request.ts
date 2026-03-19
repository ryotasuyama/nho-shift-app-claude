import { z } from "zod";

export const createRequestSchema = z.object({
  staff_id: z.string().uuid("スタッフIDの形式が不正です"),
  requested_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません"),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
