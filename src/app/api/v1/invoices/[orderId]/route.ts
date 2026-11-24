import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSessionUser } from "@/server/auth";
import { invoiceForOrder } from "@/server/invoices";
import { rateLimit } from "@/server/rate-limit";

/**
 * GET /api/v1/invoices/{orderId}: the PDF invoice of a paid order (PRD p7 §09). Customers get
 * their own; admins any. Everyone else (and unpaid orders) gets a 404, so ids reveal nothing.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  const user = await getSessionUser();
  if (!user || !z.string().uuid().safeParse(orderId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await rateLimit(`invoice:${user.id}`, 60, 600, false))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const file = await invoiceForOrder(orderId, {
    id: user.id,
    role: user.profile.role === "admin" ? "admin" : "customer",
  });
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(Buffer.from(file.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
