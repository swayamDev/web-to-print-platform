import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import { z } from "zod";

import { PayNowButton, PaymentConfirmationPoller } from "@/components/account/order-actions";
import {
  ProofDecision,
  ProofPreparingPoller,
  SubmitRevisionButton,
} from "@/components/account/proof-review";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { orderStatusLabel, type OrderStatus } from "@/domain/order-status";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { ensureFirstProof, isStalled, signProofFiles } from "@/server/proofs";
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
       total_gross_minor, paid_at, invoice_number, created_at, pricing_snapshot, approved_proof_id,
       order_items(description, quantity, design_id),
       order_status_history(to_status, note, created_at),
       proof_versions!proof_versions_order_id_fkey(id, version, status, snapshot_hash, proof_pdf_path, proof_png_path, created_at),
       proof_events(id, proof_version_id, action, comment, created_at)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();

  // Proofs: RLS has already limited the rows to this customer's order, so its files may be signed.
  const versions = [...order.proof_versions].sort((a, b) => b.version - a.version);
  const latest = versions[0];
  const signed = await signProofFiles(
    versions.flatMap((v) => [v.proof_png_path ?? "", v.proof_pdf_path ?? ""]),
  );
  const events = [...order.proof_events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastChangeRequest = events.findLast((e) => e.action === "changes_requested");
  const approval = events.find((e) => e.action === "approved");
  const approved = Boolean(order.approved_proof_id);
  const awaitingFirstProof = order.status === "artwork" && versions.length === 0;
  // Self-healing: if proof v1 did not appear after payment (e.g. a failed background job),
  // try again after this response. Duplicate attempts are refused by the database.
  if (awaitingFirstProof && order.paid_at && isStalled(order.paid_at)) {
    after(() => ensureFirstProof(order.id));
  }
  const pngUrl = latest?.proof_png_path ? signed.get(latest.proof_png_path) : undefined;
  const pdfUrl = latest?.proof_pdf_path ? signed.get(latest.proof_pdf_path) : undefined;

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
          {orderStatusLabel(order.status, approved)}
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

      {awaitingFirstProof ? <ProofPreparingPoller /> : null}

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

      {/* Proof ---------------------------------------------------------------- */}
      {latest ? (
        <section
          id="proof"
          className="bg-card grid scroll-mt-24 gap-4 rounded-xl border p-5"
          aria-labelledby="proof-heading"
          data-testid="proof-section"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="proof-heading" className="text-base font-semibold">
              Proof v{latest.version}
            </h2>
            <span className="text-muted-foreground text-sm" data-testid="proof-status">
              {PROOF_STATUS_LABELS[latest.status]}
            </span>
          </div>

          {pngUrl ? (
            <a
              href={pngUrl}
              target="_blank"
              rel="noreferrer"
              className="bg-muted grid place-items-center rounded-lg p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed proof image */}
              <img
                src={pngUrl}
                alt={`Proof version ${latest.version} with trim and safe-area guides`}
                className="h-auto max-h-[70vh] w-full max-w-lg object-contain shadow-sm"
                data-testid="proof-image"
              />
            </a>
          ) : null}
          <p className="text-muted-foreground text-xs">
            The black line is the trim edge; anything beyond it is bleed and is cut off. Keep text
            inside the orange dashed safe area. Guides and the PROOF watermark are not printed.{" "}
            {pdfUrl ? (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="text-foreground underline underline-offset-4"
                data-testid="proof-pdf"
              >
                Download the print-ready PDF
              </a>
            ) : null}
          </p>

          {order.status === "proof" && !approved && latest.status === "pending" ? (
            <ProofDecision orderId={order.id} versionId={latest.id} version={latest.version} />
          ) : null}

          {approved && approval ? (
            <p
              role="status"
              className="border-ink rounded-lg border-2 px-4 py-3 text-sm"
              data-testid="proof-approved"
            >
              You approved proof v{versions.find((v) => v.id === order.approved_proof_id)?.version}{" "}
              on {new Date(approval.created_at).toLocaleString("en-GB")}. It will be printed exactly
              as approved, and the design is now locked.
            </p>
          ) : null}

          {order.status === "artwork" && latest.status === "changes_requested" ? (
            <div className="grid gap-3 rounded-lg border border-dashed p-4 text-sm">
              <p>
                You asked for changes
                {lastChangeRequest?.comment ? (
                  <>
                    : <q className="italic">{lastChangeRequest.comment}</q>
                  </>
                ) : null}
              </p>
              <p className="text-muted-foreground">
                Open your design, make the changes and save it, then create the next proof here. The
                size, material and quantity must stay as ordered.
              </p>
              {item?.design_id ? (
                <Link
                  href={`/design/${item.design_id}`}
                  className="w-fit underline underline-offset-4"
                >
                  Edit the design
                </Link>
              ) : null}
              <SubmitRevisionButton orderId={order.id} nextVersion={latest.version + 1} />
            </div>
          ) : null}

          {versions.length > 1 || events.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Proof history</summary>
              <ol className="mt-2 grid gap-2" data-testid="proof-history">
                {versions.map((v) => (
                  <li key={v.id} className="grid gap-0.5 border-l-2 pl-3">
                    <span>
                      v{v.version} · {PROOF_STATUS_LABELS[v.status]} ·{" "}
                      {new Date(v.created_at).toLocaleString("en-GB")}
                    </span>
                    {events
                      .filter((e) => e.proof_version_id === v.id)
                      .map((e) => (
                        <span key={e.id} className="text-muted-foreground">
                          {e.action === "changes_requested" ? "Changes requested" : "Approved"} on{" "}
                          {new Date(e.created_at).toLocaleString("en-GB")}
                          {e.comment ? `: “${e.comment}”` : ""}
                        </span>
                      ))}
                    <span className="text-muted-foreground font-mono text-xs break-all">
                      sha256 {v.snapshot_hash.slice(0, 16)}…
                    </span>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </section>
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

const PROOF_STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for your approval",
  approved: "Approved",
  changes_requested: "Changes requested",
  superseded: "Replaced by a newer version",
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", strong && "mt-1 border-t pt-2 font-semibold")}>
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="num font-mono">{value}</dd>
    </div>
  );
}
