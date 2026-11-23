"use client";

import { useEffect, useState } from "react";

import type { PriceQuote, PriceRequest } from "@/domain/pricing";

export type ServerCheck =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "confirmed" }
  | { state: "changed"; serverTotalMinor: number }
  | { state: "unavailable" };

/**
 * Confirm the instant in-browser price with the server (POST /api/v1/price) shortly after
 * the configuration stops changing. The server price is the one that will be charged; if
 * it differs (for example an admin changed a rate since the page loaded) the UI says so.
 */
export function useServerPrice(
  request: PriceRequest | null,
  localTotalMinor: number | null,
  delayMs = 350,
): ServerCheck {
  const key = request ? JSON.stringify(request) : null;
  const [result, setResult] = useState<{ key: string; check: ServerCheck } | null>(null);

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/v1/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: key,
          signal: controller.signal,
        });
        if (!response.ok) {
          setResult({ key, check: { state: "unavailable" } });
          return;
        }
        const { quote } = (await response.json()) as { quote: PriceQuote };
        setResult({
          key,
          check:
            quote.totalGrossMinor === localTotalMinor
              ? { state: "confirmed" }
              : { state: "changed", serverTotalMinor: quote.totalGrossMinor },
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResult({ key, check: { state: "unavailable" } });
        }
      }
    }, delayMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, localTotalMinor, delayMs]);

  if (!key) return { state: "idle" };
  // A result for an older configuration is stale: we are checking the new one.
  return result?.key === key ? result.check : { state: "checking" };
}
