import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/db";

/**
 * Cookie-less Supabase client for public catalogue data (the `anon` role under RLS).
 * Because it never reads the request, its results can be cached and prerendered.
 */
export function createSupabasePublicClient() {
  const env = publicEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
