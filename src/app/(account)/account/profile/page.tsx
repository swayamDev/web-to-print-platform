import { Suspense } from "react";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import type { Metadata } from "next";

import { ProfileForm } from "@/components/account/profile-form";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Profile · Digital Heroes Print" };

export default function ProfilePage() {
  // Data is read at request time, so it streams in behind a placeholder (Cache Components).
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProfileContent />
    </Suspense>
  );
}

async function ProfileContent() {
  const user = await requireUser("/account/profile");
  const { full_name, company_name, phone } = user.profile;

  return (
    <div className="grid max-w-md gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted-foreground text-sm">Signed in as {user.email}</p>
      </div>
      <ProfileForm
        initial={{
          fullName: full_name ?? "",
          companyName: company_name ?? "",
          phone: phone ?? "",
        }}
      />
    </div>
  );
}
