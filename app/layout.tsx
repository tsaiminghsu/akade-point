import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// No title template here: the Control Center segment declares its own
// ("%s | IoT Control Center"), and a template at both levels would render
// the section name twice.
export const metadata: Metadata = {
  title: "IoT Control Center",
  description: "Enterprise IoT Control Center — real-time device monitoring & floor-plan editor",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
