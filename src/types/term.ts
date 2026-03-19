export type TermListItem = {
  id: string;
  start_date: string;
  end_date: string;
  fiscal_year: number;
  status: "draft" | "collecting" | "generating" | "adjusting" | "confirmed";
  request_deadline: string | null;
  min_day_staff: number;
  lock_version: number;
};

export const STATUS_LABELS: Record<TermListItem["status"], string> = {
  draft: "下書き",
  collecting: "受付中",
  generating: "生成中",
  adjusting: "調整中",
  confirmed: "確定",
};

export const STATUS_COLORS: Record<TermListItem["status"], string> = {
  draft: "bg-gray-100 text-gray-700",
  collecting: "bg-blue-100 text-blue-700",
  generating: "bg-yellow-100 text-yellow-700",
  adjusting: "bg-orange-100 text-orange-700",
  confirmed: "bg-green-100 text-green-700",
};
