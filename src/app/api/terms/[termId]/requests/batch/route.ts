import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { batchCreateRequestSchema } from "@/lib/validators/request";
import { parseDate, formatDate, isAfterDeadline } from "@/lib/utils/date";

type RouteContext = { params: Promise<{ termId: string }> };

const MAX_REQUESTS_PER_TERM = 3;

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { termId } = await context.params;

    const body: unknown = await request.json();
    const result = batchCreateRequestSchema.safeParse(body);
    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        "入力値が不正です",
        ERROR_CODES.VALIDATION_ERROR.status,
        result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      );
    }

    const { staff_id, requested_dates } = result.data;
    const isAdmin = user!.role === "admin";

    // Check term exists and is collecting
    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "タームが見つかりません", ERROR_CODES.NOT_FOUND.status);
    }
    if (term.status !== "collecting") {
      return errorResponse(ERROR_CODES.CONFLICT.code, "このタームは希望休を受け付けていません", ERROR_CODES.CONFLICT.status);
    }

    // Staff: verify staff_id matches JWT user
    if (!isAdmin) {
      const staffRecord = await prisma.staff.findUnique({
        where: { user_id: user!.userId },
        select: { id: true },
      });
      if (!staffRecord || staffRecord.id !== staff_id) {
        return errorResponse(ERROR_CODES.FORBIDDEN.code, "他のスタッフの希望休は申請できません", ERROR_CODES.FORBIDDEN.status);
      }

      // Staff: check deadline
      if (term.request_deadline && isAfterDeadline(term.request_deadline)) {
        return errorResponse(ERROR_CODES.FORBIDDEN.code, "申請受付は終了しています", ERROR_CODES.FORBIDDEN.status);
      }
    }

    // Check staff is active
    const staff = await prisma.staff.findUnique({
      where: { id: staff_id },
      select: { id: true, is_active: true, name: true },
    });
    if (!staff) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "スタッフが見つかりません", ERROR_CODES.NOT_FOUND.status);
    }
    if (!staff.is_active) {
      return errorResponse(ERROR_CODES.CONFLICT.code, "無効化されたスタッフの希望休は申請できません", ERROR_CODES.CONFLICT.status);
    }

    // Validate all dates are within term period
    const parsedDates = requested_dates.map((d) => ({ original: d, parsed: parseDate(d) }));
    for (const { original, parsed } of parsedDates) {
      if (parsed < term.start_date || parsed > term.end_date) {
        return errorResponse(
          ERROR_CODES.VALIDATION_ERROR.code,
          `日付 ${original} はターム期間外です`,
          ERROR_CODES.VALIDATION_ERROR.status
        );
      }
    }

    // Check total count (existing + new) does not exceed max
    const existingCount = await prisma.shiftRequest.count({
      where: { staff_id, term_id: termId },
    });
    if (existingCount + requested_dates.length > MAX_REQUESTS_PER_TERM) {
      return errorResponse(
        ERROR_CODES.CONFLICT.code,
        `希望休は最大${MAX_REQUESTS_PER_TERM}日までです（現在${existingCount}日申請済み）`,
        ERROR_CODES.CONFLICT.status
      );
    }

    // Check for duplicates
    const existingRequests = await prisma.shiftRequest.findMany({
      where: { staff_id, term_id: termId },
      select: { requested_date: true },
    });
    const existingDatesSet = new Set(existingRequests.map((r) => formatDate(r.requested_date)));
    const duplicates = requested_dates.filter((d) => existingDatesSet.has(d));
    if (duplicates.length > 0) {
      return errorResponse(
        ERROR_CODES.CONFLICT.code,
        `以下の日付は既に申請済みです: ${duplicates.join(", ")}`,
        ERROR_CODES.CONFLICT.status
      );
    }

    // Create all requests in a transaction
    const created = await prisma.$transaction(
      parsedDates.map(({ parsed }) =>
        prisma.shiftRequest.create({
          data: { staff_id, term_id: termId, requested_date: parsed },
          include: { staff: { select: { name: true } } },
        })
      )
    );

    return successResponse(
      created.map((r) => ({
        id: r.id,
        staff_id: r.staff_id,
        staff_name: r.staff.name,
        requested_date: formatDate(r.requested_date),
        created_at: r.created_at.toISOString(),
      })),
      201
    );
  } catch (error) {
    console.error("POST /api/terms/[termId]/requests/batch error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
