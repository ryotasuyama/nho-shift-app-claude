import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { formatDate, getDateRange } from "@/lib/utils/date";
import { generateShift } from "@/lib/engine/shift-generator";
import { checkPhase1Constraints, checkPhase2Constraints } from "@/lib/constraints/hard-constraints";
import { checkAllSoftConstraints } from "@/lib/constraints/soft-constraints";
import { calculateTermStatistics } from "@/lib/statistics/shift-statistics";
import type { StaffInput, ShiftTypeValue } from "@/lib/constraints/types";

export const maxDuration = 60;

type RouteContext = { params: Promise<{ termId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { termId } = await context.params;

  try {
    const { user, error: authError } = await requireAdmin();
    if (authError) return authError;

    // Atomic status transition: collecting → generating (or adjusting for re-gen)
    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "タームが見つかりません", ERROR_CODES.NOT_FOUND.status);
    }

    if (term.status !== "collecting" && term.status !== "adjusting") {
      if (term.status === "generating") {
        return errorResponse("GENERATION_IN_PROGRESS", "シフト生成が既に実行中です", 409);
      }
      return errorResponse(ERROR_CODES.CONFLICT.code, "このステータスではシフト生成できません", ERROR_CODES.CONFLICT.status);
    }

    const isRegeneration = term.status === "adjusting";

    // Fetch active staff
    const staffRecords = await prisma.staff.findMany({
      where: { is_active: true },
      select: { id: true, experience_years: true, team: true, night_shift_available: true, is_active: true },
    });

    const staffList: StaffInput[] = staffRecords.map((s) => ({
      id: s.id,
      experience_years: s.experience_years,
      team: s.team as "A" | "B",
      night_shift_available: s.night_shift_available,
      is_active: s.is_active,
    }));

    // Build date range
    const dates = getDateRange(term.start_date, term.end_date).map(formatDate);

    // Fetch holidays in term period
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: term.start_date, lte: term.end_date } },
    });
    const holidayDates = new Set(holidays.map((h) => formatDate(h.date)));

    // Pre-generation validation
    const estimatedHolidays = holidayDates.size;
    const workingDays = 20 - estimatedHolidays;
    const effectiveWorkingDays = Math.max(workingDays, 1);

    const minRequiredStaff = Math.ceil((term.min_day_staff + 6) * 28 / effectiveWorkingDays);
    if (staffList.length < minRequiredStaff) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        `有効スタッフ数が不足しています（現在: ${staffList.length}名、必要: ${minRequiredStaff}名以上）`,
        ERROR_CODES.VALIDATION_ERROR.status
      );
    }

    const nightEligible = staffList.filter((s) => s.night_shift_available);
    const minNightStaff = Math.ceil(6 * 28 / effectiveWorkingDays);
    if (nightEligible.length < minNightStaff) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        `夜勤可能スタッフ数が不足しています（現在: ${nightEligible.length}名、必要: ${minNightStaff}名以上）`,
        ERROR_CODES.VALIDATION_ERROR.status
      );
    }

    const teamANight = nightEligible.filter((s) => s.team === "A").length;
    const teamBNight = nightEligible.filter((s) => s.team === "B").length;
    if (teamANight < 3 || teamBNight < 3) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        `チームごとに夜勤可能スタッフが3名以上必要です（A: ${teamANight}名、B: ${teamBNight}名）`,
        ERROR_CODES.VALIDATION_ERROR.status
      );
    }

    // Atomically set status to generating
    const updated = await prisma.term.updateMany({
      where: { id: termId, status: term.status },
      data: { status: "generating", generating_started_at: new Date() },
    });
    if (updated.count === 0) {
      return errorResponse("GENERATION_IN_PROGRESS", "シフト生成が既に実行中です", 409);
    }

    try {
      // If regeneration, save snapshot of current data
      if (isRegeneration) {
        const currentEntries = await prisma.shiftEntry.findMany({
          where: { term_id: termId },
        });
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
      }

      // Fetch requested offs
      const shiftRequests = await prisma.shiftRequest.findMany({
        where: { term_id: termId },
      });
      const requestedOffs = shiftRequests.map((r) => ({
        staff_id: r.staff_id,
        date: formatDate(r.requested_date),
      }));

      // Run generator
      const startTime = Date.now();
      const result = generateShift({
        staffList,
        dates,
        holidayDates,
        requestedOffs,
        minDayStaff: term.min_day_staff,
        seed: Date.now(),
      });
      const generationTimeMs = Date.now() - startTime;

      // Save entries (DELETE + INSERT)
      await prisma.$transaction(async (tx) => {
        await tx.shiftEntry.deleteMany({ where: { term_id: termId } });
        await tx.shiftEntry.createMany({
          data: result.entries.map((e) => ({
            term_id: termId,
            staff_id: e.staff_id,
            date: new Date(e.date + "T00:00:00Z"),
            shift_type: e.shift_type as ShiftTypeValue,
            is_manual_edit: e.is_manual_edit,
          })),
        });
        await tx.term.update({
          where: { id: termId },
          data: {
            status: "adjusting",
            generating_started_at: null,
            lock_version: { increment: 1 },
          },
        });
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          user_id: user!.userId,
          action: isRegeneration ? "shift.regenerate" : "shift.generate",
          resource_type: "term",
          resource_id: termId,
          detail: { generation_time_ms: generationTimeMs, timed_out: result.timedOut, entry_count: result.entries.length },
        },
      });

      // Compute violations and statistics
      const hardViolations = [
        ...checkPhase1Constraints(result.entries, staffList, dates, term.min_day_staff),
        ...checkPhase2Constraints(result.entries, staffList, dates),
      ];
      const softViolations = checkAllSoftConstraints(result.entries, staffList, dates, holidayDates);
      const statistics = calculateTermStatistics(result.entries, staffList, dates);

      const updatedTerm = await prisma.term.findUnique({ where: { id: termId }, select: { id: true, status: true, lock_version: true } });

      return successResponse({
        term: updatedTerm,
        entries: result.entries,
        statistics: {
          generation_time_ms: generationTimeMs,
          hard_violations: hardViolations,
          soft_violations: softViolations,
          staff_summary: statistics.staff_stats,
          daily_summary: statistics.daily_stats,
        },
      });
    } catch (engineError) {
      // Rollback status on failure
      console.error("Shift generation failed:", engineError);
      await prisma.term.update({
        where: { id: termId },
        data: { status: isRegeneration ? "adjusting" : "collecting", generating_started_at: null },
      });
      return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "シフト生成中にエラーが発生しました", ERROR_CODES.INTERNAL_ERROR.status);
    }
  } catch (error) {
    console.error("POST /api/terms/[termId]/shifts/generate error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
