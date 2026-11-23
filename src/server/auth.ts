import "server-only";

import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { createSupabaseServerClient } from "@/server/supabase/server";
import type { Database } from "@/types/db";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type SessionUser = {
  id: string;
  email: string;
  profile: Profile;
};

/**
 * The signed-in user and their profile, or null. Verified with the auth server
 * (getUser), not just read from the cookie. Cached for the duration of one request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Mark this as request-time work before the Supabase client reads the clock
  // (Cache Components refuses Date.now() during prerendering).
  await connection();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return null;

  return { id: user.id, email: user.email ?? "", profile };
});

/** Require a signed-in user; otherwise send them to login and back here afterwards. */
export async function requireUser(returnTo = "/account"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/**
 * Require an administrator. Signed-out visitors go to login; signed-in customers get a
 * 404 so the admin area does not reveal that it exists.
 *
 * Call this in EVERY admin page, server action and route handler. The proxy redirect
 * is only a convenience, not the security boundary.
 */
export async function requireAdmin(returnTo = "/admin"): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (user.profile.role !== "admin") notFound();
  return user;
}
