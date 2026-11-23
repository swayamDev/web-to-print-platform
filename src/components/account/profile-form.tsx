"use client";

import { useActionState } from "react";

import { FormField, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { updateProfileAction, type FormState } from "@/server/actions/auth";

type Values = { fullName: string; companyName: string; phone: string };

export function ProfileForm({ initial }: { initial: Values }) {
  const [state, action] = useActionState<FormState, FormData>(updateProfileAction, {
    status: "idle",
    values: initial,
  });
  const values = state.values ?? initial;

  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage status={state.status} message={state.message} />
      <FormField
        label="Full name"
        name="fullName"
        autoComplete="name"
        defaultValue={values.fullName}
        error={state.fieldErrors?.fullName}
      />
      <FormField
        label="Company (optional)"
        name="companyName"
        autoComplete="organization"
        defaultValue={values.companyName}
        error={state.fieldErrors?.companyName}
      />
      <FormField
        label="Phone (optional)"
        name="phone"
        type="tel"
        autoComplete="tel"
        defaultValue={values.phone}
        error={state.fieldErrors?.phone}
      />
      <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
    </form>
  );
}
