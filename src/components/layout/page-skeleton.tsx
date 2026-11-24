/** Loading placeholder shown while a signed-in page streams in. */
export function PageSkeleton() {
  return (
    // At least a full screen tall (below the header), so content arriving does not push the footer into view (CLS).
    <div
      className="grid min-h-[calc(100dvh-3.5rem)] content-start gap-4"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <span className="sr-only">Loading page content</span>
      <div className="bg-muted h-8 w-48 rounded-lg motion-safe:animate-pulse" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-muted h-32 rounded-xl motion-safe:animate-pulse" />
        <div className="bg-muted h-32 rounded-xl motion-safe:animate-pulse" />
      </div>
      <div className="bg-muted h-48 rounded-xl motion-safe:animate-pulse" />
    </div>
  );
}
