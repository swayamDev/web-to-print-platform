import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const photographs: Record<string, { file: string; alt: string }> = {
  hero: {
    file: "hero",
    alt: "Race bib, die-cut stickers, stamp, acrylic sign and brass plate on a graphite worktop",
  },
  "labels-stickers": {
    file: "stickers",
    alt: "Orange, blue and ivory die-cut stickers with a lifted backing edge",
  },
  "race-event-numbers": { file: "race", alt: "White race bib printed with CITY 10K and 417" },
  "mtb-boards": { file: "mtb", alt: "White and green MTB handlebar number board marked 28" },
  stamps: { file: "stamp", alt: "Black self-inking stamp beside a red geometric impression" },
  trophies: { file: "trophy", alt: "Brushed brass award plate engraved FINISHER" },
  "laser-cut": { file: "laser", alt: "Clear acrylic arrow sign supported by metal standoffs" },
  "race-material": {
    file: "race-material",
    alt: "Close view of printed yellow and black ink over a textured white bib",
  },
  "race-context": { file: "race-context", alt: "Race bib 417 pinned to a runner's vest" },
};

const crops = {
  mobile: { aspect: "aspect-[4/3]", height: 720 },
  tile: { aspect: "aspect-[4/3]", height: 720 },
  standard: { aspect: "aspect-[8/5]", height: 600 },
  wide: { aspect: "aspect-[2/1]", height: 480 },
};

function imagePath(file: string, crop: keyof typeof crops, width: number) {
  return `/storefront/photos/${file}-${crop}-${width}.webp`;
}

const maximumWidths: Record<string, number> = {
  "laser-tile": 1360,
  "laser-standard": 1408,
  "mtb-tile": 1056,
  "mtb-standard": 1120,
  "race-graphic-tile": 1360,
  "race-material-standard": 640,
  "race-mobile": 720,
  "race-standard": 848,
  "stamp-tile": 1360,
  "stickers-tile": 1056,
  "stickers-standard": 1216,
};

function imageSizes(file: string, crop: keyof typeof crops) {
  const maximum = maximumWidths[`${file}-${crop}`] ?? 1440;
  const width = Math.min(960, maximum);
  const height = Math.round((width * crops[crop].height) / 960);
  const srcSet = [...new Set([480, width, maximum])]
    .map((size) => `${imagePath(file, crop, size)} ${size}w`)
    .join(", ");
  return { width, height, srcSet };
}

export function StorefrontImage({
  slug,
  placement = "division",
  className,
  sizes = "(max-width: 767px) 100vw, 46vw",
  fallback = null,
}: {
  slug: string;
  placement?: "hero" | "tile" | "division" | "product" | "support";
  className?: string;
  sizes?: string;
  fallback?: ReactNode;
}) {
  const image = photographs[slug];
  if (!image) return fallback;

  const tile = placement === "tile";
  const hero = placement === "hero";
  const raceProduct = slug === "race-event-numbers" && placement === "product";
  const mobileCrop = hero ? "standard" : raceProduct ? "mobile" : undefined;
  const file = tile && slug === "race-event-numbers" ? "race-graphic" : image.file;
  const crop = tile ? "tile" : hero ? "wide" : "standard";

  const mobileSizes = mobileCrop && imageSizes(file, mobileCrop);
  const standardSizes = imageSizes(file, crop);

  return (
    <figure className={cn("min-w-0", className)}>
      <picture
        className={cn(
          "bg-ink relative block overflow-hidden",
          hero ? "aspect-[8/5] md:aspect-[2/1]" : crops[crop].aspect,
          raceProduct && "aspect-[4/3] md:aspect-[8/5]",
        )}
      >
        {mobileSizes && <source media="(max-width: 767px)" {...mobileSizes} sizes={sizes} />}
        <img
          src={imagePath(file, crop, standardSizes.width)}
          {...standardSizes}
          sizes={sizes}
          alt={tile ? "" : image.alt}
          loading={hero ? "eager" : "lazy"}
          fetchPriority={hero ? "high" : undefined}
          className="absolute inset-0 size-full object-cover"
        />
      </picture>
      <figcaption
        className={cn(
          "text-muted-foreground pt-1 text-xs",
          hero && "text-paper/80 px-4 pb-2 md:px-0",
        )}
      >
        AI-generated sample
      </figcaption>
    </figure>
  );
}
