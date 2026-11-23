/** Loading placeholder shown while a signed-in page streams in. */
export function PageSkeleton() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <div className="bg-muted h-8 w-48 animate-pulse rounded-lg" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-muted h-32 animate-pulse rounded-xl" />
        <div className="bg-muted h-32 animate-pulse rounded-xl" />
      </div>
      <div className="bg-muted h-48 animate-pulse rounded-xl" />
    </div>
  );
}
