import type { Metadata } from "next";
import "./globals.css";

// Deliberately NOT using next/font/google. Remote font fetching is one more thing
// that can fail when the venue wifi does, and the demo has to run with the network
// off. System stacks look right for an operations tool anyway.

export const metadata: Metadata = {
  title: "SmokeFix — wildfire smoke-call triangulation",
  description:
    "Turns several vague verbal smoke reports into one triangulated coordinate with a confidence score.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
