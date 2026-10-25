import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Band Payments + Super",
  description:
    "Gig settlement, player invoices and separate super contribution tracking.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
