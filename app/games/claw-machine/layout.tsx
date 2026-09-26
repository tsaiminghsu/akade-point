import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '二代選物販賣機 | 機器人收藏宇宙',
  description: '3D 夾娃娃機模擬：搖桿操作天車與爪子，並可進入主機板設定模式調整強弱爪力、保夾局數與轉弱時機',
};

export default function ClawMachineLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
