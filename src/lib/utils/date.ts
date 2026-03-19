const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const getJstNow = (): Date => {
  const utc = new Date();
  return new Date(utc.getTime() + JST_OFFSET_MS);
};

export const getJstToday = (): string => {
  const jst = getJstNow();
  return formatDate(jst);
};

export const formatDate = (date: Date): string => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const parseDate = (dateStr: string): Date => {
  return new Date(dateStr + "T00:00:00Z");
};

export const isAfterDeadline = (deadline: Date | string): boolean => {
  const today = getJstToday();
  const deadlineStr =
    typeof deadline === "string" ? deadline : formatDate(deadline);
  return today > deadlineStr;
};

export const deriveFiscalYear = (startDate: Date): number => {
  const month = startDate.getUTCMonth() + 1;
  const year = startDate.getUTCFullYear();
  return month >= 4 ? year : year - 1;
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

export const getDayOfWeek = (date: Date): number => {
  return date.getUTCDay();
};

export const isWeekend = (date: Date): boolean => {
  const day = getDayOfWeek(date);
  return day === 0 || day === 6;
};

export const isSaturday = (date: Date): boolean => {
  return getDayOfWeek(date) === 6;
};

export const isSunday = (date: Date): boolean => {
  return getDayOfWeek(date) === 0;
};

export const getDateRange = (start: Date, end: Date): Date[] => {
  const dates: Date[] = [];
  let current = new Date(start.getTime());
  while (current <= end) {
    dates.push(new Date(current.getTime()));
    current = addDays(current, 1);
  }
  return dates;
};
