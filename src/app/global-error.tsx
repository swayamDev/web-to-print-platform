"use client";

import "./globals.css";

/**
 * Last resort when the root layout itself fails: it replaces the whole document, so it brings
 * its own <html> and <body> and avoids anything that needs data.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="bg-mm-grid flex min-h-screen items-center">
        <main className="mx-auto grid w-full max-w-xl justify-items-start gap-5 px-4 py-24">
          <p className="spec-label text-muted-foreground">Digital Heroes Print</p>
          <h1 className="text-4xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground">
            The site could not be loaded. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            className="bg-signal text-ink h-11 rounded-lg px-5 text-sm font-medium"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
