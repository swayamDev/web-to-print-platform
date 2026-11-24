import type { NextConfig } from "next";

// Data files the print engine reads from disk at runtime: our print fonts, plus pdf.js's
// standard fonts and character maps (for customer PDFs that do not embed their fonts).
const printRuntimeFiles = [
  "./public/fonts/**/*",
  "./node_modules/pdfjs-dist/standard_fonts/**/*",
  "./node_modules/pdfjs-dist/cmaps/**/*",
];

const nextConfig: NextConfig = {
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
