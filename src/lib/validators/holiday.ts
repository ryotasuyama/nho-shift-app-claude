import { z } from "zod";

export const createHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません"),
  name: z.string().min(1, "祝日名を入力してください").max(100),
});

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
