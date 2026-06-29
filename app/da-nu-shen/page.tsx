import nextDynamic from 'next/dynamic'

const DiceGame = nextDynamic(() => import('@/components/dice-game/DiceGame'), { ssr: false })

export const dynamic = 'force-dynamic'

export default function Page() {
  return <DiceGame />
}
