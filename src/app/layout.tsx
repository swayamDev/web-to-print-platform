import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

const instrument = localFont({
  src: [
    { path: "./web-fonts/body.ttf", weight: "400" },
    { path: "./web-fonts/bold.ttf", weight: "700" },
  ],
  variable: "--font-instrument",
});
const display = localFont({
  src: "./web-fonts/display.ttf",
  variable: "--font-special",
  preload: false,
});
const mono = localFont({
  src: "./web-fonts/mono.ttf",
  variable: "--font-plex",
  fallback: ["monospace"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: {
    default: "DHprint · Digital Heroes Print",
    template: "%s · Digital Heroes Print",
  },
  description:
    "Configure, design, proof and order custom print: labels, race numbers, MTB boards, stamps, trophies and laser-cut work.",
};

export const viewport: Viewport = {
  themeColor: "#F3F1EC",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrument.variable} ${display.variable} ${mono.variable} h-full antialiased`}
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
