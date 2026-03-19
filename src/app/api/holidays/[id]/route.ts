import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { id } = await context.params;

    const holiday = await prisma.holiday.findUnique({ where: { id } });
    if (!holiday) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "指定された祝日が見つかりません", ERROR_CODES.NOT_FOUND.status);
    }

    if (!holiday.is_custom) {
      return errorResponse(ERROR_CODES.FORBIDDEN.code, "システム祝日は削除できません", ERROR_CODES.FORBIDDEN.status);
    }

    await prisma.holiday.delete({ where: { id } });

    return successResponse({ message: "祝日を削除しました" });
  } catch (error) {
    console.error("DELETE /api/holidays/[id] error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
