import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "機器人收藏宇宙 | Robot Collection Universe",
  description: "收集・探索・成長・稱霸宇宙！",
};

// The app is opened almost exclusively from the LINE in-app browser on a phone.
// Without this, product pages inherit Next's default and render at desktop width.
// maximumScale / userScalable are deliberately NOT set here: pinch-zoom must stay
// available on product pages (WCAG 1.4.4). The games opt out in app/games/layout.tsx.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1120",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        {children}
        <noscript>
          <div
            style={{
              padding: "16px",
              textAlign: "center",
              background: "#1c1917",
              color: "#fafaf9",
            }}
          >
            本網站需要啟用 JavaScript 才能使用。請在瀏覽器設定中開啟 JavaScript 後重新整理。
          </div>
        </noscript>
      </body>
    </html>
  );
}
