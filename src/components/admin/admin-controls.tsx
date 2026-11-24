"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { acceptAttribute } from "@/domain/uploads";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  adminCreateProofAction,
  adminOrderAction,
  adminProofUploadUrlAction,
  adminSetRoleAction,
} from "@/server/actions/admin";

type Result = { ok: boolean; message: string } | null;

function Message({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <p
      role={result.ok ? "status" : "alert"}
      className={result.ok ? "text-sm" : "text-destructive text-sm"}
      data-testid="admin-action-result"
    >
      {result.message}
    </p>
  );
}

/** Pipeline actions for one order: complete, cancel (with a reason), archive. */
export function OrderPipelineActions({
  orderId,
  status,
  archived,
}: {
  orderId: string;
  status: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const reasonId = useId();

  const run = (action: "complete" | "cancel" | "archive" | "unarchive", note?: string) =>
    startTransition(async () => {
      setResult(null);
      const outcome = await adminOrderAction({ orderId, action, note });
      setResult(outcome);
      if (outcome.ok) {
        setCancelling(false);
        setReason("");
        router.refresh();
      }
    });

  const canCancel = ["quote", "order", "artwork", "proof"].includes(status);
  const finished = status === "completed" || status === "cancelled";

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "production" ? (
          <Button disabled={pending} onClick={() => run("complete")}>
            Mark complete
          </Button>
        ) : null}
        {canCancel && !cancelling ? (
          <Button variant="outline" disabled={pending} onClick={() => setCancelling(true)}>
            Cancel order…
          </Button>
        ) : null}
        {finished ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(archived ? "unarchive" : "archive")}
          >
            {archived ? "Unarchive" : "Archive"}
          </Button>
        ) : null}
        {!canCancel && !finished && status !== "production" ? (
          <p className="text-muted-foreground text-sm">No actions at this stage.</p>
        ) : null}
      </div>
      {cancelling ? (
        <div className="grid gap-2 rounded-lg border border-dashed p-3">
          <label htmlFor={reasonId} className="text-sm font-medium">
            Reason (sent to the customer)
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            className="bg-background rounded-md border px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground text-xs">
            Refunds are made in the Stripe dashboard (DECISIONS D-16).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              disabled={pending || reason.trim().length < 3}
              onClick={() => run("cancel", reason)}
            >
              Cancel this order
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setCancelling(false)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
      <Message result={result} />
    </div>
  );
}

/** Upload corrected artwork as the next proof version (source admin_upload). */
export function AdminProofUpload({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result>(null);
  // Read from the input when submitted, so a file chosen before hydration still counts.
  const fileInput = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const fileId = useId();
  const noteId = useId();

  const submit = () =>
    startTransition(async () => {
      const file = fileInput.current?.files?.[0];
      if (!file) return setResult({ ok: false, message: "Choose the corrected file first." });
      setResult(null);
      const target = await adminProofUploadUrlAction({ orderId, filename: file.name });
      if (!target.ok) return setResult(target);
      const { error } = await createSupabaseBrowserClient()
        .storage.from("uploads")
        .uploadToSignedUrl(target.path, target.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (error) return setResult({ ok: false, message: "The upload failed. Please try again." });
      const outcome = await adminCreateProofAction({
        orderId,
        path: target.path,
        filename: file.name,
        note: note.trim() || undefined,
      });
      setResult(outcome);
      if (outcome.ok) {
        if (fileInput.current) fileInput.current.value = "";
        setNote("");
        router.refresh();
      }
    });

  return (
    <div className="grid gap-2" data-testid="admin-proof-upload">
      <label htmlFor={fileId} className="text-sm font-medium">
        Corrected artwork (PDF, AI, SVG, PNG or JPEG)
      </label>
      <input
        id={fileId}
        type="file"
        accept={acceptAttribute("artwork")}
        ref={fileInput}
        className="text-sm"
      />
      <label htmlFor={noteId} className="text-sm font-medium">
        Note for the audit log (optional)
      </label>
      <input
        id={noteId}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        className="bg-background rounded-md border px-3 py-2 text-sm"
      />
      <Button className="w-fit" disabled={pending} onClick={submit}>
        {pending ? "Creating proof…" : "Create proof from this file"}
      </Button>
      <Message result={result} />
    </div>
  );
}

/** Make a user an admin or a customer (audited; not your own role). */
export function RoleControl({ userId, role }: { userId: string; role: "customer" | "admin" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const next = role === "admin" ? "customer" : "admin";
  return (
    <div className="grid gap-2">
      <Button
        variant="outline"
        className="w-fit"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            if (!window.confirm(`Make this user ${next === "admin" ? "an admin" : "a customer"}?`))
              return;
            const outcome = await adminSetRoleAction({ userId, role: next });
            setResult(outcome);
            if (outcome.ok) router.refresh();
          })
        }
      >
        {next === "admin" ? "Make admin" : "Make customer"}
      </Button>
      <Message result={result} />
    </div>
  );
}
