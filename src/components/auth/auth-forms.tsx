"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormField, FormMessage, SubmitButton } from "@/components/forms/form-parts";
import { PASSWORD_MIN_LENGTH } from "@/domain/auth";
import {
  forgotPasswordAction,
  loginAction,
  resetPasswordAction,
  signupAction,
  type FormState,
} from "@/server/actions/auth";

const initial: FormState = { status: "idle" };

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, initial);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage status={state.status} message={state.message} />
      <input type="hidden" name="next" value={next ?? ""} />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <div className="-mt-2 text-right text-sm">
        <Link
          href="/forgot-password"
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <SubmitButton pendingLabel="Logging in…">Log in</SubmitButton>
    </form>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signupAction, initial);
  if (state.status === "success") {
    return <FormMessage status="success" message={state.message} />;
  }
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage status={state.status} message={state.message} />
      <input type="hidden" name="next" value={next ?? ""} />
      <FormField
        label="Full name"
        name="fullName"
        autoComplete="name"
        required
        defaultValue={state.values?.fullName}
        error={state.fieldErrors?.fullName}
      />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={state.fieldErrors?.password}
      />
      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, initial);
  if (state.status === "success") {
    return <FormMessage status="success" message={state.message} />;
  }
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage status={state.status} message={state.message} />
      <FormField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(resetPasswordAction, initial);
  if (state.status === "success") {
    return (
      <div className="grid gap-4">
        <FormMessage status="success" message={state.message} />
        <Link href="/account" className="text-sm underline underline-offset-4">
          Go to your account
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4" noValidate>
      <FormMessage status={state.status} message={state.message} />
      <FormField
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={state.fieldErrors?.password}
      />
      <FormField
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pendingLabel="Saving…">Update password</SubmitButton>
    </form>
  );
}
