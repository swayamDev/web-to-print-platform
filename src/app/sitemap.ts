import type { MetadataRoute } from "next";

import { getDivisions, getDivisionWithProducts } from "@/server/catalogue";
import { serverEnv } from "@/server/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { APP_URL } = serverEnv();
  const divisions = await getDivisions();
  const catalogue = await Promise.all(divisions.map(({ slug }) => getDivisionWithProducts(slug)));
  const paths = [
    "/",
    "/gallery",
    ...divisions.map(({ slug }) => `/d/${encodeURIComponent(slug)}`),
    ...catalogue.flatMap((division) =>
      (division?.products ?? []).map(({ slug }) => `/p/${encodeURIComponent(slug)}`),
    ),
  ];
  return paths.map((pathname) => ({ url: new URL(pathname, APP_URL).href }));
}
