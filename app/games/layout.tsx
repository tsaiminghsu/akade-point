import type { Viewport } from "next";

// Games are direct-manipulation canvases: pinch-zoom fights the drag controls.
// This is the one place in the app where disabling user scaling is correct;
// the product pages inherit the zoomable viewport from the root layout.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function GamesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
