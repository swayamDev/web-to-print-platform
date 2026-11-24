import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { PayNowButton, PaymentConfirmationPoller } from "@/components/account/order-actions";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/domain/order-status";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Order" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The PRD pipeline (p8 §11), as shown to the customer. */
const PIPELINE: { status: OrderStatus; label: string }[] = [
  { status: "quote", label: "Quote" },
  { status: "order", label: "Paid" },
  { status: "artwork", label: "Artwork" },
  { status: "proof", label: "Proof" },
  { status: "production", label: "Production" },
  { status: "completed", label: "Completed" },
];

export default function OrderPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OrderDetail {...props} />
    </Suspense>
  );
}

async function OrderDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  await requireUser(`/account/orders/${id}`);
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createSupabaseServerClient();
  // RLS returns nothing for other customers' orders, so they get a 404.
  const { data: order } = await supabase
    .from("orders")
    .select(
      `id, order_number, status, currency, subtotal_net_minor, discount_minor, tax_rate, tax_minor,
       total_gross_minor, paid_at, invoice_number, created_at, pricing_snapshot,
       order_items(description, quantity, design_id),
       order_status_history(to_status, note, created_at)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();

  const currency = order.currency as CurrencyCode;
  const money = (minor: number) => formatMinor(minor, currency);
  const item = order.order_items[0];
  const reached = new Map(order.order_status_history.map((h) => [h.to_status, h.created_at]));
  const currentIndex = PIPELINE.findIndex((p) => p.status === order.status);
  const quote = (
    order.pricing_snapshot as {
      quote?: { tier?: { percentOff: string } | null; setupFeeMinor?: number };
    }
  ).quote;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="spec-label text-muted-foreground">Order</p>
          <h1 className="num font-mono text-2xl font-semibold" data-testid="order-number">
            {order.order_number}
          </h1>
          <p className="text-muted-foreground text-sm">{item?.description}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-sm font-medium",
            order.status === "quote"
              ? "bg-muted"
              : order.status === "cancelled"
                ? "bg-destructive/10 text-destructive"
                : "bg-signal text-ink",
          )}
          data-testid="order-status"
        >
          {ORDER_STATUS_LABELS[order.status]}
        </span>
      </div>

      {order.status === "quote" ? (
        query.checkout === "success" ? (
          <PaymentConfirmationPoller />
        ) : (
          <div className="bg-card grid gap-3 rounded-xl border p-5">
            <p className="text-sm">
              This order is waiting for payment. Nothing is printed until it is paid and you approve
              a proof.
            </p>
            <PayNowButton orderId={order.id} />
          </div>
        )
      ) : null}

      {order.status === "artwork" ? (
        <p className="bg-card rounded-lg border px-4 py-3 text-sm">
          Payment received. We are preparing a proof of your artwork; you will be emailed when it is
          ready to approve.
        </p>
      ) : null}

      {/* Pipeline ------------------------------------------------------------- */}
      {order.status !== "cancelled" ? (
        <ol
          className="grid gap-2 sm:grid-cols-6"
          aria-label="Order progress"
          data-testid="order-timeline"
        >
          {PIPELINE.map((stage, index) => {
            const done = index < currentIndex;
            const current = index === currentIndex;
            const at = reached.get(stage.status);
            return (
              <li
                key={stage.status}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "rounded-lg border p-3",
                  current
                    ? "border-ink bg-ink text-paper"
                    : done
                      ? "bg-card"
                      : "text-muted-foreground border-dashed",
                )}
              >
                <p className="spec-label">{String(index + 1).padStart(2, "0")}</p>
                <p className="font-medium">{stage.label}</p>
                {at && (done || current) ? (
                  <p className={cn("text-xs", current ? "text-paper/70" : "text-muted-foreground")}>
                    {new Date(at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          className="bg-card grid content-start gap-2 rounded-xl border p-5 text-sm"
          aria-labelledby="summary-heading"
        >
          <h2 id="summary-heading" className="text-base font-semibold">
            Summary
          </h2>
          <dl className="grid gap-1.5">
            <Row label="Quantity" value={item?.quantity.toLocaleString("en-GB") ?? "—"} />
            {order.discount_minor > 0 ? (
              <Row
                label={`Volume discount${quote?.tier ? ` (${formatPercent(quote.tier.percentOff)})` : ""}`}
                value={`−${money(order.discount_minor)}`}
              />
            ) : null}
            {quote?.setupFeeMinor ? <Row label="Setup" value={money(quote.setupFeeMinor)} /> : null}
            <Row label="Subtotal (excl. tax)" value={money(order.subtotal_net_minor)} />
            <Row
              label={`VAT (${formatPercent(String(Number(order.tax_rate) * 100))})`}
              value={money(order.tax_minor)}
            />
            <Row label="Total" value={money(order.total_gross_minor)} strong />
          </dl>
        </section>
        <section
          className="bg-card grid content-start gap-2 rounded-xl border p-5 text-sm"
          aria-labelledby="details-heading"
        >
          <h2 id="details-heading" className="text-base font-semibold">
            Details
          </h2>
          <dl className="grid gap-1.5">
            <Row label="Ordered" value={new Date(order.created_at).toLocaleDateString("en-GB")} />
            <Row
              label="Paid"
              value={order.paid_at ? new Date(order.paid_at).toLocaleString("en-GB") : "Not yet"}
            />
            <Row label="Invoice" value={order.invoice_number ?? "Issued on payment"} />
          </dl>
          {item?.design_id ? (
            <Link href={`/design/${item.design_id}`} className="w-fit underline underline-offset-4">
              Open the saved design
            </Link>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", strong && "mt-1 border-t pt-2 font-semibold")}>
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="num font-mono">{value}</dd>
    </div>
  );
}
