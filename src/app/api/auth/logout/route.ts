import { createServerSupabase } from "@/lib/supabase/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";

export async function POST() {
  try {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();

    return successResponse({ message: "ログアウトしました" });
  } catch (error) {
    console.error("POST /api/auth/logout error:", error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      "サーバー内部エラー",
      ERROR_CODES.INTERNAL_ERROR.status
    );
  }
}
