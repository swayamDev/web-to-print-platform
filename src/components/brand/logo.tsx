import Image from "next/image";
import Link from "next/link";

/** Register is the shared four-part registration mark for DHprint. */
export function RegistrationMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className} fill="currentColor">
      <path d="M6 28.5A22.5 22.5 0 0 1 28.5 6h.5v22.5zM58 35.5A22.5 22.5 0 0 1 35.5 58H35V35.5zM36 8h19.5v20.5H36zM8.5 35.5H28V56H8.5z" />
    </svg>
  );
}

export function Logo({ reversed = false }: { reversed?: boolean }) {
  return (
    <Link
      href="/"
      className="focus-visible:outline-ring flex shrink-0 items-center focus-visible:outline-2 focus-visible:outline-offset-4"
      aria-label="DHprint, Digital Heroes Print home"
    >
      <Image
        src={reversed ? "/brand/register-horizontal-reverse.svg" : "/brand/register-horizontal.svg"}
        alt=""
        width={156}
        height={40}
        className="h-auto w-[106px] max-[400px]:group-has-[[data-admin-link]]/header:hidden sm:w-[156px]"
        unoptimized
      />
      <RegistrationMark className="hidden size-7 max-[400px]:group-has-[[data-admin-link]]/header:block" />
    </Link>
  );
}
