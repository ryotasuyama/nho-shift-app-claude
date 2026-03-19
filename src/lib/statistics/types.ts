export type StaffStatistics = {
  staff_id: string;
  total_working_hours: number;
  standard_working_hours: number;
  hours_diff: number;
  day_count: number;
  evening_count: number;
  night_count: number;
  off_count: number;
  requested_off_count: number;
  holiday_off_count: number;
  weekly_off_total: number; // off + requested_off
};

export type DailyStatistics = {
  date: string;
  day_count: number;
  evening_count: number;
  night_count: number;
  off_count: number;
  total_staff: number;
};

export type TermStatistics = {
  staff_stats: StaffStatistics[];
  daily_stats: DailyStatistics[];
};

export const WORKING_HOURS_PER_SHIFT = 7.75;
export const TERM_DAYS = 28;
export const WEEKLY_OFF_COUNT = 8;
export const STANDARD_WORKING_DAYS = TERM_DAYS - WEEKLY_OFF_COUNT; // 20
export const STANDARD_WORKING_HOURS =
  WORKING_HOURS_PER_SHIFT * STANDARD_WORKING_DAYS; // 155
