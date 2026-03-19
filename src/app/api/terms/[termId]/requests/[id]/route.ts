import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { isAfterDeadline } from "@/lib/utils/date";

type RouteContext = { params: Promise<{ termId: string; id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { termId, id } = await context.params;
    const isAdmin = user!.role === "admin";

    // Find the request
    const shiftRequest = await prisma.shiftRequest.findUnique({
      where: { id },
      include: { term: true },
    });

    if (!shiftRequest) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "希望休が見つかりません", ERROR_CODES.NOT_FOUND.status);
    }

    if (shiftRequest.term_id !== termId) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "希望休が見つかりません", ERROR_CODES.NOT_FOUND.status);
    }

    // Check term is collecting
    if (shiftRequest.term.status !== "collecting") {
      return errorResponse(ERROR_CODES.CONFLICT.code, "このタームの希望休は変更できません", ERROR_CODES.CONFLICT.status);
    }

    // Staff: verify ownership and deadline
    if (!isAdmin) {
      const staffRecord = await prisma.staff.findUnique({
        where: { user_id: user!.userId },
        select: { id: true },
      });
      if (!staffRecord || staffRecord.id !== shiftRequest.staff_id) {
        return errorResponse(ERROR_CODES.FORBIDDEN.code, "他のスタッフの希望休は取消できません", ERROR_CODES.FORBIDDEN.status);
      }

      if (shiftRequest.term.request_deadline && isAfterDeadline(shiftRequest.term.request_deadline)) {
        return errorResponse(ERROR_CODES.FORBIDDEN.code, "申請受付は終了しています", ERROR_CODES.FORBIDDEN.status);
      }
    }

    await prisma.shiftRequest.delete({ where: { id } });

    return successResponse({ message: "希望休を取り消しました" });
  } catch (error) {
    console.error("DELETE /api/terms/[termId]/requests/[id] error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
