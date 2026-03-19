import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-guard";
import { errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { formatDate, getDateRange } from "@/lib/utils/date";
import ReactPDF from "@react-pdf/renderer";
import { createShiftPdfDocument } from "@/lib/pdf/shift-pdf-document";

type RouteContext = { params: Promise<{ termId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    const { termId } = await context.params;
    const isAdmin = user!.role === "admin";

    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "タームが見つかりません", ERROR_CODES.NOT_FOUND.status);
    }

    // Only adjusting or confirmed terms can be exported
    if (term.status !== "adjusting" && term.status !== "confirmed") {
      return errorResponse(ERROR_CODES.CONFLICT.code, "このステータスではPDF出力できません", ERROR_CODES.CONFLICT.status);
    }

    // Staff can only view confirmed
    if (!isAdmin && term.status !== "confirmed") {
      return errorResponse(ERROR_CODES.FORBIDDEN.code, "このタームのPDFは閲覧できません", ERROR_CODES.FORBIDDEN.status);
    }

    const entries = await prisma.shiftEntry.findMany({
      where: { term_id: termId },
      include: {
        staff: { select: { name: true, staff_code: true, team: true } },
      },
      orderBy: [{ staff: { team: "asc" } }, { staff: { staff_code: "asc" } }, { date: "asc" }],
    });

    const staffRecords = await prisma.staff.findMany({
      where: { is_active: true },
      select: { id: true, name: true, staff_code: true, team: true },
      orderBy: [{ team: "asc" }, { staff_code: "asc" }],
    });

    const dates = getDateRange(term.start_date, term.end_date).map(formatDate);
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: term.start_date, lte: term.end_date } },
    });
    const holidayDates = new Set(holidays.map((h) => formatDate(h.date)));

    const formattedEntries = entries.map((e) => ({
      staff_id: e.staff_id,
      staff_name: e.staff.name,
      staff_code: e.staff.staff_code,
      team: e.staff.team,
      date: formatDate(e.date),
      shift_type: e.shift_type,
    }));

    const doc = createShiftPdfDocument({
      termStart: formatDate(term.start_date),
      termEnd: formatDate(term.end_date),
      staffs: staffRecords,
      entries: formattedEntries,
      dates,
      holidays: holidayDates,
    });

    const pdfStream = await ReactPDF.renderToStream(doc);
    const chunks: Uint8Array[] = [];
    for await (const chunk of pdfStream) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);

    const filename = `shift_${formatDate(term.start_date)}_${formatDate(term.end_date)}.pdf`;

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("GET /api/terms/[termId]/shifts/pdf error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "PDF生成中にエラーが発生しました", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
