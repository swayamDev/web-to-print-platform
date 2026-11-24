import { cn } from "@/lib/utils";

const illustrations: Record<string, { file: string; alt: string }> = {
  "labels-stickers": { file: "stickers", alt: "Illustration of orange and ivory die-cut stickers" },
  "race-event-numbers": {
    file: "race",
    alt: "Illustration of a clean white race bib labelled 417",
  },
  "mtb-boards": { file: "mtb", alt: "Illustration of a green corrugated number board" },
  stamps: { file: "stamp", alt: "Illustration of a black self-inking stamp and its impression" },
  trophies: { file: "trophy", alt: "Illustration of a brushed-brass award plate" },
  "laser-cut": { file: "laser", alt: "Illustration of a clear acrylic number sign" },
};

const heroImage = {
  file: "hero",
  alt: "Illustration of a race bib, colourful die-cut stickers, a stamp, a clear sign and a brass plate",
};

export function StorefrontImage({
  slug,
  hero = false,
  className,
  sizes = "(max-width: 767px) 50vw, 33vw",
}: {
  slug?: string;
  hero?: boolean;
  className?: string;
  sizes?: string;
}) {
  const image = hero ? heroImage : slug ? illustrations[slug] : undefined;
  if (!image) return null;

  return (
    <figure className={cn("bg-ink relative overflow-hidden", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-generated responsive WebP sizes are served directly */}
      <img
        src={`/storefront/${image.file}-960.webp`}
        srcSet={`/storefront/${image.file}-480.webp 480w, /storefront/${image.file}-960.webp 960w, /storefront/${image.file}-1440.webp 1440w`}
        sizes={sizes}
        alt={image.alt}
        width={960}
        height={640}
        loading={hero ? "eager" : "lazy"}
        fetchPriority={hero ? "high" : undefined}
        className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-[1.035] motion-reduce:transition-none"
      />
      <figcaption className="bg-ink absolute right-0 bottom-0 px-1.5 py-0.5 text-[0.6875rem] leading-4 text-white">
        Product illustration
      </figcaption>
    </figure>
  );
}
