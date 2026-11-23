import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/** Pages that need a signed-in user. Role checks happen on the server in each page. */
const PROTECTED_PREFIXES = ["/account", "/admin", "/reset-password"];

/** Auth pages a signed-in user has no reason to see. */
const GUEST_ONLY = ["/login", "/signup", "/forgot-password"];

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Runs before every page request (Next.js 16 "proxy", formerly middleware):
 * refreshes the session cookie and redirects for convenience. It is NOT the security
 * boundary: every protected page and action still calls requireUser / requireAdmin.
 */
export async function proxy(request: NextRequest) {
  const { response, userId, getRole } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    // Keep any refreshed session cookies.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  };

  if (!userId && matches(pathname, PROTECTED_PREFIXES)) {
    return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
  }

  // Signed-in non-admins get a genuine 404 for the admin area, so it does not reveal itself.
  // (Pages stream, so requireAdmin()'s notFound() alone cannot change the status code.)
  if (userId && matches(pathname, ["/admin"]) && (await getRole()) !== "admin") {
    const notFound = NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
    for (const cookie of response.cookies.getAll()) notFound.cookies.set(cookie);
    return notFound;
  }

  if (userId && matches(pathname, GUEST_ONLY)) {
    return redirectTo("/account");
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, image optimisation, icons and API routes
    // (API routes authenticate themselves).
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|otf)$).*)",
  ],
};
