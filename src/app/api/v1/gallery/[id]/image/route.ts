import { NextResponse, type NextRequest } from "next/server";

import { galleryImage } from "@/server/gallery";

/**
 * GET /api/v1/gallery/{id}/image: a gallery item rendered by the print engine (PNG). Public
 * catalogue data; rendered once and cached, and cached by the CDN for a day.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const png = await galleryImage(id);
  if (!png) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(Buffer.from(png, "base64"), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
