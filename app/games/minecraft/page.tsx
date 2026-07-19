'use client';
import dynamic from 'next/dynamic';

const MinecraftGame = dynamic(() => import('@/components/minecraft/MinecraftGame'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0a0e1a] text-white/70">
      <div className="text-center">
        <div className="mb-3 animate-pulse text-4xl">⛏️</div>
        <div className="text-sm">初始化 WebGL 3D 渲染引擎...</div>
      </div>
    </div>
  ),
});

export default function MinecraftPage() {
  return <MinecraftGame />;
}
