"use client";

import { useEffect, useState } from "react";

import { FONT_IDS, loadFont, type LoadedFont } from "@/lib/print/fonts";

let cache: Promise<Map<string, LoadedFont>> | null = null;

/**
 * Load the print fonts in the browser from /fonts: the same TTF files the server renders
 * with, so the canvas measures and draws text exactly like the proof and print files.
 */
export function usePrintFonts() {
  const [fonts, setFonts] = useState<Map<string, LoadedFont> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cache ??= Promise.all(
      FONT_IDS.map(async (id) => {
        const response = await fetch(`/fonts/${id}.ttf`);
        if (!response.ok) throw new Error(`Font ${id} failed to load`);
        return [id, loadFont(id, new Uint8Array(await response.arrayBuffer()))] as const;
      }),
    ).then((entries) => new Map(entries));

    let active = true;
    cache.then(
      (loaded) => active && setFonts(loaded),
      (e: Error) => {
        cache = null;
        if (active) setError(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return { fonts, error };
}
