'use client';

/**
 * Minecraft Web Edition — Phase 1 · Step 6
 * Renders every chunk in the bounded world and re-meshes dirty chunks
 * (block edits) as they are reported by the World.
 */

import { useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { World } from '../chunks';
import ChunkMesh from './ChunkMesh';

export default function WorldRenderer({ world }: { world: World }) {
  const [versions, setVersions] = useState<Record<string, number>>({});

  useFrame(() => {
    const dirty = world.consumeDirty();
    if (dirty.length === 0) return;
    setVersions(prev => {
      const next = { ...prev };
      for (const key of dirty) next[key] = (next[key] ?? 0) + 1;
      return next;
    });
  });

  return (
    <group>
      {world.allChunkKeys().map(key => {
        const comma = key.indexOf(',');
        const cx = Number(key.slice(0, comma));
        const cz = Number(key.slice(comma + 1));
        return (
          <ChunkMesh key={key} world={world} cx={cx} cz={cz} version={versions[key] ?? 0} />
        );
      })}
    </group>
  );
}
