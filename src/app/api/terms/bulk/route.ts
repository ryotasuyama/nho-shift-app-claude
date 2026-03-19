import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { bulkCreateTermSchema } from "@/lib/validators/term";
import { deriveFiscalYear, addDays, parseDate, formatDate } from "@/lib/utils/date";

const TERM_COUNT = 13;
const TERM_DAYS = 28;

export async function POST(request: Request) {
  try {
    const { user: adminUser, error: authError } = await requireAdmin();
    if (authError) return authError;

    const body: unknown = await request.json();
    const result = bulkCreateTermSchema.safeParse(body);

    if (!result.success) {
      return errorResponse(
        ERROR_CODES.VALIDATION_ERROR.code,
        "入力値が不正です",
        ERROR_CODES.VALIDATION_ERROR.status,
        result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }))
      );
    }

    // Generate 13 terms (each 28 days, consecutive)
    const firstStart = parseDate(result.data.year_start_date);
    const termDates: { start_date: Date; end_date: Date; fiscal_year: number }[] = [];

    for (let i = 0; i < TERM_COUNT; i++) {
      const startDate = addDays(firstStart, i * TERM_DAYS);
      const endDate = addDays(startDate, TERM_DAYS - 1);
      termDates.push({
        start_date: startDate,
        end_date: endDate,
        fiscal_year: deriveFiscalYear(startDate),
      });
    }

    // Check for overlap with existing terms
    const firstDate = termDates[0]!.start_date;
    const lastDate = termDates[termDates.length - 1]!.end_date;

    const existingTerms = await prisma.term.findMany({
      where: {
        AND: [
          { start_date: { lte: lastDate } },
          { end_date: { gte: firstDate } },
        ],
      },
    });

    if (existingTerms.length > 0) {
      const overlapping = termDates.filter((td) =>
        existingTerms.some(
          (et) => td.start_date <= et.end_date && td.end_date >= et.start_date
        )
      );
      const overlapList = overlapping
        .map((o) => `${formatDate(o.start_date)}〜${formatDate(o.end_date)}`)
        .join(", ");
      return errorResponse(
        ERROR_CODES.CONFLICT.code,
        `以下のタームが既存のタームと重複しています: ${overlapList}`,
        ERROR_CODES.CONFLICT.status
      );
    }

    // All-or-nothing creation
    const terms = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const td of termDates) {
        const term = await tx.term.create({ data: td });
        created.push(term);
      }

      await tx.auditLog.create({
        data: {
          user_id: adminUser!.userId,
          action: "term.create",
          resource_type: "term",
          detail: {
            bulk: true,
            count: TERM_COUNT,
            year_start_date: result.data.year_start_date,
          },
        },
      });

      return created;
    });

    const formatted = terms.map((t) => ({
      ...t,
      start_date: formatDate(t.start_date),
      end_date: formatDate(t.end_date),
      request_deadline: t.request_deadline ? formatDate(t.request_deadline) : null,
    }));

    return successResponse({ terms: formatted, count: terms.length }, 201);
  } catch (error) {
    console.error("POST /api/terms/bulk error:", error);
    return errorResponse(
      ERROR_CODES.INTERNAL_ERROR.code,
      "サーバー内部エラー",
      ERROR_CODES.INTERNAL_ERROR.status
    );
  }
}
