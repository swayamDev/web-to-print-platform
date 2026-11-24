/** Illustrative guide diagram based on the seeded Classic Bib's 148 × 210 mm trim and 3 mm bleed. */
export function SampleProof() {
  return (
    <figure
      className="text-paper grid w-full max-w-[14rem] gap-4"
      aria-label="Illustrative race bib proof"
    >
      <div className="bg-bleed relative mx-auto grid aspect-[154/216] w-[min(100%,10rem)] p-[3px]">
        <div className="text-ink border-ink relative grid place-content-center gap-2 border bg-white px-4 text-center">
          <div className="border-safe-area pointer-events-none absolute inset-[5px] border-2 border-dashed" />
          <span className="font-mono text-[0.65rem]">CITY 10K · SAMPLE</span>
          <span className="font-display text-3xl">417</span>
          <span className="font-mono text-[0.65rem]">ALEX MORGAN</span>
        </div>
      </div>
      <figcaption className="grid justify-items-center gap-2 text-center text-xs">
        <span className="font-mono">Illustrative proof · 148 × 210 mm</span>
        <span className="flex flex-wrap justify-center gap-3">
          <span className="border-bleed border-b-2">3 mm bleed</span>
          <span className="border-paper border-b">Trim</span>
          <span className="border-safe-area border-b-2 border-dashed">Safe area</span>
        </span>
      </figcaption>
    </figure>
  );
}
