import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from the reset email via /auth/callback, which signs the user in first. */
export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password">
      <Suspense>
        <SignedInForm />
      </Suspense>
    </AuthShell>
  );
}

async function SignedInForm() {
  await requireUser("/reset-password");
  return <ResetPasswordForm />;
}
