import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { statusChangeSchema } from "@/lib/validators/term";
import { formatDate, getDateRange } from "@/lib/utils/date";
import { checkPhase1Constraints } from "@/lib/constraints/hard-constraints";
import type { StaffInput, ShiftEntryInput } from "@/lib/constraints/types";

type RouteContext = { params: Promise<{ termId: string }> };

const GENERATING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { user: adminUser, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { termId: id } = await context.params;

    const term = await prisma.term.findUnique({ where: { id } });
    if (!term) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "指定されたタームが見つかりません", ERROR_CODES.NOT_FOUND.status);
    }

    const body: unknown = await request.json();
    const result = statusChangeSchema.safeParse(body);

    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        "入力値が不正です",
        ERROR_CODES.VALIDATION_ERROR.status,
        result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      );
    }

    const newStatus = result.data.status;
    const currentStatus = term.status;

    // Validate transition
    const validTransitions: Record<string, string[]> = {
      draft: ["collecting"],
      adjusting: ["confirmed"],
      confirmed: ["adjusting"],
      generating: ["collecting"], // Only for stuck recovery
    };

    const allowed = validTransitions[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      // Special case: generating → collecting (status API で受付不可の遷移)
      if (currentStatus === "generating" && newStatus !== "collecting") {
        return errorResponse(
          "INVALID_TRANSITION",
          "このステータス変更は status API では許可されていません",
          400
        );
      }
      if (currentStatus === "collecting" && newStatus === "collecting") {
        return errorResponse(
          "INVALID_TRANSITION",
          "このステータス変更は status API では許可されていません",
          400
        );
      }
      return errorResponse(
        "INVALID_TRANSITION",
        "このステータス変更は status API では許可されていません",
        400
      );
    }

    // draft → collecting: require request_deadline
    if (currentStatus === "draft" && newStatus === "collecting") {
      if (!term.request_deadline) {
        return errorResponse(
          ERROR_CODES.VALIDATION_ERROR.code,
          "希望休受付を開始するには締切日を設定してください",
          ERROR_CODES.VALIDATION_ERROR.status
        );
      }
    }

    // adjusting → confirmed: check phase 1 violations = 0
    if (currentStatus === "adjusting" && newStatus === "confirmed") {
      // Count shift entries for this term to verify it has data
      const entryCount = await prisma.shiftEntry.count({
        where: { term_id: id },
      });

      if (entryCount === 0) {
        return errorResponse(
          "PHASE1_VIOLATION_REMAINING",
          "シフトデータが存在しません。確定するにはシフトを生成してください",
          400
        );
      }

      // Phase 1 constraint violation check
      const entries = await prisma.shiftEntry.findMany({ where: { term_id: id } });
      const staffRecords = await prisma.staff.findMany({
        where: { is_active: true },
        select: { id: true, experience_years: true, team: true, night_shift_available: true, is_active: true },
      });
      const dates = getDateRange(term.start_date, term.end_date).map(formatDate);

      const staffInput: StaffInput[] = staffRecords.map((s) => ({
        id: s.id,
        experience_years: s.experience_years,
        team: s.team as "A" | "B",
        night_shift_available: s.night_shift_available,
        is_active: s.is_active,
      }));

      const entryInput: ShiftEntryInput[] = entries.map((e) => ({
        staff_id: e.staff_id,
        date: formatDate(e.date),
        shift_type: e.shift_type as ShiftEntryInput["shift_type"],
        is_manual_edit: e.is_manual_edit,
      }));

      const phase1Violations = checkPhase1Constraints(entryInput, staffInput, dates, term.min_day_staff);
      if (phase1Violations.length > 0) {
        return errorResponse(
          "PHASE1_VIOLATION_REMAINING",
          `フェーズ1制約違反が${phase1Violations.length}件あります。すべて解消してから確定してください`,
          400
        );
      }
    }

    // generating → collecting: stuck recovery (5 min timeout)
    if (currentStatus === "generating" && newStatus === "collecting") {
      if (term.generating_started_at) {
        const elapsed = Date.now() - term.generating_started_at.getTime();
        if (elapsed < GENERATING_TIMEOUT_MS) {
          return errorResponse(
            "GENERATION_IN_PROGRESS",
            "シフト生成が実行中です。5分以上経過後に再試行してください",
            409
          );
        }
      }
    }

    const updateData: { status: typeof newStatus; generating_started_at?: null } = {
      status: newStatus,
    };

    // Clear generating_started_at when leaving generating state
    if (currentStatus === "generating") {
      updateData.generating_started_at = null;
    }

    const updated = await prisma.term.update({
      where: { id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        user_id: adminUser!.userId,
        action: "term.status_change",
        resource_type: "term",
        resource_id: id,
        detail: { from: currentStatus, to: newStatus },
      },
    });

    return successResponse({
      ...updated,
      start_date: formatDate(updated.start_date),
      end_date: formatDate(updated.end_date),
      request_deadline: updated.request_deadline ? formatDate(updated.request_deadline) : null,
    });
  } catch (error) {
    console.error("PUT /api/terms/[id]/status error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
