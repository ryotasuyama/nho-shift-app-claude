import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { formatDate, getDateRange } from "@/lib/utils/date";
import { checkAllHardConstraints } from "@/lib/constraints/hard-constraints";
import { checkAllSoftConstraints } from "@/lib/constraints/soft-constraints";
import { calculateTermStatistics } from "@/lib/statistics/shift-statistics";
import type { StaffInput, ShiftEntryInput, ShiftTypeValue } from "@/lib/constraints/types";

type RouteContext = { params: Promise<{ termId: string }> };

type SaveRequestBody = {
  lock_version: number;
  entries: {
    staff_id: string;
    date: string;
    shift_type: string;
    is_manual_edit: boolean;
  }[];
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { termId } = await context.params;
    const body = (await request.json()) as SaveRequestBody;

    if (!body.entries || !Array.isArray(body.entries) || typeof body.lock_version !== "number") {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        "entries配列とlock_versionが必要です",
        ERROR_CODES.VALIDATION_ERROR.status
      );
    }

    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "タームが見つかりません", ERROR_CODES.NOT_FOUND.status);
    }

    if (term.status !== "adjusting") {
      return errorResponse(
        ERROR_CODES.CONFLICT.code,
        "adjusting状態のタームのみ保存できます",
        ERROR_CODES.CONFLICT.status
      );
    }

    // Optimistic lock check
    if (term.lock_version !== body.lock_version) {
      return errorResponse(
        ERROR_CODES.CONFLICT.code,
        "他のユーザーがシフトを変更しました。画面を再読み込みしてください。",
        409
      );
    }

    // Only save entries for active staff
    const activeStaffs = await prisma.staff.findMany({
      where: { is_active: true },
      select: { id: true, experience_years: true, team: true, night_shift_available: true, is_active: true },
    });
    const activeStaffIds = new Set(activeStaffs.map((s) => s.id));
    const filteredEntries = body.entries.filter((e) => activeStaffIds.has(e.staff_id));

    // Create snapshot of current data before saving
    const currentEntries = await prisma.shiftEntry.findMany({ where: { term_id: termId } });
    if (currentEntries.length > 0) {
      const snapshotCount = await prisma.shiftSnapshot.count({ where: { term_id: termId } });
      const snapshotData = {
        entries: currentEntries.map((e) => ({
          staff_id: e.staff_id,
          date: formatDate(e.date),
          shift_type: e.shift_type,
          is_manual_edit: e.is_manual_edit,
        })),
      };

      await prisma.shiftSnapshot.create({
        data: {
          term_id: termId,
          version: snapshotCount + 1,
          data: snapshotData,
          created_by: user!.userId,
        },
      });

      // Keep max 5 snapshots
      if (snapshotCount + 1 > 5) {
        const oldest = await prisma.shiftSnapshot.findFirst({
          where: { term_id: termId },
          orderBy: { version: "asc" },
        });
        if (oldest) {
          await prisma.shiftSnapshot.delete({ where: { id: oldest.id } });
        }
      }
    }

    // Complete replacement: DELETE + INSERT in transaction
    await prisma.$transaction(async (tx) => {
      await tx.shiftEntry.deleteMany({ where: { term_id: termId } });
      await tx.shiftEntry.createMany({
        data: filteredEntries.map((e) => ({
          term_id: termId,
          staff_id: e.staff_id,
          date: new Date(e.date + "T00:00:00Z"),
          shift_type: e.shift_type as ShiftTypeValue,
          is_manual_edit: e.is_manual_edit,
        })),
      });
      await tx.term.update({
        where: { id: termId },
        data: { lock_version: { increment: 1 } },
      });
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        user_id: user!.userId,
        action: "shift.save",
        resource_type: "term",
        resource_id: termId,
        detail: { entry_count: filteredEntries.length },
      },
    });

    // Compute violations and statistics
    const dates = getDateRange(term.start_date, term.end_date).map(formatDate);
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: term.start_date, lte: term.end_date } },
    });
    const holidayDates = new Set(holidays.map((h) => formatDate(h.date)));

    const staffInput: StaffInput[] = activeStaffs.map((s) => ({
      id: s.id,
      experience_years: s.experience_years,
      team: s.team as "A" | "B",
      night_shift_available: s.night_shift_available,
      is_active: s.is_active,
    }));

    const entryInput: ShiftEntryInput[] = filteredEntries.map((e) => ({
      staff_id: e.staff_id,
      date: e.date,
      shift_type: e.shift_type as ShiftEntryInput["shift_type"],
      is_manual_edit: e.is_manual_edit,
    }));

    const hardViolations = checkAllHardConstraints(entryInput, staffInput, dates, term.min_day_staff);
    const softViolations = checkAllSoftConstraints(entryInput, staffInput, dates, holidayDates);
    const statistics = calculateTermStatistics(entryInput, staffInput, dates);

    const updatedTerm = await prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, status: true, lock_version: true, start_date: true, end_date: true, min_day_staff: true },
    });

    return successResponse({
      term: updatedTerm
        ? {
            id: updatedTerm.id,
            start_date: formatDate(updatedTerm.start_date),
            end_date: formatDate(updatedTerm.end_date),
            status: updatedTerm.status,
            lock_version: updatedTerm.lock_version,
            min_day_staff: updatedTerm.min_day_staff,
          }
        : null,
      violations: [...hardViolations, ...softViolations],
      statistics,
    });
  } catch (error) {
    console.error("POST /api/terms/[termId]/shifts/save error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
