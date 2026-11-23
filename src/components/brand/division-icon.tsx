import {
  Bike,
  Layers,
  Scissors,
  Stamp,
  Sticker,
  Ticket,
  Trophy,
  type LucideIcon,
} from "lucide-react";

/** Icon per division slug. Unknown (admin-added) divisions fall back to a generic icon. */
const ICONS: Record<string, LucideIcon> = {
  "labels-stickers": Sticker,
  "race-event-numbers": Ticket,
  "mtb-boards": Bike,
  stamps: Stamp,
  trophies: Trophy,
  "laser-cut": Scissors,
};

export function DivisionIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = ICONS[slug] ?? Layers;
  return <Icon aria-hidden="true" className={className} strokeWidth={1.6} />;
}
