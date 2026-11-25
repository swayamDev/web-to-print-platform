import type { NextConfig } from "next";

// Data files the print engine reads from disk at runtime: our print fonts, plus pdf.js's
// standard fonts and character maps (for customer PDFs that do not embed their fonts).
const printRuntimeFiles = [
  "./public/fonts/**/*",
  "./node_modules/pdfjs-dist/standard_fonts/**/*",
  "./node_modules/pdfjs-dist/cmaps/**/*",
];

/**
 * Security headers (Phase 17). The CSP allows only this site plus the Supabase project, which
 * the browser talks to for direct uploads and short-lived signed links to proofs and previews.
 * Scripts need 'unsafe-inline' because pages are prerendered and cached (no per-request nonce);
 * everything else is locked down: no plugins, no framing, forms post only to this site.
 */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^http/, "ws")}`.trim(),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Only when everything is served over HTTPS (a local build talks to http://127.0.0.1).
  ...(supabaseOrigin.startsWith("https:") ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source:
          "/:section(account|admin|design|login|signup|forgot-password|reset-password|auth)/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Native / Node-only print libraries: load them from node_modules at runtime instead of
  // bundling (resvg and @napi-rs/canvas ship platform-specific .node binaries).
  serverExternalPackages: [
    "@resvg/resvg-js",
    "@napi-rs/canvas",
    "pdfjs-dist",
    "pdf-lib",
    "@pdf-lib/fontkit",
    "opentype.js",
  ],
  // API routes render templates and print files; designer and account pages run server
  // actions that inspect uploads and render proofs.
  outputFileTracingIncludes: {
    "/api/**/*": printRuntimeFiles,
    "/design/**/*": printRuntimeFiles,
    "/account/**/*": printRuntimeFiles,
    "/admin/**/*": printRuntimeFiles,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
