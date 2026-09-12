'use client';

import nextDynamic from 'next/dynamic';

// ssr:false is only permitted inside a Client Component as of Next 15.
const SlotMachineGame = nextDynamic(
  () => import('@/components/temple-of-desert-god/SlotMachineGame'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen flex items-center justify-center bg-[#0D0818]">
        <div className="text-yellow-400 text-xl tracking-widest animate-pulse">
          LOADING TEMPLE...
        </div>
      </div>
    ),
  }
);

export default function GameClient() {
  return <SlotMachineGame />;
}
