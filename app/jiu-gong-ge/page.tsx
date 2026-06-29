import nextDynamic from 'next/dynamic'

const JiuGongGeGame = nextDynamic(
  () => import('@/components/jiu-gong-ge/JiuGongGeGame'),
  { ssr: false }
)

export const dynamic = 'force-dynamic'

export default function Page() {
  return <JiuGongGeGame />
}
