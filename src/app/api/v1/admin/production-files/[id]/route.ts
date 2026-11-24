import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/server/auth";
import { productionDownloadUrl } from "@/server/production";

/**
 * GET /api/v1/admin/production-files/{id}: download a print file (admins only, PRD p7 §10).
 * Checks the admin role itself (not only the proxy), logs the download, then redirects to a
 * 60-second signed link. Anyone else gets a 404, so file ids reveal nothing.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || user.profile.role !== "admin" || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const url = await productionDownloadUrl(id, user.id);
  if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(url, { status: 303, headers: { "Cache-Control": "no-store" } });
}
