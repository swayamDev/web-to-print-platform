import { defineConfig } from "vitest/config";

// Unit and integration tests live next to the code as *.test.ts.
// Browser end-to-end tests live in /e2e and are run by Playwright, not Vitest.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["node_modules", ".next", "e2e"],
  },
});
