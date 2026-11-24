"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  approveProofAction,
  requestProofChangesAction,
  submitRevisionAction,
  type ProofActionResult,
} from "@/server/actions/proofs";

type ProofRef = { orderId: string; versionId: string; version: number };

/**
 * Approve the latest proof or ask for changes (PRD p6 §08). Approval needs an explicit
 * confirmation; a change request needs a comment. If another tab already acted, the server
 * refuses with "proof_outdated" and the page refreshes to the current state.
 */
export function ProofDecision(proof: ProofRef) {
  const router = useRouter();
  const ids = useId();
  const [confirmed, setConfirmed] = useState(false);
  const [mode, setMode] = useState<"approve" | "changes">("approve");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ProofActionResult>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(result.message);
        if (result.code === "proof_outdated" || result.code === "order_not_in_proof") {
          router.refresh();
        }
        return;
      }
      router.refresh();
    });

  return (
    <div className="grid gap-4" data-testid="proof-decision">
      {mode === "approve" ? (
        <>
          <label htmlFor={`${ids}-ok`} className="flex items-start gap-3 text-sm">
            <input
              id={`${ids}-ok`}
              type="checkbox"
              className="accent-ink mt-0.5 size-4"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I have checked proof v{proof.version}: spelling, numbers, colours and position. Print
              it exactly as shown (guides and the PROOF watermark are not printed).
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              className="h-11 px-5"
              disabled={!confirmed || pending}
              onClick={() => run(() => approveProofAction(proof))}
            >
              {pending ? "Approving…" : `Approve proof v${proof.version}`}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 px-5"
              disabled={pending}
              onClick={() => {
                setMode("changes");
                setError(null);
              }}
            >
              Request changes
            </Button>
          </div>
        </>
      ) : (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!comment.trim()) {
              setError("Tell us what to change.");
              return;
            }
            run(() => requestProofChangesAction({ ...proof, comment }));
          }}
        >
          <label htmlFor={`${ids}-comment`} className="text-sm font-medium">
            What should change?
          </label>
          <textarea
            id={`${ids}-comment`}
            className="border-input bg-background focus-visible:ring-ring/50 min-h-24 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-3"
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="lg" className="h-11 px-5" disabled={pending}>
              {pending ? "Sending…" : "Send change request"}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="ghost"
              className="h-11 px-5"
              disabled={pending}
              onClick={() => {
                setMode("approve");
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** After a change request: make the next proof from the customer's latest saved design. */
export function SubmitRevisionButton({
  orderId,
  nextVersion,
}: {
  orderId: string;
  nextVersion: number;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-2">
      <Button
        size="lg"
        className="h-11 w-fit px-5"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await submitRevisionAction(orderId);
            if (result.ok) router.refresh();
            else setError(result.message);
          })
        }
      >
        {pending ? "Preparing proof…" : `Create proof v${nextVersion} from my saved design`}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** While proof v1 renders in the background, refresh every 3 s (up to 2 minutes). */
export function ProofPreparingPoller() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 120_000) {
        clearInterval(timer);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [router]);
  return (
    <p
      role="status"
      className="bg-card rounded-lg border px-4 py-3 text-sm"
      data-testid="proof-preparing"
    >
      {timedOut
        ? "Your proof is taking longer than usual. We will email you as soon as it is ready."
        : "Payment received. We are preparing a proof of your artwork…"}
    </p>
  );
}
