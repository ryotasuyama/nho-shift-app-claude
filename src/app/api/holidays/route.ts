import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { createHolidaySchema } from "@/lib/validators/holiday";
import { parseDate, formatDate } from "@/lib/utils/date";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await requireAuth();
    if (authError) return authError;

    const { searchParams } = request.nextUrl;
    const year = searchParams.get("year");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    const where: Prisma.HolidayWhereInput = {};

    if (year) {
      where.year = parseInt(year, 10);
    }

    if (startDate && endDate) {
      where.date = {
        gte: parseDate(startDate),
        lte: parseDate(endDate),
      };
    }

    const holidays = await prisma.holiday.findMany({
      where,
      orderBy: { date: "asc" },
    });

    const formatted = holidays.map((h) => ({
      ...h,
      date: formatDate(h.date),
    }));

    return successResponse(formatted);
  } catch (error) {
    console.error("GET /api/holidays error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}

export async function POST(request: Request) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const body: unknown = await request.json();
    const result = createHolidaySchema.safeParse(body);

    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        "入力値が不正です",
        ERROR_CODES.VALIDATION_ERROR.status,
        result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      );
    }

    const date = parseDate(result.data.date);
    const year = date.getUTCFullYear();

    const existing = await prisma.holiday.findUnique({ where: { date } });
    if (existing) {
      return errorResponse(
        ERROR_CODES.CONFLICT.code,
        "この日付は既に祝日として登録されています",
        ERROR_CODES.CONFLICT.status
      );
    }

    const holiday = await prisma.holiday.create({
      data: {
        date,
        name: result.data.name,
        year,
        is_custom: true,
      },
    });

    return successResponse({ ...holiday, date: formatDate(holiday.date) }, 201);
  } catch (error) {
    console.error("POST /api/holidays error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
