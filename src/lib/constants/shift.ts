import type { ShiftTypeValue } from "@/lib/constraints/types";

export const SHIFT_LABELS: Record<ShiftTypeValue, string> = {
  day: "日",
  evening: "準",
  night: "深",
  off: "休",
  holiday_off: "代",
  requested_off: "希",
};

export const SHIFT_COLORS: Record<ShiftTypeValue, string> = {
  day: "text-gray-900",
  evening: "text-orange-700",
  night: "text-blue-700",
  off: "text-gray-400",
  holiday_off: "text-purple-600",
  requested_off: "text-pink-600",
};

export const EDITABLE_TYPES: ShiftTypeValue[] = ["day", "evening", "night", "off", "holiday_off"];

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;
