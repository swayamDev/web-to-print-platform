/**
 * Decorative hero illustration: a race-number proof with trim, bleed and safe-area guides
 * and dimension call-outs, drawn in HTML/CSS. Mirrors the seeded "Classic Bib" template.
 */
export function SampleProof() {
  return (
    <figure className="relative mx-auto w-full max-w-[19rem]" aria-label="Sample race-number proof">
      {/* Width call-out */}
      <div className="spec-label text-muted-foreground mb-2 flex items-center gap-2">
        <span className="bg-muted-foreground/50 h-px flex-1" />
        148 mm
        <span className="bg-muted-foreground/50 h-px flex-1" />
      </div>

      <div className="flex gap-2">
        {/* Bleed area (outer) */}
        <div className="bg-signal/15 crop-marks relative aspect-[154/216] flex-1 p-[1.9%] shadow-[0_24px_60px_-24px_rgb(18_18_18/0.35)]">
          {/* Trim (the finished bib) */}
          <div className="outline-ink/70 relative flex h-full flex-col overflow-hidden bg-white outline outline-1">
            <div className="bg-signal text-ink grid h-[15%] place-items-center">
              <span className="font-heading text-[0.8rem] font-bold tracking-wide">
                CITY 10K 2026
              </span>
            </div>
            <div className="grid flex-1 place-items-center">
              <span className="font-heading num text-[4.6rem] leading-none font-bold tracking-tighter">
                1234
              </span>
            </div>
            <div className="pb-[14%] text-center">
              <span className="text-[0.95rem] font-semibold tracking-[0.12em]">ALEX MORGAN</span>
            </div>
            <p className="text-muted-foreground absolute bottom-[4%] w-full text-center text-[0.55rem]">
              Pin at all four corners
            </p>
            {/* Safe area guide */}
            <div className="border-signal pointer-events-none absolute inset-[2%] border border-dashed" />
          </div>
        </div>
        {/* Height call-out */}
        <div className="spec-label text-muted-foreground flex flex-col items-center gap-2 [writing-mode:vertical-rl]">
          <span className="bg-muted-foreground/50 w-px flex-1" />
          210 mm
          <span className="bg-muted-foreground/50 w-px flex-1" />
        </div>
      </div>

      <figcaption className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <Legend swatch="bg-signal/25" label="3 mm bleed" />
        <Legend swatch="outline outline-1 outline-ink/70 bg-white" label="Trim" />
        <Legend swatch="border border-dashed border-signal" label="Safe area" />
      </figcaption>
    </figure>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="spec-label text-muted-foreground inline-flex items-center gap-1.5">
      <span className={`inline-block size-2.5 ${swatch}`} aria-hidden="true" />
      {label}
    </span>
  );
}
