import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";
import { formatDate } from "@/lib/utils/date";

export async function GET() {
  try {
    const { user, error: authError } = await requireAuth();
    if (authError) return authError;

    // Run independent queries in parallel
    const [staff, collectingTerms, confirmedTerms] = await Promise.all([
      prisma.staff.findUnique({
        where: { user_id: user!.userId },
      }),
      prisma.term.findMany({
        where: { status: "collecting" },
        orderBy: { start_date: "asc" },
      }),
      prisma.term.findMany({
        where: { status: "confirmed" },
        orderBy: { start_date: "desc" },
        take: 5,
      }),
    ]);

    // My requests (depends on staff)
    let myRequests: { id: string; term_id: string; requested_date: string }[] = [];
    if (staff) {
      const requests = await prisma.shiftRequest.findMany({
        where: { staff_id: staff.id },
        orderBy: { requested_date: "asc" },
      });
      myRequests = requests.map((r) => ({
        id: r.id,
        term_id: r.term_id,
        requested_date: formatDate(r.requested_date),
      }));
    }

    return successResponse({
      collecting_terms: collectingTerms.map((t) => ({
        id: t.id,
        start_date: formatDate(t.start_date),
        end_date: formatDate(t.end_date),
        status: t.status,
        request_deadline: t.request_deadline ? formatDate(t.request_deadline) : null,
      })),
      confirmed_terms: confirmedTerms.map((t) => ({
        id: t.id,
        start_date: formatDate(t.start_date),
        end_date: formatDate(t.end_date),
        status: t.status,
        request_deadline: t.request_deadline ? formatDate(t.request_deadline) : null,
      })),
      my_requests: myRequests,
    });
  } catch (error) {
    console.error("GET /api/staff-home error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
