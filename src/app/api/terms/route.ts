import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { createTermSchema } from "@/lib/validators/term";
import { deriveFiscalYear, addDays, parseDate, formatDate } from "@/lib/utils/date";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const year = searchParams.get("year");
    const status = searchParams.get("status");

    const where: Prisma.TermWhereInput = {};

    if (year) {
      where.fiscal_year = parseInt(year, 10);
    }

    if (status) {
      where.status = status as Prisma.TermWhereInput["status"];
    }

    // Staff can only see collecting and confirmed terms
    if (user!.role !== "admin") {
      where.status = { in: ["collecting", "confirmed"] };
    }

    const terms = await prisma.term.findMany({
      where,
      orderBy: { start_date: "asc" },
      select: {
        id: true,
        start_date: true,
        end_date: true,
        fiscal_year: true,
        status: true,
        request_deadline: true,
        min_day_staff: true,
        lock_version: true,
      },
    });

    const formatted = terms.map((t) => ({
      ...t,
      start_date: formatDate(t.start_date),
      end_date: formatDate(t.end_date),
      request_deadline: t.request_deadline ? formatDate(t.request_deadline) : null,
    }));

    return successResponse(formatted);
  } catch (error) {
    console.error("GET /api/terms error:", error);
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
    const result = createTermSchema.safeParse(body);

    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        "入力値が不正です",
        ERROR_CODES.VALIDATION_ERROR.status,
        result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      );
    }

    const startDate = parseDate(result.data.start_date);
    const endDate = addDays(startDate, 27);
    const fiscalYear = deriveFiscalYear(startDate);

    // Check for overlap
    const overlap = await prisma.term.findFirst({
      where: {
        AND: [
          { start_date: { lte: endDate } },
          { end_date: { gte: startDate } },
        ],
      },
    });

    if (overlap) {
      return errorResponse(
        ERROR_CODES.CONFLICT.code,
        "指定された期間は既存のタームと重複しています",
        ERROR_CODES.CONFLICT.status
      );
    }

    const term = await prisma.term.create({
      data: {
        start_date: startDate,
        end_date: endDate,
        fiscal_year: fiscalYear,
      },
    });

    await prisma.auditLog.create({
      data: {
        user_id: adminUser!.userId,
        action: "term.create",
        resource_type: "term",
        resource_id: term.id,
        detail: { start_date: result.data.start_date, fiscal_year: fiscalYear },
      },
    });

    return successResponse(
      {
        ...term,
        start_date: formatDate(term.start_date),
        end_date: formatDate(term.end_date),
        request_deadline: null,
      },
      201
    );
  } catch (error) {
    console.error("POST /api/terms error:", error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      "サーバー内部エラー",
      ERROR_CODES.INTERNAL_ERROR.status
    );
  }
}
