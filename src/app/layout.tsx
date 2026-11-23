import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Sora } from "next/font/google";
import "./globals.css";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

// Geometric headings, a dense-spec body face, and mono for dimensions (PRD p8 §12).
const sora = Sora({ variable: "--font-sora", subsets: ["latin"], display: "swap" });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Digital Heroes Print — custom print, made to measure",
    template: "%s · Digital Heroes Print",
  },
  description:
    "Configure, design, proof and order custom print: labels, race numbers, MTB boards, stamps, trophies and laser-cut work.",
};

export const viewport: Viewport = {
  themeColor: "#f4f2ed",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sora.variable} ${inter.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <SiteHeader />
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
