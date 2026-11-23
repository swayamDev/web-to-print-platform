"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/db";

/**
 * Supabase client for Client Components. Uses the publishable key and the signed-in
 * user's session cookie, so every query is limited by Row Level Security.
 */
export function createSupabaseBrowserClient() {
  const env = publicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
