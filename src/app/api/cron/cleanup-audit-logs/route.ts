import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);

    const result = await prisma.auditLog.deleteMany({
      where: { created_at: { lt: cutoff } },
    });

    return NextResponse.json({
      ok: true,
      deleted: result.count,
      cutoff_date: cutoff.toISOString(),
    });
  } catch (error) {
    console.error("Cron cleanup-audit-logs error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
