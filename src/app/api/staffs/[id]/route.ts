import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { updateStaffSchema } from "@/lib/validators/staff";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
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

    const body: unknown = await request.json();
    const result = updateStaffSchema.safeParse(body);

    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        "入力値が不正です",
        ERROR_CODES.VALIDATION_ERROR.status,
        result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }))
      );
    }

    const updateData = result.data;

    const updated = await prisma.staff.update({
      where: { id },
      data: updateData,
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
        action: "staff.update",
        resource_type: "staff",
        resource_id: id,
        detail: updateData,
      },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("PUT /api/staffs/[id] error:", error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      "サーバー内部エラー",
      ERROR_CODES.INTERNAL_ERROR.status
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { user: adminUser, error: authError } = await requireAdmin();
    if (authError) return authError;

    const { id } = await context.params;

    const staff = await prisma.staff.findUnique({
      where: { id },
      include: { user: { select: { id: true } } },
    });

    if (!staff) {
      return errorResponse(
        ERROR_CODES.NOT_FOUND.code,
        "指定されたスタッフが見つかりません",
        ERROR_CODES.NOT_FOUND.status
      );
    }

    if (!staff.is_active) {
      return errorResponse(
        ERROR_CODES.CONFLICT.code,
        "このスタッフは既に無効化されています",
        ERROR_CODES.CONFLICT.status
      );
    }

    // Prevent admin from deactivating themselves
    if (staff.user_id === adminUser!.userId) {
      return errorResponse(
        ERROR_CODES.FORBIDDEN.code,
        "自分自身を無効化することはできません",
        ERROR_CODES.FORBIDDEN.status
      );
    }

    await prisma.$transaction(async (tx) => {
      // Deactivate staff
      await tx.staff.update({
        where: { id },
        data: { is_active: false },
      });

      // Remove from non-confirmed terms' shift_entries
      await tx.shiftEntry.deleteMany({
        where: {
          staff_id: id,
          term: {
            status: { in: ["draft", "collecting", "generating", "adjusting"] },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          user_id: adminUser!.userId,
          action: "staff.deactivate",
          resource_type: "staff",
          resource_id: id,
          detail: { staff_code: staff.staff_code, name: staff.name },
        },
      });
    });

    return successResponse({ message: "スタッフを無効化しました" });
  } catch (error) {
    console.error("DELETE /api/staffs/[id] error:", error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      "サーバー内部エラー",
      ERROR_CODES.INTERNAL_ERROR.status
    );
  }
}
