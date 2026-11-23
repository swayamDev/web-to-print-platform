import Link from "next/link";

/** Shared frame for the login, signup and password pages. Restyled in Phase 3. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-12">
      <Link href="/" className="text-muted-foreground font-mono text-xs tracking-widest uppercase">
        ← Digital Heroes Print
      </Link>
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
      </div>
      {children}
      {footer ? <div className="text-muted-foreground text-sm">{footer}</div> : null}
    </main>
  );
}
