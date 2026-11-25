"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; exact?: boolean };

/** Horizontal sub-navigation for the account and admin areas; scrolls on small screens. */
export function SectionNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-4 min-w-0 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b text-sm">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                onFocus={(event) =>
                  event.currentTarget.scrollIntoView({
                    behavior: "instant",
                    block: "nearest",
                    inline: "nearest",
                  })
                }
                className={cn(
                  "inline-flex min-h-11 items-center border-b-2 px-3 py-2 whitespace-nowrap transition-colors focus-visible:-outline-offset-2",
                  active
                    ? "border-foreground text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
