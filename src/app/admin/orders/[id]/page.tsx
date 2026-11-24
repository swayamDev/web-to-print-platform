import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { GenerateFilesButton } from "@/components/admin/generate-files-button";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { orderStatusLabel } from "@/domain/order-status";
import { requireAdmin } from "@/server/auth";
import { signProofFiles } from "@/server/proofs";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const metadata: Metadata = { title: "Order (admin)" };

type Props = { params: Promise<{ id: string }> };

export default function AdminOrderPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminOrder {...props} />
    </Suspense>
  );
}

const sizeLabel = (bytes: number | null) =>
  bytes == null
    ? "—"
    : bytes > 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

async function AdminOrder({ params }: Props) {
  const { id } = await params;
  await requireAdmin(`/admin/orders/${id}`);
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createSupabaseServerClient(); // RLS: admins read everything below
  const { data: order } = await supabase
    .from("orders")
    .select(
      `id, order_number, status, currency, total_gross_minor, paid_at, approved_proof_id,
       files_unlocked_at, customer:profiles!orders_customer_id_fkey(full_name, company_name),
       order_items(description, quantity, product:products(name, output_dpi, mirror_output)),
       proof_versions!proof_versions_order_id_fkey(id, version, status, snapshot_hash, proof_png_path),
       proof_events(proof_version_id, action, ip, created_at),
       production_files(id, kind, storage_path, bytes, sha256, width_px, height_px, dpi, created_at)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();

  const item = order.order_items[0];
  const approved = order.proof_versions.find((v) => v.id === order.approved_proof_id);
  const approval = order.proof_events.find(
    (e) => e.action === "approved" && e.proof_version_id === order.approved_proof_id,
  );
  const signed = await signProofFiles(approved?.proof_png_path ? [approved.proof_png_path] : []);
  const proofImage = approved?.proof_png_path ? signed.get(approved.proof_png_path) : undefined;
  const files = [...order.production_files].sort((a, b) => a.kind.localeCompare(b.kind));
  const canGenerate =
    Boolean(approved) && (order.status === "proof" || order.status === "production");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <p className="spec-label text-muted-foreground">Order</p>
          <h1 className="num font-mono text-2xl font-semibold">{order.order_number}</h1>
          <p className="text-muted-foreground text-sm">
            {item?.description} · {order.customer?.full_name ?? "Customer"}
            {order.customer?.company_name ? `, ${order.customer.company_name}` : ""} ·{" "}
            {formatMinor(order.total_gross_minor, order.currency as CurrencyCode)}
          </p>
        </div>
        <span
          className="bg-signal text-ink rounded-full px-3 py-1 text-sm font-medium"
          data-testid="admin-order-status"
        >
          {orderStatusLabel(order.status, Boolean(order.approved_proof_id))}
        </span>
      </div>

      <section
        className="bg-card grid gap-4 rounded-xl border p-5"
        aria-labelledby="approved-heading"
      >
        <h2 id="approved-heading" className="text-base font-semibold">
          Approved proof
        </h2>
        {approved && approval ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_1fr]">
            {proofImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, short-lived signed proof image
              <img
                src={proofImage}
                alt={`Approved proof v${approved.version}`}
                className="w-full rounded border"
              />
            ) : null}
            <dl className="grid content-start gap-1.5 text-sm">
              <Row label="Version" value={`v${approved.version}`} />
              <Row label="Approved" value={new Date(approval.created_at).toLocaleString("en-GB")} />
              <Row label="From IP" value={approval.ip ? String(approval.ip) : "—"} />
              <Row label="Snapshot sha256" value={approved.snapshot_hash} mono />
              <Row
                label="Output"
                value={`${item?.product?.output_dpi ?? 300} DPI PNG + PDF${item?.product?.mirror_output ? ", mirrored" : ""}`}
              />
            </dl>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No approved proof yet. Print files stay locked until the customer approves one.
          </p>
        )}
        {canGenerate ? (
          <GenerateFilesButton orderId={order.id} regenerate={files.length > 0} />
        ) : null}
      </section>

      <section className="bg-card grid gap-3 rounded-xl border p-5" aria-labelledby="files-heading">
        <h2 id="files-heading" className="text-base font-semibold">
          Print files
        </h2>
        {files.length === 0 ? (
          <p className="text-muted-foreground text-sm">None yet.</p>
        ) : (
          <ul className="divide-y text-sm" data-testid="production-files">
            {files.map((file) => (
              <li
                key={file.id}
                className="grid gap-1 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="grid min-w-0">
                  <span className="font-mono break-all">{file.storage_path.split("/").pop()}</span>
                  <span className="text-muted-foreground text-xs">
                    {sizeLabel(file.bytes)}
                    {file.width_px ? ` · ${file.width_px} × ${file.height_px} px` : ""}
                    {file.dpi ? ` · ${file.dpi} DPI` : ""} · sha256 {file.sha256?.slice(0, 12)}…
                  </span>
                </span>
                <a
                  href={`/api/v1/admin/production-files/${file.id}`}
                  className="w-fit shrink-0 underline underline-offset-4"
                  data-testid={`download-${file.kind}`}
                >
                  Download {file.kind.toUpperCase()}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs break-all" : undefined}>{value}</dd>
    </div>
  );
}
