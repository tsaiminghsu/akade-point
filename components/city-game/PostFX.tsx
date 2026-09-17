'use client';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

import { GameEngine3D } from './engine3d';
import type { ResolvedGraphics } from './graphicsSettings';

/**
 * Owns rendering.
 *
 * Passing a priority to `useFrame` switches r3f's automatic render off for the
 * whole canvas, so this component must stay mounted at every quality level and
 * always put something on screen — at the lowest settings that means a plain
 * `gl.render` with no composer at all.
 */

/** Objects tagged in CityMesh that screen-space reflections should consider. */
const SSR_REFRESH_FRAMES = 30;

interface Props {
  engine: GameEngine3D;
  graphics: ResolvedGraphics;
  /** Ground reflections are only worth it when the road is wet. */
  wet: boolean;
}

export default function PostFX({ engine, graphics, wet }: Props) {
  const { gl, scene, camera, size, viewport } = useThree();

  const composer = useRef<EffectComposer | null>(null);
  const ssrPass = useRef<SSRPass | null>(null);
  const passes = useRef<{ dispose?: () => void }[]>([]);
  const frames = useRef(0);
  const ssrRefresh = useRef(0);
  const lastFpsReport = useRef(0);
  const lastRender = useRef(0);

  const gfx = useRef(graphics);
  gfx.current = graphics;
  const wetRef = useRef(wet);
  wetRef.current = wet;

  const width = Math.max(1, Math.floor(size.width * viewport.dpr));
  const height = Math.max(1, Math.floor(size.height * viewport.dpr));

  useEffect(() => {
    const g = gfx.current;

    const teardown = () => {
      for (const p of passes.current) p.dispose?.();
      passes.current = [];
      composer.current?.dispose();
      composer.current = null;
      ssrPass.current = null;
      if (process.env.NODE_ENV !== 'production') {
        (engine as unknown as { postfx?: unknown }).postfx = null;
      }
    };

    if (!g.usesComposer) {
      teardown();
      return;
    }

    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      samples: g.antiAliasing === 'msaa' ? 4 : 0,
    });
    const comp = new EffectComposer(gl, target);
    comp.setSize(width, height);

    if (g.ssr) {
      // SSRPass renders the scene itself. Adding a RenderPass as well would
      // draw everything twice.
      const ssr = new SSRPass({
        renderer: gl,
        scene,
        camera,
        width: g.ssrQuality === 'low' ? Math.floor(width / 2) : width,
        height: g.ssrQuality === 'low' ? Math.floor(height / 2) : height,
        groundReflector: null,
        selects: [],
      });
      ssr.opacity = 0.4;
      ssr.maxDistance = 45;
      ssr.thickness = 0.06;
      ssr.blur = true;
      comp.addPass(ssr);
      ssrPass.current = ssr;
      passes.current.push(ssr);
    } else {
      comp.addPass(new RenderPass(scene, camera));
    }

    if (g.ao === 'gtao') {
      const gtao = new GTAOPass(scene, camera, width, height);
      gtao.blendIntensity = 0.8;
      gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1, thickness: 1, scale: 1 });
      comp.addPass(gtao);
      passes.current.push(gtao);
    } else if (g.ao === 'ssao') {
      const ssao = new SSAOPass(scene, camera, width, height);
      ssao.kernelRadius = 0.9;
      comp.addPass(ssao);
      passes.current.push(ssao);
    }

    if (g.bloom) {
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(width, height), g.bloomStrength, 0.4, 1.2,
      );
      comp.addPass(bloom);
      passes.current.push(bloom);
    }

    // Tone mapping is skipped when three renders into a target, so the chain
    // stays linear until OutputPass applies the renderer's ACES curve here.
    const output = new OutputPass();
    comp.addPass(output);
    passes.current.push(output);

    if (g.antiAliasing === 'smaa') {
      const smaa = new SMAAPass();
      comp.addPass(smaa);
      passes.current.push(smaa);
    } else if (g.antiAliasing === 'fxaa') {
      const fxaa = new FXAAPass();
      comp.addPass(fxaa);
      passes.current.push(fxaa);
    }

    composer.current = comp;

    if (process.env.NODE_ENV !== 'production') {
      (engine as unknown as { postfx?: unknown }).postfx = {
        composer: comp, passes: passes.current, ssr: ssrPass.current,
        GTAOPass, SSRPass,
      };
    }

    return teardown;
    // width/height are handled by the resize effect; rebuilding on every
    // resize would recompile shaders while the window is being dragged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera, engine, graphics.postFxKey, graphics.usesComposer]);

  useEffect(() => {
    composer.current?.setSize(width, height);
  }, [width, height]);

  useFrame((_, delta) => {
    const g = gfx.current;

    // Frame cap. Skipping the render leaves the previous frame on screen; the
    // simulation still ticks at full rate in GameScene.
    if (g.fpsCap > 0) {
      lastRender.current += delta;
      if (lastRender.current < 1 / g.fpsCap - 0.001) return;
      lastRender.current = 0;
    }

    const comp = composer.current;
    if (comp) {
      const ssr = ssrPass.current;
      if (ssr) {
        // SSRPass copies the camera matrices once, in its constructor. The FPV
        // race camera changes fov every frame, so they have to be refreshed or
        // reflections drift away from the geometry.
        const cam = camera as THREE.PerspectiveCamera;
        const u = ssr.ssrMaterial.uniforms;
        u.cameraNear.value = cam.near;
        u.cameraFar.value = cam.far;
        u.cameraProjectionMatrix.value.copy(cam.projectionMatrix);
        u.cameraInverseProjectionMatrix.value.copy(cam.projectionMatrixInverse);

        // Ground chunks stream in and out, so the selection is refreshed
        // periodically rather than held from build time.
        ssrRefresh.current -= 1;
        if (ssrRefresh.current <= 0) {
          ssrRefresh.current = SSR_REFRESH_FRAMES;
          const selects: THREE.Mesh[] = [];
          scene.traverse((o) => {
            if (!(o as THREE.Mesh).isMesh) return;
            if (o.userData.ssrTarget) selects.push(o as THREE.Mesh);
            else if (wetRef.current && o.userData.ssrWet) selects.push(o as THREE.Mesh);
          });
          ssr.selects = selects;
        }
      }
      comp.render(delta);
    } else {
      gl.render(scene, camera);
    }

    frames.current++;
    const now = performance.now();
    if (g.showFps && now - lastFpsReport.current >= 500) {
      const fps = Math.round(frames.current / ((now - lastFpsReport.current) / 1000));
      window.dispatchEvent(new CustomEvent('city:fps', { detail: { fps } }));
      lastFpsReport.current = now;
      frames.current = 0;
    }
  }, 1);

  return null;
}
