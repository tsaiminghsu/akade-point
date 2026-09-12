'use client';

import nextDynamic from 'next/dynamic';

// ssr:false is only permitted inside a Client Component as of Next 15.
const JiuGongGeGame = nextDynamic(
  () => import('@/components/jiu-gong-ge/JiuGongGeGame'),
  { ssr: false }
);

export default function GameClient() {
  return <JiuGongGeGame />;
}
