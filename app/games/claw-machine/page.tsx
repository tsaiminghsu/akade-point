'use client';
import dynamic from 'next/dynamic';

const ClawMachineGame = dynamic(() => import('@/components/claw-machine/ClawMachineGame'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-[#0b0718] text-fuchsia-200">
      <div className="text-center">
        <div className="mb-3 animate-pulse text-3xl">🧸</div>
        <div className="text-sm text-white/50">載入二代選物販賣機...</div>
      </div>
    </div>
  ),
});

export default function ClawMachinePage() {
  return <ClawMachineGame />;
}
