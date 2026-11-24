"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { generateProductionFilesAction } from "@/server/actions/production";

/** Admin: render the print files from the approved proof (and start production). */
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
  return (
    <div className="grid gap-2">
      <Button
        size="lg"
        variant={regenerate ? "outline" : "default"}
        className="h-11 w-fit px-5"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const outcome = await generateProductionFilesAction(orderId);
            setResult(outcome);
            if (outcome.ok) router.refresh();
          })
        }
      >
        {pending
          ? "Rendering print files…"
          : regenerate
            ? "Regenerate print files"
            : "Generate print files and start production"}
      </Button>
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
