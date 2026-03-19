import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const GENERATING_STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export async function GET() {
  try {
    // Check for stuck generating terms
    const stuckTerms = await prisma.term.findMany({
      where: {
        status: "generating",
        generating_started_at: { not: null },
      },
    });

    const rolledBack: string[] = [];
    for (const term of stuckTerms) {
      if (term.generating_started_at) {
        const elapsed = Date.now() - term.generating_started_at.getTime();
        if (elapsed > GENERATING_STUCK_THRESHOLD_MS) {
          await prisma.term.update({
            where: { id: term.id },
            data: { status: "collecting", generating_started_at: null },
          });
          await prisma.auditLog.create({
            data: {
              user_id: "00000000-0000-0000-0000-000000000000",
              action: "term.auto_rollback",
              resource_type: "term",
              resource_id: term.id,
              detail: { elapsed_ms: elapsed, reason: "stuck_generating" },
            },
          });
          rolledBack.push(term.id);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      stuck_terms_found: stuckTerms.length,
      terms_rolled_back: rolledBack,
    });
  } catch (error) {
    console.error("Health check error:", error);
    return NextResponse.json({ ok: false, error: "Health check failed" }, { status: 500 });
  }
}
