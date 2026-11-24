"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useHydrated } from "@/lib/use-hydrated";
import { saveTemplateAction, saveXeroSettingsAction } from "@/server/actions/catalogue";

type Result = { ok: boolean; message: string } | null;

const input = "bg-background h-9 w-full min-w-0 rounded-md border px-2 text-sm";

function Message({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={result.ok ? "text-sm" : "text-destructive text-sm"}
      data-testid="save-result"
    >
      {result.message}
    </p>
  );
}

/** Edit a template's name, group, description, order and visibility. */
export function TemplateEditor({
  template,
}: {
  template: {
    id: string;
    name: string;
    groupName: string | null;
    description: string | null;
    sortOrder: number;
    isActive: boolean;
  };
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const [form, setForm] = useState({
    name: template.name,
    groupName: template.groupName ?? "",
    description: template.description ?? "",
    sortOrder: String(template.sortOrder),
    isActive: template.isActive,
  });
  const ids = { name: useId(), group: useId(), description: useId(), sort: useId() };

  return (
    <form
      className="grid gap-3"
      data-hydrated={hydrated || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setResult(null);
          const outcome = await saveTemplateAction({ templateId: template.id, ...form });
          setResult(outcome);
          if (outcome.ok) router.refresh();
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_6rem]">
        <div className="grid gap-1">
          <label htmlFor={ids.name} className="text-xs font-medium">
            Name
          </label>
          <input
            id={ids.name}
            className={input}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={ids.group} className="text-xs font-medium">
            Group
          </label>
          <input
            id={ids.group}
            className={input}
            value={form.groupName}
            placeholder="e.g. Running"
            onChange={(e) => setForm({ ...form, groupName: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={ids.sort} className="text-xs font-medium">
            Order
          </label>
          <input
            id={ids.sort}
            inputMode="numeric"
            className={input}
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          />
        </div>
      </div>
      <div className="grid gap-1">
        <label htmlFor={ids.description} className="text-xs font-medium">
          Description
        </label>
        <input
          id={ids.description}
          className={input}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="accent-ink size-4"
          />
          Shown to customers
        </label>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <Message result={result} />
    </form>
  );
}

/** Xero import settings used by the CSV export. */
export function XeroSettingsForm({
  initial,
}: {
  initial: { salesAccountCode: string; taxType: string; trackingName: string };
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const [form, setForm] = useState(initial);
  const ids = { account: useId(), tax: useId(), tracking: useId() };
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setResult(null);
          setResult(await saveXeroSettingsAction(form));
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <label htmlFor={ids.account} className="text-xs font-medium">
            Sales account code
          </label>
          <input
            id={ids.account}
            className={input}
            value={form.salesAccountCode}
            onChange={(e) => setForm({ ...form, salesAccountCode: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={ids.tax} className="text-xs font-medium">
            Tax rate name in Xero
          </label>
          <input
            id={ids.tax}
            className={input}
            value={form.taxType}
            onChange={(e) => setForm({ ...form, taxType: e.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor={ids.tracking} className="text-xs font-medium">
            Tracking category (divisions)
          </label>
          <input
            id={ids.tracking}
            className={input}
            value={form.trackingName}
            placeholder="Leave empty for none"
            onChange={(e) => setForm({ ...form, trackingName: e.target.value })}
          />
        </div>
      </div>
      <Button type="submit" size="sm" variant="outline" className="w-fit" disabled={pending}>
        {pending ? "Saving…" : "Save Xero settings"}
      </Button>
      <Message result={result} />
    </form>
  );
}
