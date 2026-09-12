'use client';

import nextDynamic from 'next/dynamic';

// ssr:false is only permitted inside a Client Component as of Next 15.
const DiceGame = nextDynamic(() => import('@/components/dice-game/DiceGame'), {
  ssr: false,
});

export default function GameClient() {
  return <DiceGame />;
}
