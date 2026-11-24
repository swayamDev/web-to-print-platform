"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { buttonVariants } from "@/components/ui/button";
import { resumeCheckoutAction } from "@/server/actions/checkout";

/**
 * After returning from Stripe, the payment is confirmed by the webhook, not by this page.
 * Refresh every 2 s (up to a minute) until the order shows as paid.
 */
export function PaymentConfirmationPoller() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 60_000) {
        clearInterval(timer);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, 2000);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <p
      role="status"
      className="bg-card rounded-lg border px-4 py-3 text-sm"
      data-testid="payment-pending"
    >
      {timedOut
        ? "We have not heard from the payment provider yet. If you completed payment, this page will update shortly; you will also get an email."
        : "Confirming your payment…"}
    </p>
  );
}

/** Reopen the Stripe payment page for an unpaid order. */
export function PayNowButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resumeCheckoutAction(orderId);
            if (result.ok) window.location.assign(result.url);
            else setError(result.message);
          })
        }
        className={buttonVariants({ size: "lg", className: "h-11 w-fit px-5" })}
      >
        {pending ? "Opening payment…" : "Pay now"}
      </button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
