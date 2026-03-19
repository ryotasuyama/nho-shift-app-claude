import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { formatDate, getDateRange } from "@/lib/utils/date";
import { checkAllHardConstraints } from "@/lib/constraints/hard-constraints";
import { checkAllSoftConstraints } from "@/lib/constraints/soft-constraints";
import { calculateTermStatistics } from "@/lib/statistics/shift-statistics";
import type { StaffInput, ShiftEntryInput } from "@/lib/constraints/types";

type RouteContext = { params: Promise<{ termId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { termId } = await context.params;
    const isAdmin = user!.role === "admin";

    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "タームが見つかりません", ERROR_CODES.NOT_FOUND.status);
    }

    // Staff can only view confirmed terms
    if (!isAdmin && term.status !== "confirmed") {
      return errorResponse(ERROR_CODES.FORBIDDEN.code, "このタームのシフトは閲覧できません", ERROR_CODES.FORBIDDEN.status);
    }

    const entries = await prisma.shiftEntry.findMany({
      where: { term_id: termId },
      include: { staff: { select: { name: true, staff_code: true, team: true, experience_years: true, night_shift_available: true, is_active: true } } },
      orderBy: [{ staff: { team: "asc" } }, { staff: { staff_code: "asc" } }, { date: "asc" }],
    });

    const staffRecords = await prisma.staff.findMany({
      where: { is_active: true },
      select: { id: true, name: true, staff_code: true, team: true, experience_years: true, night_shift_available: true, is_active: true },
      orderBy: [{ team: "asc" }, { staff_code: "asc" }],
    });

    const dates = getDateRange(term.start_date, term.end_date).map(formatDate);

    // Holidays in term period
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: term.start_date, lte: term.end_date } },
    });
    const holidayDates = holidays.map((h) => formatDate(h.date));

    // Format entries
    const formattedEntries = entries.map((e) => ({
      id: e.id,
      staff_id: e.staff_id,
      staff_name: e.staff.name,
      staff_code: e.staff.staff_code,
      date: formatDate(e.date),
      shift_type: e.shift_type,
      is_manual_edit: e.is_manual_edit,
    }));

    // Build staff input for constraint checking
    const staffInput: StaffInput[] = staffRecords.map((s) => ({
      id: s.id,
      experience_years: s.experience_years,
      team: s.team as "A" | "B",
      night_shift_available: s.night_shift_available,
      is_active: s.is_active,
    }));

    const entryInput: ShiftEntryInput[] = formattedEntries.map((e) => ({
      staff_id: e.staff_id,
      date: e.date,
      shift_type: e.shift_type as ShiftEntryInput["shift_type"],
      is_manual_edit: e.is_manual_edit,
    }));

    // Compute violations and statistics
    const hardViolations = checkAllHardConstraints(entryInput, staffInput, dates, term.min_day_staff);
    const softViolations = checkAllSoftConstraints(entryInput, staffInput, dates, new Set(holidayDates));
    const statistics = calculateTermStatistics(entryInput, staffInput, dates);

    return successResponse({
      term: {
        id: term.id,
        start_date: formatDate(term.start_date),
        end_date: formatDate(term.end_date),
        status: term.status,
        lock_version: term.lock_version,
        min_day_staff: term.min_day_staff,
      },
      staffs: staffRecords.map((s) => ({
        id: s.id,
        name: s.name,
        staff_code: s.staff_code,
        team: s.team,
        experience_years: s.experience_years,
        night_shift_available: s.night_shift_available,
      })),
      entries: formattedEntries,
      holidays: holidayDates,
      violations: [...hardViolations, ...softViolations],
      statistics,
    });
  } catch (error) {
    console.error("GET /api/terms/[termId]/shifts error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
