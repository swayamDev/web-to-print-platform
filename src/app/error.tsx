"use client";

import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";

/**
 * Shown when a page fails unexpectedly (a server or network error). Never shows error
 * details; the reference matches the server log entry for support.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;
  return (
    <main className="bg-mm-grid flex flex-1 items-center">
      <div className="mx-auto grid w-full max-w-xl justify-items-start gap-5 px-4 py-24">
        <p className="spec-label text-muted-foreground">Error · paper jam</p>
        <h1 className="text-4xl font-semibold">Something went wrong</h1>
        <p className="text-muted-foreground">
          This page could not be loaded. Nothing you saved has been lost. Please try again in a
          moment.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" className="h-11 px-5" onClick={() => retry()}>
            Try again
          </Button>
          <Link
            href="/"
            className={buttonVariants({ size: "lg", variant: "outline", className: "h-11 px-5" })}
          >
            Back to all products
          </Link>
        </div>
        {digest ? (
          <p className="text-muted-foreground font-mono text-xs">Reference: {digest}</p>
        ) : null}
      </div>
    </main>
  );
}
