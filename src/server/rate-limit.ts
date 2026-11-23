import "server-only";

import { createSupabaseAdminClient } from "@/server/supabase/admin";

/**
 * Fixed-window rate limit backed by Postgres (public.check_rate_limit), so it works across
 * serverless instances without an extra service.
 *
 * Returns true when the call is allowed. If the limiter itself fails, it allows the call
 * (fail open) for read-only endpoints such as pricing; pass failOpen=false for endpoints
 * where abuse is costly.
 */
export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number,
  failOpen = true,
): Promise<boolean> {
  try {
    const { data, error } = await createSupabaseAdminClient().rpc("check_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    console.error("rate limiter unavailable", error);
    return failOpen;
  }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
