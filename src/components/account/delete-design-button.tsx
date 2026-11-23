"use client";

import { useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui/button";
import { deleteDesignAction } from "@/server/actions/designs";

/** Two-step delete so a design is never removed by a single accidental tap. */
export function DeleteDesignButton({ designId, name }: { designId: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={buttonVariants({ variant: "ghost" })}
      >
        Delete
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        aria-label={`Confirm delete ${name}`}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteDesignAction(designId);
            if (!result.ok) setFailed(true);
          })
        }
        className={buttonVariants({ variant: "destructive" })}
      >
        {pending ? "Deleting…" : "Confirm delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className={buttonVariants({ variant: "ghost" })}
      >
        Cancel
      </button>
      {failed ? <span className="text-destructive text-xs">Could not delete.</span> : null}
    </div>
  );
}
