import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { createStaffSchema } from "@/lib/validators/staff";
import { generateTemporaryPassword } from "@/lib/utils/password";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const team = searchParams.get("team");
    const isActiveParam = searchParams.get("is_active");
    const search = searchParams.get("search");

    const where: Prisma.StaffWhereInput = {};

    if (team === "A" || team === "B") {
      where.team = team;
    }

    if (isActiveParam !== null) {
      where.is_active = isActiveParam !== "false";
    } else {
      where.is_active = true;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { staff_code: { contains: search, mode: "insensitive" } },
      ];
    }

    const staffs = await prisma.staff.findMany({
      where,
      orderBy: [{ team: "asc" }, { staff_code: "asc" }],
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

    return successResponse(staffs);
  } catch (error) {
    console.error("GET /api/staffs error:", error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      "サーバー内部エラー",
      ERROR_CODES.INTERNAL_ERROR.status
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user: adminUser, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body: unknown = await request.json();
    const result = createStaffSchema.safeParse(body);

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

    const { staff_code, name, email, experience_years, team, night_shift_available } =
      result.data;

    // Check uniqueness
    const [existingCode, existingEmail] = await Promise.all([
      prisma.staff.findUnique({ where: { staff_code } }),
      prisma.user.findUnique({ where: { email } }),
    ]);

    if (existingCode) {
      return errorResponse(
        ERROR_CODES.CONFLICT.code,
        "このスタッフコードは既に使用されています",
        ERROR_CODES.CONFLICT.status
      );
    }

    if (existingEmail) {
      return errorResponse(
        ERROR_CODES.CONFLICT.code,
        "このメールアドレスは既に登録されています",
        ERROR_CODES.CONFLICT.status
      );
    }

    const temporaryPassword = generateTemporaryPassword();

    // Step 1: Create Supabase Auth user
    const { data: authData, error: createAuthError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          role: "staff",
          must_change_password: true,
        },
      });

    if (createAuthError || !authData.user) {
      console.error("Auth user creation failed:", createAuthError);
      return errorResponse(
        ERROR_CODES.INTERNAL_ERROR.code,
        "ユーザーアカウントの作成に失敗しました",
        ERROR_CODES.INTERNAL_ERROR.status
      );
    }

    const authUserId = authData.user.id;

    // Step 2: Create DB records in transaction (compensation if fails)
    try {
      const staff = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: authUserId,
            email,
            role: "staff",
            must_change_password: true,
          },
        });

        const newStaff = await tx.staff.create({
          data: {
            user_id: user.id,
            staff_code,
            name,
            experience_years,
            team,
            night_shift_available,
          },
        });

        await tx.auditLog.create({
          data: {
            user_id: adminUser!.userId,
            action: "staff.create",
            resource_type: "staff",
            resource_id: newStaff.id,
            detail: { staff_code, name, email, team },
          },
        });

        return newStaff;
      });

      return successResponse(
        {
          id: staff.id,
          user_id: staff.user_id,
          staff_code: staff.staff_code,
          name: staff.name,
          temporary_password: temporaryPassword,
        },
        201
      );
    } catch (dbError) {
      // Step 3: Compensation - delete Auth user
      console.error("DB transaction failed, compensating Auth user:", dbError);
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      } catch (deleteError) {
        // Step 4: Compensation failed - log for manual cleanup
        console.error(
          `CRITICAL: Failed to delete orphaned Auth user ${authUserId}. Manual cleanup required.`,
          deleteError
        );
      }
      return errorResponse(
        ERROR_CODES.INTERNAL_ERROR.code,
        "スタッフの作成に失敗しました",
        ERROR_CODES.INTERNAL_ERROR.status
      );
    }
  } catch (error) {
    console.error("POST /api/staffs error:", error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      "サーバー内部エラー",
      ERROR_CODES.INTERNAL_ERROR.status
    );
  }
}
