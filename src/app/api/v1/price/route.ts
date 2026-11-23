import { NextResponse, type NextRequest } from "next/server";

import { quotePrice } from "@/server/pricing";
import { clientIp, rateLimit } from "@/server/rate-limit";

const MAX_BODY_BYTES = 4 * 1024;

/**
 * POST /api/v1/price — price a configured product with the current rules.
 *
 * Body: { productSlug, widthMm, heightMm, materialSlug, quantity, options?, variableData? }
 * 200 { quote } · 400 malformed · 404 unknown product · 422 not orderable · 429 rate limited
 *
 * The configurator calls this to confirm its instant in-browser price; checkout runs the
 * same server pricing again before charging, so a price is never taken from the client.
 */
export async function POST(request: NextRequest) {
  const allowed = await rateLimit(`price:${clientIp(request.headers)}`, 120, 60);
  if (!allowed) {
    return NextResponse.json(
      { errors: [{ field: "request", message: "Too many price requests. Please slow down." }] },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { errors: [{ field: "request", message: "Request body is too large." }] },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { errors: [{ field: "request", message: "Request body must be JSON." }] },
      { status: 400 },
    );
  }

  const outcome = await quotePrice(body);
  return outcome.status === 200
    ? NextResponse.json({ quote: outcome.quote }, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ errors: outcome.errors }, { status: outcome.status });
}
