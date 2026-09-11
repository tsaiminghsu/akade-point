'use client';

/**
 * Minecraft Web Edition — Phase 1 · Step 6
 * Renders one chunk as two meshes (opaque + transparent) built by the mesher.
 * Rebuilds geometry whenever `version` changes; disposes old geometry.
 */

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { ChunkMeshData } from '../../types';
import type { World } from '../chunks';
import { meshChunk } from '../chunks';

// Shared materials — vertex colors carry the block tint + face shading.
const opaqueMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const transparentMaterial = new THREE.MeshLambertMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.7,
  depthWrite: false,
  side: THREE.DoubleSide, // water surface visible from below
});

function toGeometry(data: ChunkMeshData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
  geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
  return geo;
}

interface Props {
  world: World;
  cx: number;
  cz: number;
  version: number;
}

export default function ChunkMesh({ world, cx, cz, version }: Props) {
  const [geo, setGeo] = useState<{
    opaque: THREE.BufferGeometry;
    transparent: THREE.BufferGeometry;
  } | null>(null);

  useEffect(() => {
    const data = meshChunk(world, cx, cz);
    const opaque = toGeometry(data.opaque);
    const transparent = toGeometry(data.transparent);
    setGeo({ opaque, transparent });
    return () => {
      opaque.dispose();
      transparent.dispose();
    };
  }, [world, cx, cz, version]);

  if (!geo) return null;

  const transparentCount = geo.transparent.index ? geo.transparent.index.count : 0;
  return (
    <group>
      <mesh geometry={geo.opaque} material={opaqueMaterial} />
      {transparentCount > 0 && (
        <mesh geometry={geo.transparent} material={transparentMaterial} renderOrder={1} />
      )}
    </group>
  );
}
