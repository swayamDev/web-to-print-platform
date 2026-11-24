import "server-only";

import { headers } from "next/headers";
import { z } from "zod";

/** Where a request came from, for approval logs (PRD p6 §08): client IP and browser. */
export async function requestOrigin(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = z.union([z.ipv4(), z.ipv6()]).safeParse(forwarded ?? h.get("x-real-ip"));
  return {
    ip: ip.success ? ip.data : null,
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  };
}
