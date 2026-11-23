import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/server/env";
import type { Database } from "@/types/db";

/**
 * Supabase client with the SECRET key. It bypasses Row Level Security.
 *
 * Use it only after the caller's identity and role have been checked (requireUser /
 * requireAdmin), and only for writes customers must not make directly: orders, payments,
 * proofs, production files, role changes.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SECRET_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}
