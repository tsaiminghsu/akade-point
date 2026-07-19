'use client'
import { useState, useEffect } from 'react'
import { DiePhysicsHandle, computeTopFaceFromQuat } from './PhysicsDie'

interface DiceDebugProps {
  handlesRef: React.MutableRefObject<Array<{ current: DiePhysicsHandle }>>
  visible: boolean
}

export default function DiceDebug({ handlesRef, visible }: DiceDebugProps) {
  const [, tick] = useState(0)

  useEffect(() => {
    if (!visible) return
    let id: number
    const loop = () => { tick(n => n + 1); id = requestAnimationFrame(loop) }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [visible])

  if (!visible) return null

  return (
    <div className="absolute top-2 left-2 z-50 bg-black/75 text-[10px] font-mono text-white p-2 rounded space-y-0.5 pointer-events-none select-none">
      {handlesRef.current.map((h, i) => {
        const { speed, angSpeed, quat, px, py, pz, groundContact, diceContact } = h.current
        const settled = speed < 0.025 && angSpeed < 0.025
        const topFace = computeTopFaceFromQuat(quat)
        return (
          <div key={i} className={settled ? 'text-green-400' : 'text-white'}>
            #{i} v:{speed.toFixed(2)} ω:{angSpeed.toFixed(2)} top:{topFace}
            {' '}gnd:{groundContact ? 'Y' : 'N'}
            {' '}dice:{diceContact ? 'Y' : 'N'}
            {' '}({px.toFixed(1)},{py.toFixed(1)},{pz.toFixed(1)})
            {settled ? ' ✓' : ''}
          </div>
        )
      })}
    </div>
  )
}
