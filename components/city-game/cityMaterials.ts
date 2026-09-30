import * as THREE from 'three';
import { FLOOR_HEIGHT_3D } from './types';

/**
 * Materials for the streamed city: facades, storefronts, street furniture.
 *
 * Facades are mapped in world space instead of per-face UVs. A box's UVs run
 * 0..1 on every face whatever its instance scale, so a 20-floor tower and a
 * 3-floor block used to get the same number of stretched windows. Here one
 * texture repeat is always one window bay by one floor, so windows keep their
 * size on every building and line up across the tiles of a merged block.
 *
 * Which windows are lit comes from a small per-category atlas (one texel per
 * window) sampled at the window's world cell, so neighbouring buildings get
 * different patterns without any per-instance data.
 */

/** Shared by every city material; GameScene drives them each frame. */
export const cityUniforms = {
  /** 0 = broad daylight, 1 = full night. Scales windows, lamps, light pools. */
  uCityLight: { value: 0.1 },
  /** Seconds, for the traffic-signal cycle. */
  uClock: { value: 0 },
};

/** Lit-window atlas size, in window cells. */
const ATLAS_COLS = 16;
const ATLAS_ROWS = 32;

export type FacadeKind = 'sky' | 'off' | 'com' | 'hou' | 'shop';

/** World size of one texture repeat: [bay width, storey height], 3D units. */
export const FACADE_CELL: Record<FacadeKind, [number, number]> = {
  sky: [1.15, FLOOR_HEIGHT_3D],
  off: [1.4, FLOOR_HEIGHT_3D],
  com: [1.6, FLOOR_HEIGHT_3D],
  hou: [1.3, FLOOR_HEIGHT_3D],
  shop: [1.8, FLOOR_HEIGHT_3D],
};

// ── Deterministic helpers ────────────────────────────────────────────────────

function rngFrom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas2d(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Light speckle so flat colours read as a material, not a fill. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, n: number, alpha: number, seed: number) {
  const r = rngFrom(seed);
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    ctx.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1 + Math.floor(r() * 2), 1);
  }
}

// ── Facade textures (one bay × one storey; canvas top = top of the storey) ──

const T = 64;

interface FacadeTex { map: THREE.CanvasTexture; mask: THREE.CanvasTexture }

function drawFacade(kind: FacadeKind): { color: HTMLCanvasElement; mask: HTMLCanvasElement } {
  const [color, c] = canvas2d(T, T);
  const [mask, m] = canvas2d(T, T);
  m.fillStyle = '#000';
  m.fillRect(0, 0, T, T);
  m.fillStyle = '#fff';

  const glass = (x: number, y: number, w: number, h: number, top: string, bottom: string) => {
    const g = c.createLinearGradient(x, y, x + w * 0.3, y + h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    // Sky reflection streak.
    c.fillStyle = 'rgba(255,255,255,0.10)';
    c.beginPath();
    c.moveTo(x, y + h * 0.55);
    c.lineTo(x + w * 0.45, y);
    c.lineTo(x + w * 0.62, y);
    c.lineTo(x, y + h * 0.85);
    c.closePath();
    c.fill();
    m.fillRect(x, y, w, h);
  };

  if (kind === 'sky') {
    // Unitised curtain wall: slim mullions, dark spandrel glass at the slab.
    c.fillStyle = '#9aa3ad';
    c.fillRect(0, 0, T, T);
    glass(2, 2, T - 4, T - 14, '#5f7589', '#26374a');
    c.fillStyle = '#39434e';
    c.fillRect(0, T - 12, T, 10);                 // spandrel panel
    c.fillStyle = '#c7ced6';
    c.fillRect(0, 0, 2, T);                       // mullion
    c.fillRect(0, T - 2, T, 2);                   // transom at the slab
    c.fillRect(T / 2 - 1, 2, 1, T - 14);          // secondary mullion
  } else if (kind === 'off') {
    // Precast concrete frame with ribbon glazing.
    c.fillStyle = '#d6d1c6';
    c.fillRect(0, 0, T, T);
    grain(c, T, T, 120, 0.12, 11);
    glass(7, 14, T - 14, T - 22, '#4b6173', '#1f2c39');
    c.fillStyle = '#b9b3a7';
    c.fillRect(0, T - 8, T, 8);                   // sill band
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(7, 14, T - 14, 2);                 // head shadow
    c.fillStyle = '#9ea4aa';
    c.fillRect(T / 2 - 1, 14, 2, T - 22);         // mullion
  } else if (kind === 'com') {
    // Rendered masonry with a punched window, lintel and sill.
    c.fillStyle = '#d9cdb8';
    c.fillRect(0, 0, T, T);
    grain(c, T, T, 180, 0.14, 23);
    c.fillStyle = 'rgba(80,60,40,0.10)';
    for (let y = 8; y < T; y += 8) c.fillRect(0, y, T, 1); // stone courses
    c.fillStyle = '#b8aa94';
    c.fillRect(12, 10, 40, 5);                    // lintel
    c.fillRect(11, 49, 42, 4);                    // sill
    c.fillStyle = '#3b3631';
    c.fillRect(14, 15, 36, 34);                   // reveal
    glass(16, 17, 32, 30, '#435768', '#1b2530');
    c.fillStyle = '#3b3631';
    c.fillRect(31, 17, 2, 30);
    c.fillRect(16, 30, 32, 2);
  } else if (kind === 'hou') {
    // Painted clapboard siding with a white-trimmed sash window.
    c.fillStyle = '#eeeae2';
    c.fillRect(0, 0, T, T);
    for (let y = 3; y < T; y += 6) {
      c.fillStyle = 'rgba(90,80,70,0.22)';
      c.fillRect(0, y, T, 1);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(0, y + 1, T, 1);
    }
    c.fillStyle = '#fbfbf8';
    c.fillRect(17, 12, 30, 36);                   // trim
    glass(20, 15, 24, 30, '#5a6e80', '#2a3746');
    c.fillStyle = '#fbfbf8';
    c.fillRect(20, 29, 24, 2);
    c.fillRect(31, 15, 2, 30);
    c.fillStyle = '#5c6a5a';
    c.fillRect(11, 12, 5, 36);                    // shutters
    c.fillRect(48, 12, 5, 36);
  } else {
    // Storefront: sign fascia, full-height display glass, kick plate.
    c.fillStyle = '#26282b';
    c.fillRect(0, 0, T, T);
    c.fillStyle = '#f2f2f2';
    c.fillRect(0, 2, T, 13);                      // fascia (tinted per shop)
    m.fillRect(0, 2, T, 13);                      // …and lit at night
    glass(3, 18, T - 6, T - 26, '#5d7080', '#26323c');
    c.fillStyle = '#3a3d41';
    c.fillRect(0, T - 8, T, 8);                   // kick plate
    c.fillStyle = '#1b1c1e';
    c.fillRect(0, 16, T, 2);
    c.fillRect(T - 3, 16, 3, T - 16);
  }
  return { color, mask };
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function facadeTextures(kind: FacadeKind): FacadeTex {
  const { color, mask } = drawFacade(kind);
  return { map: toTexture(color, true), mask: toTexture(mask, false) };
}

/**
 * One texel per window: its lamp colour, or near-black when the room is dark.
 * Offices light whole floors together; homes are warm and patchy.
 */
function litAtlas(kind: FacadeKind): THREE.DataTexture {
  const r = rngFrom(kind.length * 7919 + kind.charCodeAt(0) * 131);
  const data = new Uint8Array(ATLAS_COLS * ATLAS_ROWS * 4);
  const warm: [number, number, number] = [255, 205, 130];
  const white: [number, number, number] = [225, 232, 245];
  const cool: [number, number, number] = [190, 235, 255];

  for (let y = 0; y < ATLAS_ROWS; y++) {
    const floorLit = r();
    for (let x = 0; x < ATLAS_COLS; x++) {
      let on: boolean;
      let col: [number, number, number];
      if (kind === 'shop') {
        on = r() < 0.92;
        col = warm;
      } else if (kind === 'hou') {
        on = r() < 0.45;
        col = warm;
      } else if (kind === 'sky' || kind === 'off') {
        on = floorLit < 0.55 ? r() < 0.85 : r() < 0.12;
        col = r() < 0.7 ? white : cool;
      } else {
        on = r() < 0.4;
        col = r() < 0.5 ? warm : white;
      }
      const dim = 0.55 + r() * 0.45;
      const i = (y * ATLAS_COLS + x) * 4;
      data[i] = on ? col[0] * dim : 6;
      data[i + 1] = on ? col[1] * dim : 8;
      data[i + 2] = on ? col[2] * dim : 12;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, ATLAS_COLS, ATLAS_ROWS, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// ── Facade material ──────────────────────────────────────────────────────────

export interface OwnedMaterial<M extends THREE.Material = THREE.MeshStandardMaterial> {
  material: M;
  /** Frees the material and the textures made for it. */
  dispose: () => void;
}

export function createFacadeMaterial(
  kind: FacadeKind,
  params: { roughness: number; metalness: number; glow: number },
): OwnedMaterial {
  const { map, mask } = facadeTextures(kind);
  const atlas = litAtlas(kind);
  const [bay, storey] = FACADE_CELL[kind];

  const material = new THREE.MeshStandardMaterial({
    map,
    emissiveMap: mask,
    emissive: new THREE.Color(1, 1, 1),
    emissiveIntensity: params.glow,
    roughness: params.roughness,
    metalness: params.metalness,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCell = { value: new THREE.Vector2(bay, storey) };
    shader.uniforms.uLitAtlas = { value: atlas };
    shader.uniforms.uCityLight = cityUniforms.uCityLight;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uCell;')
      .replace('#include <worldpos_vertex>', /* glsl */ `#include <worldpos_vertex>
      {
        vec4 fw = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          fw = instanceMatrix * fw;
        #endif
        fw = modelMatrix * fw;
        // Boxes are only ever scaled, never rotated, so the object normal
        // tells which wall this is.
        float along = abs( normal.x ) > 0.5 ? fw.z : fw.x;
        vec2 fuv = vec2( along / uCell.x, fw.y / uCell.y );
        #ifdef USE_MAP
          vMapUv = fuv;
        #endif
        #ifdef USE_EMISSIVEMAP
          vEmissiveMapUv = fuv;
        #endif
      }`);

    // Storefronts: the instance colour is the shop's brand colour, and only the
    // fascia band at the top of the storey (canvas rows 2–15 of 64) takes it —
    // tinting the display glass red would look like paint on the windows.
    const shop = kind === 'shop';
    const tintMask = shop ? 'step( 0.76, fract( vMapUv.y ) )' : '1.0';

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
      uniform sampler2D uLitAtlas;
      uniform float uCityLight;`)
      .replace('#include <color_fragment>', /* glsl */ `
      #ifdef USE_COLOR
        diffuseColor.rgb *= mix( vec3( 1.0 ), vColor.rgb, ${tintMask} );
      #endif`)
      .replace('#include <emissivemap_fragment>', /* glsl */ `
      #ifdef USE_EMISSIVEMAP
        float windowMask = texture2D( emissiveMap, vEmissiveMapUv ).r;
        vec3 lamp = texture2D( uLitAtlas, ( floor( vEmissiveMapUv ) + 0.5 ) / vec2( ${ATLAS_COLS}.0, ${ATLAS_ROWS}.0 ) ).rgb;
        totalEmissiveRadiance *= windowMask * lamp * uCityLight;
        ${shop ? `#ifdef USE_COLOR
          totalEmissiveRadiance *= mix( vec3( 1.0 ), vColor.rgb * 1.6, ${tintMask} );
        #endif` : ''}
      #endif`);
  };
  material.customProgramCacheKey = () => `city-facade-${kind === 'shop' ? 'shop' : 'wall'}`;

  return {
    material,
    dispose: () => { map.dispose(); mask.dispose(); atlas.dispose(); material.dispose(); },
  };
}

// ── Emissive that follows the day/night level ────────────────────────────────

/** Street-lamp heads and similar: barely lit by day, full glow at night. */
export function followCityLight<M extends THREE.Material>(material: M, dayLevel = 0.12): M {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCityLight = cityUniforms.uCityLight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCityLight;')
      .replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix( ${dayLevel.toFixed(3)}, 1.0, uCityLight );`);
  };
  material.customProgramCacheKey = () => `city-light-${dayLevel}`;
  return material;
}

// ── Pools of lamp light on the ground (no real light needed) ────────────────

export function createLightPoolMaterial(): OwnedMaterial<THREE.MeshBasicMaterial> {
  const [cv, c] = canvas2d(64, 64);
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,200,120,1)');
  g.addColorStop(0.35, 'rgba(255,180,100,0.55)');
  g.addColorStop(1, 'rgba(255,160,80,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // Fog would add its own colour through the additive blend.
    fog: false,
    opacity: 0.55,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCityLight = cityUniforms.uCityLight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCityLight;')
      .replace('#include <opaque_fragment>',
        'outgoingLight *= smoothstep( 0.25, 0.9, uCityLight );\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'city-light-pool';
  return { material, dispose: () => { map.dispose(); material.dispose(); } };
}

// ── Traffic signals ──────────────────────────────────────────────────────────

/** Signal cycle length, seconds. Green 42%, amber 8%, red 50%. */
export const SIGNAL_CYCLE = 24;

/**
 * Signal heads cycle red → green → amber on the GPU. The instance colour's
 * red channel carries the phase (0 for one road axis, 0.5 for the other), so
 * crossing directions are always opposite.
 */
export function createSignalMaterial(): OwnedMaterial {
  const [cv, c] = canvas2d(32, 96);
  c.fillStyle = '#000';
  c.fillRect(0, 0, 32, 96);
  const lamp = (y: number, fill: string) => {
    c.fillStyle = fill;
    c.beginPath();
    c.arc(16, y, 10, 0, Math.PI * 2);
    c.fill();
  };
  // Channels are masks: R = red lamp, G = amber, B = green.
  lamp(16, '#f00');
  lamp(48, '#0f0');
  lamp(80, '#00f');
  const mask = new THREE.CanvasTexture(cv);

  const material = new THREE.MeshStandardMaterial({
    color: '#2a2c2e',
    roughness: 0.6,
    metalness: 0.3,
    emissive: new THREE.Color(1, 1, 1),
    emissiveMap: mask,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uClock = cityUniforms.uClock;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uClock;')
      .replace('#include <color_fragment>', '') // the colour channel is the phase, not a tint
      .replace('#include <emissivemap_fragment>', /* glsl */ `
      #ifdef USE_EMISSIVEMAP
        vec3 sm = texture2D( emissiveMap, vEmissiveMapUv ).rgb;
        float phase = 0.0;
        #ifdef USE_COLOR
          phase = vColor.r;
        #endif
        float t = fract( uClock / ${SIGNAL_CYCLE.toFixed(1)} + phase );
        float green = step( t, 0.42 );
        float amber = step( 0.42, t ) * step( t, 0.5 );
        float red = step( 0.5, t );
        totalEmissiveRadiance = sm.r * red * vec3( 1.0, 0.06, 0.03 ) * 4.0
          + sm.g * amber * vec3( 1.0, 0.55, 0.0 ) * 4.0
          + sm.b * green * vec3( 0.1, 1.0, 0.45 ) * 4.0
          + sm * 0.03;
      #endif`);
  };
  material.customProgramCacheKey = () => 'city-signal';
  return { material, dispose: () => { mask.dispose(); material.dispose(); } };
}

// ── Geometry ─────────────────────────────────────────────────────────────────

/**
 * Gable roof, ridge along X, centred on the origin: 1 wide (Z), 1 tall,
 * 1 long. Non-indexed so every face gets a flat normal.
 */
export function createGableGeometry(): THREE.BufferGeometry {
  const a = [-0.5, -0.5, -0.5], b = [0.5, -0.5, -0.5];
  const c = [0.5, -0.5, 0.5], d = [-0.5, -0.5, 0.5];
  const e = [-0.5, 0.5, 0], f = [0.5, 0.5, 0];
  const tris = [
    // south slope (+Z)
    d, c, f, d, f, e,
    // north slope (-Z)
    b, a, e, b, e, f,
    // gables
    a, d, e,
    c, b, f,
    // underside
    a, b, c, a, c, d,
  ];
  const pos = new Float32Array(tris.flat());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
