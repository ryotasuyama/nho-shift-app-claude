import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { loginSchema } from "@/lib/validators/auth";
import { prisma } from "@/lib/prisma";
import { errorResponse, successResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = loginSchema.safeParse(body);

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

    const { email, password } = result.data;

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      console.error("Supabase auth error:", authError.message, authError);
      if (authError.message?.includes("rate")) {
        return errorResponse(
          ERROR_CODES.RATE_LIMITED.code,
          "ログイン試行回数が上限に達しました。しばらくしてから再試行してください",
          ERROR_CODES.RATE_LIMITED.status
        );
      }
      return errorResponse(
        ERROR_CODES.UNAUTHORIZED.code,
        "メールアドレスまたはパスワードが正しくありません",
        ERROR_CODES.UNAUTHORIZED.status
      );
    }

    const authUser = authData.user;

    // Fetch role and must_change_password from Prisma users table (source of truth)
    const dbUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true, must_change_password: true, staff: { select: { id: true } } },
    });

    const role = dbUser?.role ?? "staff";
    const mustChangePassword = dbUser?.must_change_password ?? false;

    return successResponse({
      user: {
        id: authUser.id,
        email: authUser.email,
        role,
        must_change_password: mustChangePassword,
        staff_id: dbUser?.staff?.id ?? null,
      },
    });
  } catch (error) {
    console.error("POST /api/auth/login error:", error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      "サーバー内部エラー",
      ERROR_CODES.INTERNAL_ERROR.status
    );
  }
}
