import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { designDocumentSchema } from "@/domain/design/schema";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { renderDesign } from "@/server/render";
import { createSupabasePublicClient } from "@/server/supabase/public";

const querySchema = z.object({
  format: z.enum(["pdf", "png"]).default("png"),
  dpi: z.coerce.number().int().min(36).max(300).default(150),
  guides: z.enum(["0", "1"]).default("1"),
});
const previewWindowSeconds = 60;

/**
 * GET /api/v1/templates/:id/preview?format=png|pdf&dpi=150&guides=1
 *
 * Renders an active template with its sample text on the server: the same engine that will
 * produce proofs and print files. Public (templates are public catalogue data), rate limited.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Unknown template." }, { status: 404 });
  }
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json({ error: "Invalid preview options." }, { status: 400 });
  }
  if (!(await rateLimit(`preview:${clientIp(request.headers)}`, 30, previewWindowSeconds))) {
    return NextResponse.json(
      { error: "Too many previews. Try again in a minute." },
      {
        status: 429,
        headers: { "Retry-After": String(previewWindowSeconds), "Cache-Control": "no-store" },
      },
    );
  }

  const supabase = createSupabasePublicClient();
  const { data: template } = await supabase
    .from("templates")
    .select("id, name, document, product:products(slug)")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (!template) return NextResponse.json({ error: "Unknown template." }, { status: 404 });

  const document = designDocumentSchema.safeParse(template.document);
  if (!document.success) {
    return NextResponse.json({ error: "This template is not a valid design." }, { status: 422 });
  }

  const { format, dpi, guides } = query.data;
  const started = performance.now();
  const result = await renderDesign(
    {
      document: document.data,
      format,
      dpi,
      guides: format === "png" && guides === "1",
      meta: {
        title: `${template.name} (preview)`,
        keywords: [`template:${template.id}`],
        date: new Date(0),
      },
    },
    true,
  );
  if (!result.ok) return NextResponse.json({ issues: result.issues }, { status: 422 });

  const slug = template.product?.slug ?? "template";
  return new NextResponse(Buffer.from(result.bytes), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `inline; filename="${slug}_template-preview.${format}"`,
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Server-Timing": `render;dur=${Math.round(performance.now() - started)}`,
    },
  });
}
