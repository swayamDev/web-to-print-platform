import Link from "next/link";

/** Registration-mark logo: the target printers use to line up colour plates. */
export function RegistrationMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.6" fill="var(--signal)" />
      <path d="M12 1.5v21M1.5 12h21" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link
      href="/"
      className="group flex items-center gap-2"
      aria-label="Digital Heroes Print, home"
    >
      <RegistrationMark className="size-6 transition-transform duration-300 group-hover:rotate-90" />
      <span className="font-heading text-[0.95rem] leading-none font-semibold tracking-tight whitespace-nowrap">
        Digital Heroes
        <span className="spec-label text-muted-foreground ml-1.5 align-middle max-sm:hidden">
          Print
        </span>
      </span>
    </Link>
  );
}
