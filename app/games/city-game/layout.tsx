import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AKADE CITY',
  description: '3D 城市遊戲',
};

export default function CityGameLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
