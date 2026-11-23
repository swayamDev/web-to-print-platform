import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createSupabasePublicClient } from "@/server/supabase/public";

/**
 * Daily keep-alive (vercel.json cron). Free Supabase projects pause after about a week
 * without activity; one tiny query a day keeps the evaluators' demo online.
 * Vercel sends `Authorization: Bearer $CRON_SECRET` with cron requests.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret ?? ""}`;
  const authorised =
    !!secret &&
    header.length === expected.length &&
    timingSafeEqual(Buffer.from(header), Buffer.from(expected));

  if (!authorised) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createSupabasePublicClient();
  const { count, error } = await supabase
    .from("divisions")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, divisions: count, at: new Date().toISOString() });
}
