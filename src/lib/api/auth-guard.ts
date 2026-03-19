import { createServerSupabase } from "@/lib/supabase/server";
import { errorResponse } from "./response";
import { ERROR_CODES } from "./errors";

type AuthResult = {
  userId: string;
  role: string;
  email: string;
};

export const getAuthUser = async (): Promise<AuthResult | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    userId: user.id,
    role: (user.user_metadata?.role as string) ?? "staff",
    email: user.email ?? "",
  };
};

export const requireAuth = async () => {
  const user = await getAuthUser();
  if (!user) {
    return {
      user: null,
      error: errorResponse(
        ERROR_CODES.UNAUTHORIZED.code,
        "認証が必要です",
        ERROR_CODES.UNAUTHORIZED.status
      ),
    };
  }
  return { user, error: null };
};

export const requireAdmin = async () => {
  const { user, error } = await requireAuth();
  if (error) return { user: null, error };

  if (user!.role !== "admin") {
    return {
      user: null,
      error: errorResponse(
        ERROR_CODES.FORBIDDEN.code,
        "管理者権限が必要です",
        ERROR_CODES.FORBIDDEN.status
      ),
    };
  }
  return { user, error: null };
};
