import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(_request: Request, context: RouteContext) {
  try {
    const { user: adminUser, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { id } = await context.params;

    const staff = await prisma.staff.findUnique({ where: { id } });
    if (!staff) {
      return errorResponse(
        ERROR_CODES.NOT_FOUND.code,
        "指定されたスタッフが見つかりません",
        ERROR_CODES.NOT_FOUND.status
      );
    }

    if (staff.is_active) {
      return errorResponse(
        ERROR_CODES.CONFLICT.code,
        "このスタッフは既に有効です",
        ERROR_CODES.CONFLICT.status
      );
    }

    const updated = await prisma.staff.update({
      where: { id },
      data: { is_active: true },
      select: {
        id: true,
        user_id: true,
        staff_code: true,
        name: true,
        experience_years: true,
        team: true,
        night_shift_available: true,
        is_active: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        user_id: adminUser!.userId,
        action: "staff.restore",
        resource_type: "staff",
        resource_id: id,
        detail: { staff_code: staff.staff_code, name: staff.name },
      },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("PUT /api/staffs/[id]/restore error:", error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      "サーバー内部エラー",
      ERROR_CODES.INTERNAL_ERROR.status
    );
  }
}
