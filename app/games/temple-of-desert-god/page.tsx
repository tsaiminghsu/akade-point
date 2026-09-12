import type { Metadata } from 'next';
import GameClient from './GameClient';

export const metadata: Metadata = {
  title: 'Temple of the Desert God',
  description:
    '古埃及主題高波動老虎機 — 5×4 盤面 · 40條線 · Cascade · 免費遊戲 · God Power',
};

export default function TempleOfDesertGodPage() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          maxWidth: 1280,
          maxHeight: 720,
        }}
      >
        <GameClient />
      </div>
    </div>
  );
}
