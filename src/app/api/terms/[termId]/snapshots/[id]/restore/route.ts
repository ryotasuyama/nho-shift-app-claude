import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { formatDate, getDateRange } from "@/lib/utils/date";
import { checkAllHardConstraints } from "@/lib/constraints/hard-constraints";
import { checkAllSoftConstraints } from "@/lib/constraints/soft-constraints";
import { calculateTermStatistics } from "@/lib/statistics/shift-statistics";
import type { StaffInput, ShiftEntryInput, ShiftTypeValue } from "@/lib/constraints/types";

type RouteContext = { params: Promise<{ termId: string; id: string }> };

type RestoreRequestBody = {
  lock_version: number;
};

type SnapshotEntry = {
  staff_id: string;
  date: string;
  shift_type: string;
  is_manual_edit: boolean;
};

type SnapshotData = {
  entries: SnapshotEntry[];
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { termId, id: snapshotId } = await context.params;
    const body = (await request.json()) as RestoreRequestBody;

    if (typeof body.lock_version !== "number") {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        "lock_versionが必要です",
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
        "adjusting状態のタームのみ復元できます",
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

    const snapshot = await prisma.shiftSnapshot.findUnique({ where: { id: snapshotId } });
    if (!snapshot || snapshot.term_id !== termId) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "スナップショットが見つかりません", ERROR_CODES.NOT_FOUND.status);
    }

    const snapshotData = snapshot.data as SnapshotData;
    if (!snapshotData?.entries || !Array.isArray(snapshotData.entries)) {
      return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "スナップショットデータが不正です", ERROR_CODES.INTERNAL_ERROR.status);
    }

    // Filter to active staff only
    const activeStaffs = await prisma.staff.findMany({
      where: { is_active: true },
      select: { id: true, experience_years: true, team: true, night_shift_available: true, is_active: true },
    });
    const activeStaffIds = new Set(activeStaffs.map((s) => s.id));

    const restoredEntries = snapshotData.entries.filter((e) => activeStaffIds.has(e.staff_id));
    const excludedStaffIds = new Set(
      snapshotData.entries
        .filter((e) => !activeStaffIds.has(e.staff_id))
        .map((e) => e.staff_id)
    );

    // Look up excluded staff names
    let excludedStaffs: { id: string; name: string; staff_code: string }[] = [];
    if (excludedStaffIds.size > 0) {
      excludedStaffs = await prisma.staff.findMany({
        where: { id: { in: [...excludedStaffIds] } },
        select: { id: true, name: true, staff_code: true },
      });
    }

    // Replace entries in transaction
    await prisma.$transaction(async (tx) => {
      await tx.shiftEntry.deleteMany({ where: { term_id: termId } });
      await tx.shiftEntry.createMany({
        data: restoredEntries.map((e) => ({
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
        action: "shift.restore",
        resource_type: "term",
        resource_id: termId,
        detail: {
          snapshot_id: snapshotId,
          snapshot_version: snapshot.version,
          restored_entries: restoredEntries.length,
          excluded_staff_count: excludedStaffIds.size,
        },
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

    const entryInput: ShiftEntryInput[] = restoredEntries.map((e) => ({
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
      entries: restoredEntries,
      violations: [...hardViolations, ...softViolations],
      statistics,
      excluded_staffs: excludedStaffs.map((s) => ({
        id: s.id,
        name: s.name,
        staff_code: s.staff_code,
      })),
    });
  } catch (error) {
    console.error("POST /api/terms/[termId]/snapshots/[id]/restore error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
