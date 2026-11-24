import { ArrowRight } from "lucide-react";
import Link from "next/link";

import type { GalleryItem } from "@/server/gallery";

/**
 * Gallery cards: each piece sits on a cutting-mat background like a print on the bench.
 * Items without a real photo are rendered by the print engine and labelled "Sample work"
 * (DECISIONS D-19).
 */
export function GalleryGrid({
  items,
  headingLevel = 3,
}: {
  items: GalleryItem[];
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="gallery-grid">
      {items.map((item, index) => (
        <li
          key={item.id}
          className="motion-reveal"
          style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
        >
          <figure className="group bg-card hover:border-ink focus-within:border-ink grid h-full overflow-hidden rounded-lg border transition-colors duration-300">
            <div className="bg-muted relative aspect-[4/3] overflow-hidden border-b">
              {/* eslint-disable-next-line @next/next/no-img-element -- rendered on demand by our print engine and CDN-cached */}
              <img
                src={item.imageUrl}
                alt={`${item.title}: ${item.product.name}`}
                width={item.width}
                height={item.height}
                loading={index < 3 ? "eager" : "lazy"}
                decoding="async"
                // Fitted inside the frame; drop-shadow follows the piece, not the letterbox.
                className="absolute inset-6 m-auto h-[calc(100%-3rem)] w-[calc(100%-3rem)] object-contain drop-shadow-[0_6px_10px_rgb(0_0_0/0.25)] transition-transform duration-300 ease-out group-hover:scale-[1.03]"
              />
              {item.isSample ? (
                <span
                  title="Print-engine sample"
                  className="bg-ink text-paper absolute right-0 bottom-0 px-2 py-1 text-xs"
                >
                  Sample work
                </span>
              ) : null}
            </div>
            <figcaption className="grid content-start gap-1 p-4">
              <p className="spec-label text-muted-foreground">{item.division.name}</p>
              <Heading className="text-base font-semibold">{item.title}</Heading>
              {item.caption ? (
                <p className="text-muted-foreground text-sm">{item.caption}</p>
              ) : null}
              <Link
                href={`/p/${item.product.slug}`}
                className="text-foreground mt-1 inline-flex w-fit items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
              >
                Make one like this
                <ArrowRight
                  className="size-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
                <span className="sr-only">: {item.product.name}</span>
              </Link>
            </figcaption>
          </figure>
        </li>
      ))}
    </ul>
  );
}
