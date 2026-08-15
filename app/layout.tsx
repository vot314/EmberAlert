import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * IBM Plex rather than the usual Inter/Roboto default. It was drawn for technical and
 * institutional interfaces, the mono cut is a genuine companion to the sans rather than
 * an unrelated face, and it reads as instrument panel instead of web dashboard.
 *
 * next/font downloads and self-hosts these at BUILD time, so there is no runtime CDN
 * request and nothing to fail on a bad venue network.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EmberAlert — Wildfire Call Triage",
  description:
    "Locates and prioritises wildfires from emergency call audio, with live regional wind fronts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
