import type { MetadataRoute } from "next";

import { serverEnv } from "@/server/env";

export default function robots(): MetadataRoute.Robots {
  // Keep noindex pages crawlable so crawlers can see their indexing directives.
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", serverEnv().APP_URL).href,
  };
}
