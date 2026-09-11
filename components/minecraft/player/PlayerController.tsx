'use client';

/**
 * Minecraft Web Edition — Phase 1 · Step 7
 * First-person controller: pointer-lock look, WASD + jump/fly movement,
 * voxel collision, and block break/place via DDA raycast.
 */

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import {
  EYE_HEIGHT,
  FLY_SPEED,
  GRAVITY,
  HOTBAR_BLOCKS,
  JUMP_VELOCITY,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  REACH,
  SPRINT_SPEED,
  VOID_Y,
  WALK_SPEED,
} from '../config';
import { BLOCK, getBlockDef } from '../engine/blocks';
import type { World } from '../engine/chunks';
import { useKeyboard } from '../hooks';
import { useMinecraftStore } from '../stores';
import { raycastVoxel } from './raycast';
import { blockIntersectsBody, stepBody } from './physics';
import type { PlayerBody } from './physics';

const MOUSE_SENSITIVITY = 0.0025;
const BODY_OPTS = { halfWidth: PLAYER_HALF_WIDTH, height: PLAYER_HEIGHT };

export default function PlayerController({ world }: { world: World }) {
  const { camera, gl } = useThree();
  const keys = useKeyboard();

  const bodyRef = useRef<PlayerBody>({
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    onGround: false,
  });
  const lookRef = useRef({ yaw: 0, pitch: 0 });
  const highlightRef = useRef<THREE.LineSegments>(null);
  const statsRef = useRef({ frames: 0, elapsed: 0 });

  const highlightGeometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
    [],
  );
  useEffect(() => () => highlightGeometry.dispose(), [highlightGeometry]);

  // Spawn.
  useEffect(() => {
    const spawn = world.spawnPoint();
    bodyRef.current.pos = { x: spawn.x, y: spawn.y, z: spawn.z };
  }, [world]);

  // ─── Input events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = gl.domElement;
    const store = useMinecraftStore;

    const onPointerLockChange = () => {
      store.getState().setLocked(document.pointerLockElement === canvas);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      const look = lookRef.current;
      look.yaw -= e.movementX * MOUSE_SENSITIVITY;
      look.pitch -= e.movementY * MOUSE_SENSITIVITY;
      const limit = Math.PI / 2 - 0.001;
      look.pitch = Math.max(-limit, Math.min(limit, look.pitch));
    };

    const lookDir = () => {
      const { yaw, pitch } = lookRef.current;
      const cp = Math.cos(pitch);
      return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
    };

    const onMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      const body = bodyRef.current;
      const origin = {
        x: body.pos.x,
        y: body.pos.y + EYE_HEIGHT,
        z: body.pos.z,
      };
      const hit = raycastVoxel(world, origin, lookDir(), REACH);
      if (!hit) return;

      if (e.button === 0) {
        // Break.
        const def = getBlockDef(world.getBlock(hit.block.x, hit.block.y, hit.block.z));
        if (def.breakable) {
          world.setBlock(hit.block.x, hit.block.y, hit.block.z, BLOCK.Air);
        }
      } else if (e.button === 2) {
        // Place against the hit face.
        const tx = hit.block.x + hit.normal.x;
        const ty = hit.block.y + hit.normal.y;
        const tz = hit.block.z + hit.normal.z;
        const existing = world.getBlock(tx, ty, tz);
        if (existing !== BLOCK.Air && existing !== BLOCK.Water) return;
        if (blockIntersectsBody(tx, ty, tz, body.pos, BODY_OPTS)) return;
        const id = HOTBAR_BLOCKS[store.getState().selectedSlot];
        world.setBlock(tx, ty, tz, id);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyF') store.getState().toggleFlying();
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= 9) store.getState().setSelectedSlot(n - 1);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (document.pointerLockElement !== canvas) return;
      const delta = e.deltaY > 0 ? 1 : -1;
      store.getState().setSelectedSlot(store.getState().selectedSlot + delta);
    };

    const onContextMenu = (e: Event) => e.preventDefault();
    const onClick = () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('wheel', onWheel);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [gl, world]);

  // ─── Frame loop ────────────────────────────────────────────────────────────
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const body = bodyRef.current;
    const look = lookRef.current;
    const state = useMinecraftStore.getState();
    const held = keys.current;

    // Wish direction on the xz plane, relative to yaw.
    const sin = Math.sin(look.yaw);
    const cos = Math.cos(look.yaw);
    let ix = 0;
    let iz = 0;
    if (held.has('KeyW')) { ix -= sin; iz -= cos; }
    if (held.has('KeyS')) { ix += sin; iz += cos; }
    if (held.has('KeyA')) { ix -= cos; iz += sin; }
    if (held.has('KeyD')) { ix += cos; iz -= sin; }
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }

    const sprint = held.has('ShiftLeft') || held.has('ShiftRight');
    const jump = held.has('Space');

    if (state.flying) {
      const speed = FLY_SPEED;
      body.vel.x = ix * speed;
      body.vel.z = iz * speed;
      body.vel.y = jump ? speed : sprint ? -speed : 0;
    } else {
      const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
      body.vel.x = ix * speed;
      body.vel.z = iz * speed;
      body.vel.y -= GRAVITY * dt;
      if (jump && body.onGround) body.vel.y = JUMP_VELOCITY;
    }

    stepBody(world, body, dt, BODY_OPTS);

    // Respawn when falling out of the world.
    if (body.pos.y < VOID_Y) {
      const spawn = world.spawnPoint();
      body.pos = { x: spawn.x, y: spawn.y, z: spawn.z };
      body.vel = { x: 0, y: 0, z: 0 };
    }

    // Camera follows the eyes.
    camera.position.set(body.pos.x, body.pos.y + EYE_HEIGHT, body.pos.z);
    camera.quaternion.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'));

    // Block highlight.
    const highlight = highlightRef.current;
    if (highlight) {
      const cp = Math.cos(look.pitch);
      const hit = raycastVoxel(
        world,
        { x: body.pos.x, y: body.pos.y + EYE_HEIGHT, z: body.pos.z },
        { x: -sin * cp, y: Math.sin(look.pitch), z: -cos * cp },
        REACH,
      );
      if (hit && getBlockDef(world.getBlock(hit.block.x, hit.block.y, hit.block.z)).breakable) {
        highlight.visible = true;
        highlight.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5);
      } else {
        highlight.visible = false;
      }
    }

    // Throttled debug info (~4 Hz).
    const stats = statsRef.current;
    stats.frames++;
    stats.elapsed += delta;
    if (stats.elapsed >= 0.25) {
      state.setDebug({
        fps: Math.round(stats.frames / stats.elapsed),
        x: body.pos.x,
        y: body.pos.y,
        z: body.pos.z,
        yaw: look.yaw,
      });
      stats.frames = 0;
      stats.elapsed = 0;
    }
  });

  return (
    <lineSegments ref={highlightRef} geometry={highlightGeometry} visible={false}>
      <lineBasicMaterial color={0xffffff} transparent opacity={0.9} />
    </lineSegments>
  );
}
