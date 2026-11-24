import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { XeroSettingsForm } from "@/components/admin/catalogue-controls";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { formatMinor, type CurrencyCode } from "@/domain/money";
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/domain/order-status";
import { PERIOD_PRESETS, reportPeriod, type Breakdown } from "@/domain/reports";
import { cn } from "@/lib/utils";
import { requireAdmin } from "@/server/auth";
import { loadReport, loadXeroSettings } from "@/server/catalogue-admin";

export const metadata: Metadata = { title: "Reports (admin)" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Sales and pipeline reports, plus the Xero export (PRD p4 §03, p9 §14). */
export default function AdminReportsPage(props: Props) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminReports {...props} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const percent = (share: number) => `${Math.round(share * 100)}%`;

async function AdminReports({ searchParams }: Props) {
  await requireAdmin("/admin/reports");
  const raw = await searchParams;
  const period = reportPeriod(
    { period: one(raw.period), from: one(raw.from), to: one(raw.to) },
    new Date(),
  );
  const [{ report, currency, truncated }, xero] = await Promise.all([
    loadReport(period),
    loadXeroSettings(),
  ]);
  const money = (minor: number) => formatMinor(minor, currency as CurrencyCode);
  const lastDay = new Date(Date.parse(`${period.to}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const exportHref = `/api/v1/admin/exports/xero?from=${period.from}&to=${lastDay}`;
  const peak = Math.max(1, ...report.daily.map((d) => d.grossMinor));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-muted-foreground text-sm" data-testid="report-period">
            {period.label} · {period.from} to {lastDay} (UTC)
          </p>
        </div>
        <a
          href={exportHref}
          className="bg-ink text-paper inline-flex h-10 items-center rounded-md px-4 text-sm"
          data-testid="xero-export"
        >
          Export invoices for Xero (CSV)
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Period" className="flex flex-wrap gap-2">
          {PERIOD_PRESETS.map((p) => (
            <Link
              key={p.key}
              href={`/admin/reports?period=${p.key}`}
              aria-current={period.key === p.key ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                period.key === p.key ? "border-ink bg-ink text-paper" : "hover:border-ink",
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <form action="/admin/reports" className="flex flex-wrap items-center gap-2 text-sm">
          <label className="sr-only" htmlFor="report-from">
            From
          </label>
          <input
            id="report-from"
            type="date"
            name="from"
            defaultValue={period.from}
            className="bg-background h-8 rounded-md border px-2"
          />
          <span aria-hidden="true">–</span>
          <label className="sr-only" htmlFor="report-to">
            To
          </label>
          <input
            id="report-to"
            type="date"
            name="to"
            defaultValue={lastDay}
            className="bg-background h-8 rounded-md border px-2"
          />
          <button type="submit" className="h-8 rounded-md border px-3">
            Show
          </button>
        </form>
      </div>

      {truncated ? (
        <p role="alert" className="text-destructive text-sm">
          This period has more than 5,000 orders; choose a shorter period for exact figures.
        </p>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="report-totals">
        <Stat label="Sales incl. tax" value={money(report.grossMinor)} />
        <Stat label="Paid orders" value={String(report.paidOrders)} />
        <Stat label="Average order" value={money(report.averageOrderMinor)} />
        <Stat label="Items printed" value={report.itemsPrinted.toLocaleString("en-GB")} />
        <Stat label="Net sales" value={money(report.netMinor)} />
        <Stat label="Tax collected" value={money(report.taxMinor)} />
        <Stat label="Reorders" value={percent(report.reorderShare)} />
        <Stat label="Personalised (CSV)" value={percent(report.variableDataShare)} />
      </ul>
      {report.cancelledPaid.orders > 0 ? (
        <p className="text-muted-foreground text-sm">
          Not included: {report.cancelledPaid.orders} paid order
          {report.cancelledPaid.orders === 1 ? "" : "s"} cancelled afterwards (
          {money(report.cancelledPaid.grossMinor)}), to be refunded in Stripe.
        </p>
      ) : null}

      <section className="bg-card grid gap-3 rounded-xl border p-5" aria-labelledby="daily-heading">
        <h2 id="daily-heading" className="text-base font-semibold">
          Daily sales
        </h2>
        <div
          className="flex h-40 items-end gap-px"
          role="img"
          aria-label={`Daily sales: ${report.daily.filter((d) => d.orders > 0).length} days with orders`}
        >
          {report.daily.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${money(d.grossMinor)} (${d.orders} orders)`}
              className={cn(
                "min-w-0 flex-1 rounded-t-sm",
                d.grossMinor > 0 ? "bg-signal" : "bg-muted",
              )}
              style={{ height: `${Math.max(2, (d.grossMinor / peak) * 100)}%` }}
            />
          ))}
        </div>
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>{period.from}</span>
          <span>{lastDay}</span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownTable
          title="By division"
          rows={report.byDivision}
          money={money}
          testId="by-division"
        />
        <BreakdownTable
          title="By product"
          rows={report.byProduct}
          money={money}
          testId="by-product"
        />
      </div>

      <section className="bg-card grid gap-3 rounded-xl border p-5" aria-labelledby="stage-heading">
        <h2 id="stage-heading" className="text-base font-semibold">
          Orders placed in this period, by current stage
        </h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" data-testid="by-stage">
          {ORDER_STATUSES.map((status) => (
            <li key={status} className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">{ORDER_STATUS_LABELS[status]}</p>
              <p className="text-xl font-semibold tabular-nums">{report.byStatus[status] ?? 0}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-card grid gap-3 rounded-xl border p-5" aria-labelledby="xero-heading">
        <h2 id="xero-heading" className="text-base font-semibold">
          Xero export
        </h2>
        <p className="text-muted-foreground text-sm">
          One row per invoice line for every invoice issued in this period, in Xero&rsquo;s
          sales-invoice import layout. In Xero choose Business › Invoices › Import, and &ldquo;Tax
          exclusive&rdquo; amounts. Payments are taken by Stripe; reconcile them from the Stripe
          feed.
        </p>
        <XeroSettingsForm initial={xero} />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <li className="bg-card rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="num font-mono text-xl font-semibold">{value}</p>
    </li>
  );
}

function BreakdownTable({
  title,
  rows,
  money,
  testId,
}: {
  title: string;
  rows: Breakdown[];
  money: (minor: number) => string;
  testId: string;
}) {
  return (
    <section className="bg-card grid content-start gap-3 rounded-xl border p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No sales in this period.</p>
      ) : (
        <table className="w-full text-sm" data-testid={testId}>
          <thead>
            <tr className="text-muted-foreground text-left text-xs">
              <th className="py-1 font-medium">Name</th>
              <th className="py-1 text-right font-medium">Orders</th>
              <th className="py-1 text-right font-medium">Sales</th>
              <th className="py-1 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t">
                <td className="py-2 pr-2">{r.name}</td>
                <td className="py-2 text-right tabular-nums">{r.orders}</td>
                <td className="num py-2 text-right font-mono">{money(r.grossMinor)}</td>
                <td className="py-2 text-right tabular-nums">{percent(r.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
