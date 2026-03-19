import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validators/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";

export async function PUT(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return errorResponse(
        ERROR_CODES.UNAUTHORIZED.code,
        "認証が必要です",
        ERROR_CODES.UNAUTHORIZED.status
      );
    }

    const body: unknown = await request.json();
    const result = changePasswordSchema.safeParse(body);

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

    const { current_password, new_password } = result.data;

    // Verify current password by re-authenticating
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: current_password,
    });

    if (verifyError) {
      return errorResponse(
        ERROR_CODES.UNAUTHORIZED.code,
        "現在のパスワードが正しくありません",
        ERROR_CODES.UNAUTHORIZED.status
      );
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: new_password,
    });

    if (updateError) {
      console.error("Password update failed:", updateError);
      return errorResponse(
        ERROR_CODES.INTERNAL_ERROR.code,
        "パスワードの更新に失敗しました",
        ERROR_CODES.INTERNAL_ERROR.status
      );
    }

    // Sync must_change_password = false to both DB and user_metadata
    await Promise.all([
      prisma.user.update({
        where: { id: user.id },
        data: { must_change_password: false },
      }),
      supabaseAdmin.auth.admin.updateUserById(user.id, {
        user_metadata: { must_change_password: false },
      }),
    ]);

    return successResponse({ message: "パスワードを変更しました" });
  } catch (error) {
    console.error("PUT /api/auth/password error:", error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      "サーバー内部エラー",
      ERROR_CODES.INTERNAL_ERROR.status
    );
  }
}
