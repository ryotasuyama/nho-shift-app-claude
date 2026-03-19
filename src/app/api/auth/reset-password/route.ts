import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { resetPasswordSchema } from "@/lib/validators/auth";
import { generateTemporaryPassword } from "@/lib/utils/password";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";

export async function POST(request: Request) {
  try {
    const { user: adminUser, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body: unknown = await request.json();
    const result = resetPasswordSchema.safeParse(body);

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

    const { user_id } = result.data;

    // Verify user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: user_id },
    });

    if (!targetUser) {
      return errorResponse(
        ERROR_CODES.NOT_FOUND.code,
        "指定されたユーザーが見つかりません",
        ERROR_CODES.NOT_FOUND.status
      );
    }

    const temporaryPassword = generateTemporaryPassword();

    // Update password in Supabase Auth
    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(user_id, {
        password: temporaryPassword,
        user_metadata: { must_change_password: true },
      });

    if (updateError) {
      console.error("Password reset failed:", updateError);
      return errorResponse(
        ERROR_CODES.INTERNAL_ERROR.code,
        "パスワードの再発行に失敗しました",
        ERROR_CODES.INTERNAL_ERROR.status
      );
    }

    // Sync must_change_password = true to DB
    await prisma.user.update({
      where: { id: user_id },
      data: { must_change_password: true },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        user_id: adminUser!.userId,
        action: "auth.password_reset",
        resource_type: "staff",
        resource_id: user_id,
      },
    });

    return successResponse({
      user_id,
      temporary_password: temporaryPassword,
    });
  } catch (error) {
    console.error("POST /api/auth/reset-password error:", error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      "サーバー内部エラー",
      ERROR_CODES.INTERNAL_ERROR.status
    );
  }
}
