/**
 * Temporary holding page (Phase 0).
 * Replaced in Phase 3 by the real home page: hero, six-division hub and price calculator.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 px-4 py-24">
      <p className="font-mono text-sm tracking-widest text-neutral-500 uppercase">
        Web-to-print platform
      </p>
      <h1 className="text-4xl font-semibold tracking-tight">Digital Heroes Print</h1>
      <p className="max-w-prose text-neutral-600">
        Labels &amp; stickers, race &amp; event numbers, MTB boards, stamps, trophies and laser-cut
        work. Configure, design, proof and order online.
      </p>
    </main>
  );
}
