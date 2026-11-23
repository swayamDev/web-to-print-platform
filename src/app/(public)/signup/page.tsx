import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SignupForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Create account · Digital Heroes Print" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function SignupPage({ searchParams }: Props) {
  return (
    <Suspense>
      <SignupContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SignupContent({ searchParams }: Props) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <AuthShell
      title="Create your account"
      description="Save designs, approve proofs and reorder in one click."
      footer={
        <>
          Already have an account?{" "}
          <Link href={loginHref} className="text-foreground underline underline-offset-4">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm next={next} />
    </AuthShell>
  );
}
