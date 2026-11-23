import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoginForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";
import { FormMessage } from "@/components/forms/form-parts";

export const metadata: Metadata = { title: "Log in" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function LoginPage({ searchParams }: Props) {
  return (
    <Suspense>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({ searchParams }: Props) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  return (
    <AuthShell
      title="Log in"
      description="Track orders, approve proofs and reorder saved designs."
      footer={
        <>
          New here?{" "}
          <Link href={signupHref} className="text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      {params.error === "link" ? (
        <FormMessage
          status="error"
          message="That link has expired or was already used. Please request a new one."
        />
      ) : null}
      <LoginForm next={next} />
    </AuthShell>
  );
}
