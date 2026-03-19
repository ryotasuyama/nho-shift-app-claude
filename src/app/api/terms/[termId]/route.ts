import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { updateTermSchema } from "@/lib/validators/term";
import { parseDate, formatDate } from "@/lib/utils/date";

type RouteContext = { params: Promise<{ termId: string }> };

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
    const result = updateTermSchema.safeParse(body);

    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        "入力値が不正です",
        ERROR_CODES.VALIDATION_ERROR.status,
        result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      );
    }

    const data: { request_deadline?: Date | null; min_day_staff?: number } = {};

    if (result.data.request_deadline !== undefined) {
      data.request_deadline = result.data.request_deadline
        ? parseDate(result.data.request_deadline)
        : null;
    }
    if (result.data.min_day_staff !== undefined) {
      data.min_day_staff = result.data.min_day_staff;
    }

    const updated = await prisma.term.update({
      where: { id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        user_id: adminUser!.userId,
        action: "term.update",
        resource_type: "term",
        resource_id: id,
        detail: result.data,
      },
    });

    return successResponse({
      ...updated,
      start_date: formatDate(updated.start_date),
      end_date: formatDate(updated.end_date),
      request_deadline: updated.request_deadline ? formatDate(updated.request_deadline) : null,
    });
  } catch (error) {
    console.error("PUT /api/terms/[id] error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { user: adminUser, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { termId: id } = await context.params;

    const term = await prisma.term.findUnique({ where: { id } });
    if (!term) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "指定されたタームが見つかりません", ERROR_CODES.NOT_FOUND.status);
    }

    if (term.status !== "draft") {
      return errorResponse(ERROR_CODES.CONFLICT.code, "draft ステータスのタームのみ削除可能です", ERROR_CODES.CONFLICT.status);
    }

    await prisma.term.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        user_id: adminUser!.userId,
        action: "term.delete",
        resource_type: "term",
        resource_id: id,
      },
    });

    return successResponse({ message: "タームを削除しました" });
  } catch (error) {
    console.error("DELETE /api/terms/[id] error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
