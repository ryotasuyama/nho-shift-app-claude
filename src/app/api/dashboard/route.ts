import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils/date";

export async function GET() {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    // Run independent queries in parallel
    const [terms, staffCounts, activeStaffCount] = await Promise.all([
      prisma.term.findMany({
        orderBy: { start_date: "desc" },
        take: 20,
      }),
      prisma.staff.groupBy({
        by: ["team"],
        where: { is_active: true },
        _count: { id: true },
      }),
      prisma.staff.count({ where: { is_active: true } }),
    ]);

    const teamA = staffCounts.find((s) => s.team === "A")?._count.id ?? 0;
    const teamB = staffCounts.find((s) => s.team === "B")?._count.id ?? 0;

    // Request summaries: single grouped query instead of N+1
    const collectingTerms = terms.filter((t) => t.status === "collecting");
    const collectingTermIds = collectingTerms.map((t) => t.id);

    let requestSummaries: {
      term_id: string;
      term_label: string;
      total_requests: number;
      staff_with_requests: number;
      total_staff: number;
    }[] = [];

    if (collectingTermIds.length > 0) {
      const allRequests = await prisma.shiftRequest.findMany({
        where: { term_id: { in: collectingTermIds } },
        select: { term_id: true, staff_id: true },
      });

      // Group by term_id
      const byTerm = new Map<string, { count: number; staffIds: Set<string> }>();
      for (const r of allRequests) {
        let entry = byTerm.get(r.term_id);
        if (!entry) {
          entry = { count: 0, staffIds: new Set() };
          byTerm.set(r.term_id, entry);
        }
        entry.count++;
        entry.staffIds.add(r.staff_id);
      }

      requestSummaries = collectingTerms.map((t) => {
        const data = byTerm.get(t.id);
        return {
          term_id: t.id,
          term_label: `${formatDate(t.start_date)} 〜 ${formatDate(t.end_date)}`,
          total_requests: data?.count ?? 0,
          staff_with_requests: data?.staffIds.size ?? 0,
          total_staff: activeStaffCount,
        };
      });
    }

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
