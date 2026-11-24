"use client";

import { ChevronDown, Menu } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";

export function ProductDisclosure({ children }: { children: ReactNode }) {
  const summary = useRef<HTMLElement>(null);

  return (
    <details
      className="group md:relative"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !event.currentTarget.open) return;
        event.currentTarget.open = false;
        summary.current?.focus();
      }}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a")) {
          event.currentTarget.open = false;
        }
      }}
    >
      <summary
        ref={summary}
        className={buttonVariants({
          variant: "ghost",
          className: "cursor-pointer list-none max-md:min-h-10 max-md:px-2 [&::-webkit-details-marker]:hidden",
        })}
      >
        <Menu className="size-5 md:hidden" aria-hidden="true" />
        <span className="max-md:sr-only">Products</span>
        <ChevronDown
          className="hidden size-4 transition-transform group-open:rotate-180 md:block"
          aria-hidden="true"
        />
      </summary>
      <div className="bg-popover border-ink/15 absolute inset-x-4 top-full mt-1 max-h-[calc(100dvh-4rem)] overflow-auto rounded-lg border p-2 shadow-lg md:right-auto md:left-0 md:w-64">
        {children}
      </div>
    </details>
  );
}
