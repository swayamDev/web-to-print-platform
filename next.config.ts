import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native / Node-only print libraries: load them from node_modules at runtime instead of
  // bundling (resvg ships a platform-specific .node binary).
  serverExternalPackages: ["@resvg/resvg-js", "pdf-lib", "@pdf-lib/fontkit", "opentype.js"],
  // The print fonts are read from disk at runtime; make sure they ship with the API functions.
  outputFileTracingIncludes: {
    "/api/**/*": ["./public/fonts/**/*"],
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
