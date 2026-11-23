import Link from "next/link";

import { RegistrationMark } from "@/components/brand/logo";
import { getDivisions } from "@/server/catalogue";

export async function SiteFooter() {
  const divisions = await getDivisions();
  return (
    <footer className="bg-ink text-paper mt-16">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="grid content-start gap-3">
          <div className="flex items-center gap-2">
            <RegistrationMark className="size-6" />
            <span className="font-heading font-semibold">Digital Heroes Print</span>
          </div>
          <p className="text-paper/70 max-w-sm text-sm">
            Six print divisions, one platform. Configure, design, proof and order — then reorder in
            one click.
          </p>
        </div>
        <nav aria-label="Product divisions" className="grid content-start gap-2">
          <p className="spec-label text-paper/50">Divisions</p>
          <ul className="grid gap-1.5 text-sm">
            {divisions.map((d) => (
              <li key={d.id}>
                <Link href={`/d/${d.slug}`} className="text-paper/80 hover:text-signal">
                  {d.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Account" className="grid content-start gap-2">
          <p className="spec-label text-paper/50">Account</p>
          <ul className="grid gap-1.5 text-sm">
            <li>
              <Link href="/account" className="text-paper/80 hover:text-signal">
                My account
              </Link>
            </li>
            <li>
              <Link href="/signup" className="text-paper/80 hover:text-signal">
                Create an account
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-paper/10 border-t">
        <p className="spec-label text-paper/50 mx-auto w-full max-w-6xl px-4 py-4">
          Demonstration platform · prices are sample values · no real orders are fulfilled
        </p>
      </div>
    </footer>
  );
}
