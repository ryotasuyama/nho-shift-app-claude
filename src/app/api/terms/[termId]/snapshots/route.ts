import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api/auth-guard";
import { successResponse, errorResponse } from "@/lib/api/response";
import { ERROR_CODES } from "@/lib/api/errors";

type RouteContext = { params: Promise<{ termId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { error: authError } = await requireAdmin();
    if (authError) return authError;

    const { termId } = await context.params;

    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term) {
      return errorResponse(ERROR_CODES.NOT_FOUND.code, "タームが見つかりません", ERROR_CODES.NOT_FOUND.status);
    }

    const snapshots = await prisma.shiftSnapshot.findMany({
      where: { term_id: termId },
      include: {
        creator: { select: { email: true } },
      },
      orderBy: { version: "desc" },
    });

    type SnapshotData = { entries?: { staff_id: string }[] };

    return successResponse(
      snapshots.map((s) => ({
        id: s.id,
        version: s.version,
        created_by: s.creator.email,
        created_at: s.created_at.toISOString(),
        entry_count: ((s.data as SnapshotData)?.entries ?? []).length,
      }))
    );
  } catch (error) {
    console.error("GET /api/terms/[termId]/snapshots error:", error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR.code, "サーバー内部エラー", ERROR_CODES.INTERNAL_ERROR.status);
  }
}
