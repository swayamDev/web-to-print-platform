import { NextResponse, type NextRequest } from "next/server";

import { safeRedirectPath } from "@/domain/auth";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * Landing point for links in auth emails (password reset, email confirmation).
 * Exchanges the one-time code for a session, then continues to a safe internal path.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), "/account");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/login?error=link", origin));
}
