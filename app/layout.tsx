import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "機器人收藏宇宙 | Robot Collection Universe",
  description: "收集・探索・成長・稱霸宇宙！",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={inter.variable}>
      <body>
        {children}
      </body>
    </html>
  );
}
