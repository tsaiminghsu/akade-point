import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'AKADE CITY',
  description: '3D 城市遊戲',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function CityGameLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
