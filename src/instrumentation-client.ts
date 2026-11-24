import { config } from "zod/v4/core";

/**
 * Runs in the browser before the app becomes interactive. Zod would otherwise probe whether
 * `new Function` works (to compile faster validators); our Content-Security-Policy forbids eval,
 * so the probe only produces CSP violation reports. jitless skips it; validation is identical.
 */
config({ jitless: true });
