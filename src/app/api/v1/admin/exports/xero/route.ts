import { NextResponse, type NextRequest } from "next/server";

import { reportPeriod } from "@/domain/reports";
import { getSessionUser } from "@/server/auth";
import { exportXeroCsv } from "@/server/catalogue-admin";
import { rateLimit } from "@/server/rate-limit";

/**
 * GET /api/v1/admin/exports/xero?from=YYYY-MM-DD&to=YYYY-MM-DD (or ?period=month …)
 *
 * Invoices issued in the period as a Xero sales-invoice import CSV (PRD p9 §14). Admins only
 * (checked here, not only in the proxy); anyone else gets a 404. Each export is audit-logged.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.profile.role !== "admin") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await rateLimit(`export:${user.id}`, 20, 600, false))) {
    return NextResponse.json({ error: "Too many exports. Please wait." }, { status: 429 });
  }
  const q = request.nextUrl.searchParams;
  const period = reportPeriod(
    {
      period: q.get("period") ?? undefined,
      from: q.get("from") ?? undefined,
      to: q.get("to") ?? undefined,
    },
    new Date(),
  );
  const file = await exportXeroCsv(user.id, period);
  return new NextResponse(`﻿${file.csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Invoice-Count": String(file.invoices),
    },
  });
}
