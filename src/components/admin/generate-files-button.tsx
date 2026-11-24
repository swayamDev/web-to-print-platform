"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { generateProductionFilesAction } from "@/server/actions/production";

/**
 * Admin: render the print files from the approved proof (and start production). Variable-data
 * orders render in batches of rows; this keeps calling the server until every row is done.
 */
export function GenerateFilesButton({
  orderId,
  regenerate,
}: {
  orderId: string;
  regenerate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);

  const run = () =>
    startTransition(async () => {
      setResult(null);
      let restart = regenerate;
      for (let call = 0; call < 200; call++) {
        const outcome = await generateProductionFilesAction({ orderId, restart });
        restart = false;
        if (!outcome.ok) {
          setResult(outcome);
          break;
        }
        setProgress(outcome.progress);
        if (outcome.done) {
          setResult(outcome);
          router.refresh();
          break;
        }
      }
    });

  return (
    <div className="grid gap-2">
      <Button
        size="lg"
        variant={regenerate ? "outline" : "default"}
        className="h-11 w-fit px-5"
        disabled={pending}
        onClick={run}
      >
        {pending
          ? "Rendering print files…"
          : regenerate
            ? "Regenerate print files"
            : "Generate print files and start production"}
      </Button>
      {pending && progress ? (
        <div className="grid max-w-sm gap-1" data-testid="production-progress">
          <progress
            className="accent-signal h-2 w-full"
            value={progress.processed}
            max={progress.total}
            aria-label="Rows rendered"
          />
          <p className="text-muted-foreground text-xs">
            {progress.processed} of {progress.total} rows rendered
          </p>
        </div>
      ) : null}
      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "text-sm" : "text-destructive text-sm"}
          data-testid="production-result"
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
