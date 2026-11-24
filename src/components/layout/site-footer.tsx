import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { getDivisions } from "@/server/catalogue";

export async function SiteFooter() {
  const divisions = await getDivisions();
  return (
    <footer className="bg-ink text-paper mt-12">
      <div className="mx-auto grid w-full max-w-[96rem] grid-cols-2 gap-x-4 gap-y-8 px-4 py-10 md:grid-cols-[1.5fr_1fr_1fr] md:gap-10 md:px-8 md:py-14">
        <div className="col-span-2 grid content-start justify-items-start gap-3 md:col-span-1">
          <Logo reversed />
          <p className="text-paper/80 max-w-sm">
            Custom print. Clear pricing. Proof before production.
          </p>
        </div>
        <nav aria-label="Product divisions" className="grid content-start gap-2">
          <p className="font-semibold">Products</p>
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
        <nav aria-label="More" className="grid content-start gap-2">
          <p className="font-semibold">More</p>
          <ul className="grid gap-1.5 text-sm">
            <li>
              <Link href="/gallery" className="text-paper/80 hover:text-signal">
                Gallery
              </Link>
            </li>
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
        <p className="text-paper/75 mx-auto w-full max-w-[96rem] px-4 py-4 text-xs md:px-8">
          Demonstration platform · prices are sample values · no real orders are fulfilled
        </p>
      </div>
    </footer>
  );
}
