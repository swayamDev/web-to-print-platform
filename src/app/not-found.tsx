import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/** Shown for unknown URLs, products and divisions (and to non-admins on /admin). */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center">
      <div className="mx-auto grid w-full max-w-xl justify-items-start gap-5 px-4 py-24">
        <p className="spec-label text-muted-foreground">Error 404</p>
        <h1 className="text-4xl font-bold">Page not found</h1>
        <p className="text-muted-foreground">
          The page you are looking for does not exist, or has been moved.
        </p>
        <Link href="/" className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>
          Back to all products
        </Link>
      </div>
    </main>
  );
}
