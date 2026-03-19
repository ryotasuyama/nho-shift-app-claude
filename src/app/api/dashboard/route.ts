import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils/date";

export async function GET() {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    // Terms (ordered by start_date desc)
    const terms = await prisma.term.findMany({
      orderBy: { start_date: "desc" },
      take: 20,
    });

    // Staff count
    const staffCounts = await prisma.staff.groupBy({
      by: ["team"],
      where: { is_active: true },
      _count: { id: true },
    });

    const teamA = staffCounts.find((s) => s.team === "A")?._count.id ?? 0;
    const teamB = staffCounts.find((s) => s.team === "B")?._count.id ?? 0;

    // Request summaries for collecting terms
    const collectingTerms = terms.filter((t) => t.status === "collecting");
    const activeStaffCount = await prisma.staff.count({ where: { is_active: true } });

    const requestSummaries = await Promise.all(
      collectingTerms.map(async (t) => {
        const requests = await prisma.shiftRequest.findMany({
          where: { term_id: t.id },
          select: { staff_id: true },
        });
        const uniqueStaffs = new Set(requests.map((r) => r.staff_id));
        return {
          term_id: t.id,
          term_label: `${formatDate(t.start_date)} 〜 ${formatDate(t.end_date)}`,
          total_requests: requests.length,
          staff_with_requests: uniqueStaffs.size,
          total_staff: activeStaffCount,
        };
      })
    );

    return successResponse({
      terms: terms.map((t) => ({
        id: t.id,
        start_date: formatDate(t.start_date),
        end_date: formatDate(t.end_date),
        status: t.status,
        fiscal_year: t.fiscal_year,
      })),
      staff_count: {
        total: teamA + teamB,
        teamA,
        teamB,
      },
      request_summaries: requestSummaries,
    });
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
