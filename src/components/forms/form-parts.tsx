"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldProps = React.ComponentProps<"input"> & {
  label: string;
  name: string;
  error?: string;
  hint?: string;
};

/** Labelled input with an accessible error message. */
export function FormField({ label, name, error, hint, id, ...inputProps }: FieldProps) {
  const inputId = id ?? name;
  const describedBy = [error ? `${inputId}-error` : null, hint ? `${inputId}-hint` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="h-10"
        {...inputProps}
      />
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level success or error banner, announced to screen readers. */
export function FormMessage({
  status,
  message,
}: {
  status: "idle" | "error" | "success";
  message?: string;
}) {
  if (!message || status === "idle") return null;
  const tone =
    status === "error"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-emerald-600/30 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300";
  return (
    <p
      role={status === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${tone}`}
    >
      {message}
    </p>
  );
}

/** Submit button that disables itself and shows progress while the action runs. */
export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: React.ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      className="h-10 w-full"
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
