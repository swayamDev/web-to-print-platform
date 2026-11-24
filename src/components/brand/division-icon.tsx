import { Layers } from "lucide-react";

const PATHS: Record<string, string> = {
  "labels-stickers": "M5 11 13 3h11v12l-9 10L5 16z M18 8h2",
  "race-event-numbers": "M4 5h24v22H4z M9 10h2m10 0h2M10 21l5-8h-5",
  "mtb-boards": "M3 10q0-4 4-4h18q4 0 4 4v11H3z M8 11h2m5 0h2m5 0h2",
  stamps: "M8 20h16v7H8z M11 20l2-7c-7-9 13-9 6 0l2 7",
  trophies: "M7 14h18v12H7z M8 14V9h16v5 M11 20h10",
  "laser-cut": "M4 25V7h24v18z M10 10v12m5-12v12m5-12v12",
};

export function DivisionIcon({ slug, className }: { slug: string; className?: string }) {
  const path = PATHS[slug];
  if (!path) return <Layers aria-hidden="true" className={className} strokeWidth={1.6} />;

  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}
