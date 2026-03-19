import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";

export async function GET() {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const staff = await prisma.staff.findUnique({
      where: { user_id: user!.userId },
      select: { id: true, name: true, team: true },
    });

    return successResponse({
      user_id: user!.userId,
      email: user!.email,
      role: user!.role,
      staff_id: staff?.id ?? null,
      staff_name: staff?.name ?? null,
      team: staff?.team ?? null,
    });
  } catch (error) {
    console.error("GET /api/auth/session error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
