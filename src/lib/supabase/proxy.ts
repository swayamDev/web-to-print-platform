import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/db";

/**
 * Refresh the Supabase session cookie on every request and report who is signed in.
 *
 * The returned response carries any refreshed cookies; callers must return it (or copy
 * its cookies onto a redirect) or the user is logged out unexpectedly.
 */
export async function updateSession(request: NextRequest) {
  const env = publicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not put code between client creation and getUser(): it is what refreshes the token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /** Looks up the signed-in user's role (RLS lets users read their own profile). */
  const getRole = async () => {
    if (!user) return null;
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    return data?.role ?? null;
  };

  return { response, userId: user?.id ?? null, getRole };
}
