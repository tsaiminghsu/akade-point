import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Catch the Boat — 智慧船舶監測系統',
  description: '海事船舶即時監測系統',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function ShipTrackerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
