// Rigid-body physics for the claw machine, on Rapier. Prizes are real dynamic
// bodies: they tumble, roll into gaps, tip off edges and stack on whatever is
// actually under them. The claw is a set of kinematic colliders (base disc and
// each arm) so it shoves, squeezes and drags prizes like the real thing.
//
// No three.js / React here: clawSim.ts drives this and runs headless in vitest.
// Rapier's WASM must be initialised once (initPhysics) before any world exists.

import RAPIER from '@dimforge/rapier3d-compat';

let initPromise: Promise<void> | null = null;
let ready = false;

/** Load Rapier's WASM. Safe to call repeatedly; resolves once. */
export function initPhysics(): Promise<void> {
  initPromise ??= (async () => {
    // rapier3d-compat 0.19's init() calls wasm-bindgen's loader with the old
    // positional argument, which always logs one deprecation line. Drop just
    // that line while initialising; everything else passes through.
    const warn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && args[0].startsWith('using deprecated parameters for the initialization function')) return;
      warn(...args);
    };
    try {
      await RAPIER.init();
    } finally {
      console.warn = warn;
    }
    ready = true;
  })();
  return initPromise;
}

export function isPhysicsReady() {
  return ready;
}

// Collision groups: statics and the claw only ever touch prizes.
const G_STATIC = 0x1;
const G_PRIZE = 0x2;
const G_CLAW = 0x4;
const groups = (member: number, filter: number) => ((member & 0xffff) << 16) | (filter & 0xffff);
const PRIZE_GROUPS = groups(G_PRIZE, G_STATIC | G_PRIZE | G_CLAW);
/** A prize just let go of passes through the claw until it has dropped clear. */
const GHOST_GROUPS = groups(G_PRIZE, G_STATIC | G_PRIZE);
const RAY_GROUPS = groups(0xffff, G_STATIC | G_PRIZE);

export interface Vec3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }

export interface Material {
  friction: number;
  restitution: number;
  linearDamping: number;
  angularDamping: number;
}

export interface PrizeBodyDesc extends Material {
  /** 'dodeca': a regular dodecahedron with circumradius r (a convex hull). */
  shape: 'sphere' | 'box' | 'dodeca';
  r: number;
  halfX: number; halfY: number; halfZ: number;
  mass: number;
  pos: Vec3;
  rot: Quat;
}

export interface ChuteDesc { minX: number; maxX: number; minZ: number; maxZ: number; wallH: number }

/** A raised block of the play field (a tier of a stepped floor), top at `top`. */
export interface FieldBlock { minX: number; maxX: number; minZ: number; maxZ: number; top: number }

export interface FloorRect { minX: number; maxX: number; minZ: number; maxZ: number }

/** A taut rope (a bounce table's 衝繩), as a thin static capsule. */
export interface FieldRope { from: Vec3; to: Vec3; r: number }

/**
 * The play field's static shape: the floor slabs (holes left out), raised
 * blocks, solid convex pieces (a 火山口's cord walls), and how springy each
 * part is.
 */
export interface FieldDesc {
  /** Floor slabs; empty means the plain L around the chute. */
  floor: FloorRect[];
  /** A 3D 彈跳台's sprung bed over the slabs, as a triangle mesh (normals up). */
  bed?: { vertices: Float32Array; indices: Uint32Array };
  /** 洞口網: springy panels, level with the rim, over the part of the hole the opening leaves. */
  nets?: FloorRect[];
  /** Solid boxes standing anywhere (a 大怒神's walls, base and collar), each with its own material. */
  boxes?: { center: Vec3; half: Vec3; friction: number; bounce: number }[];
  /** 衝繩 round the bed's edge: springy, they throw prizes back in. */
  ropes?: FieldRope[];
  blocks: FieldBlock[];
  /** Convex pieces, each given as its corner points (x, y, z, x, y, z, ...). */
  hulls: Float32Array[];
  /** Restitution of the floor and blocks; above ~0.5 prizes bounce off it (a rubber-cord bed). */
  floorBounce: number;
  /** Restitution of the hulls. */
  pieceBounce: number;
  /** The acrylic 擋板 round the hole; false when something else (a 火山口) fences it. */
  barrier?: boolean;
}

/** Bungee rope restitution: livelier than the bed. */
const ROPE_BOUNCE = 0.85;
/** A 洞口網 gives a little, less than the bed. */
const NET_BOUNCE = 0.5;

export const FLAT_FIELD: FieldDesc = { floor: [], blocks: [], hulls: [], floorBounce: 0.05, pieceBounce: 0.05 };

export interface CabinetDesc {
  minX: number; maxX: number; minZ: number; maxZ: number; height: number;
  chute: ChuteDesc;
  field?: FieldDesc;
}

/** Vertices of a regular dodecahedron with circumradius 1. */
const DODECA: number[] = (() => {
  const f = (1 + Math.sqrt(5)) / 2, g = 1 / f;
  const pts: number[][] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push([x, y, z]);
  for (const a of [-1, 1]) for (const b of [-1, 1]) pts.push([0, a * g, b * f], [a * g, b * f, 0], [a * f, 0, b * g]);
  const s = 1 / Math.sqrt(3);
  return pts.flat().map((v) => v * s);
})();

/** One straight capsule segment of the claw; each arm is a short chain of these. */
export interface Segment {
  from: Vec3; to: Vec3; r: number;
  /** A rigid part (the magnet), not a spring-loaded arm tip that splays around prizes. */
  solid?: boolean;
}

export interface ClawPose {
  /** Centre of the base disc. */
  hub: Vec3;
  hubR: number;
  hubHalfH: number;
  /** Arm tips (rubber-sleeved lower segments). */
  segments: Segment[];
  /** Current mouth radius (tip reach) around the hub axis. */
  mouthR: number;
}

export interface BodyState {
  x: number; y: number; z: number;
  qx: number; qy: number; qz: number; qw: number;
  vx: number; vy: number; vz: number;
}

/** Shortest-arc rotation taking +y onto the unit vector d. */
function quatFromUp(d: Vec3): Quat {
  const dot = d.y; // (0,1,0) · d
  if (dot > 0.999999) return { x: 0, y: 0, z: 0, w: 1 };
  if (dot < -0.999999) return { x: 1, y: 0, z: 0, w: 0 };
  // axis = (0,1,0) × d = (d.z, 0, -d.x)
  const x = d.z, y = 0, z = -d.x, w = 1 + dot;
  const n = Math.hypot(x, y, z, w);
  return { x: x / n, y: y / n, z: z / n, w: w / n };
}

function segmentTransform(s: Segment) {
  const dx = s.to.x - s.from.x, dy = s.to.y - s.from.y, dz = s.to.z - s.from.z;
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  return {
    center: { x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2, z: (s.from.z + s.to.z) / 2 },
    rot: quatFromUp({ x: dx / len, y: dy / len, z: dz / len }),
    halfLen: len / 2,
  };
}

export class PrizeWorld {
  private readonly world: RAPIER.World;
  /** Rapier only runs physics hooks when stepping with an event queue. */
  private readonly eventQueue: RAPIER.EventQueue;
  private readonly bodies = new Map<number, RAPIER.RigidBody>();
  private readonly ghosts = new Map<number, number>();
  /**
   * Prize collider handle → what the contact hook needs. The hook runs inside
   * world.step(), where touching a body (even translation()) is a WASM borrow
   * error, so positions are snapshotted into x/z just before each step.
   */
  private readonly prizeColliders = new Map<number, { round: boolean; body: RAPIER.RigidBody; x: number; z: number }>();
  private readonly tipColliders = new Set<number>();
  private mouth = { x: 0, z: 0, r: 0 };
  private clawBodies: RAPIER.RigidBody[] = [];
  private clawKey = '';
  private freed = false;
  /** Colliders that depend on the chute (floor around the hole, tray, 擋板), rebuilt by setChute(). */
  private chuteColliders: RAPIER.Collider[] = [];
  private readonly cab: CabinetDesc;

  /**
   * Spring-loaded arms: an open arm meeting a round prize whose centre is
   * inside the claw's mouth splays around it instead of shoving it (so the
   * claw neither perches on a plush's shoulders nor crushes it into the felt).
   * Boxes stay solid: an arm can't slide past cardboard corners.
   */
  private readonly hooks: RAPIER.PhysicsHooks = {
    filterContactPair: (c1, c2) => (this.armSplays(c1, c2) ? null : RAPIER.SolverFlags.COMPUTE_IMPULSE),
    filterIntersectionPair: () => true,
  };

  private armSplays(c1: number, c2: number) {
    const tip1 = this.tipColliders.has(c1);
    if (!tip1 && !this.tipColliders.has(c2)) return false;
    const prize = this.prizeColliders.get(tip1 ? c2 : c1);
    if (!prize?.round) return false;
    return Math.hypot(prize.x - this.mouth.x, prize.z - this.mouth.z) < this.mouth.r;
  }

  constructor(cab: CabinetDesc) {
    if (!ready) throw new Error('initPhysics() must resolve before creating the claw machine');
    this.world = new RAPIER.World({ x: 0, y: -9.8, z: 0 });
    this.eventQueue = new RAPIER.EventQueue(true);
    this.cab = cab;
    this.buildCabinet(cab);
    this.buildChute(cab.chute, cab.field ?? FLAT_FIELD);
  }

  private fixed(desc: RAPIER.ColliderDesc, friction: number, bounce = 0.05) {
    const d = desc.setFriction(friction).setRestitution(bounce).setCollisionGroups(groups(G_STATIC, G_PRIZE));
    // A springy field wins over the prize's own (dead) bounce.
    if (bounce > 0.3) d.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    return this.world.createCollider(d);
  }

  /** Floor around the hole (plus any steps or 火山口), the catch tray under it and the 擋板 fencing it. */
  private buildChute(ch: ChuteDesc, field: FieldDesc) {
    const c = this.cab;
    const add = (desc: RAPIER.ColliderDesc, friction: number, bounce = 0.05) =>
      this.chuteColliders.push(this.fixed(desc, friction, bounce));
    const slab = 0.2; // floor half-thickness; its sides form the shafts under the holes
    const floor: FloorRect[] = field.floor.length ? field.floor : [
      // The plain L around the chute hole.
      { minX: ch.maxX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ },
      { minX: c.minX, maxX: ch.maxX, minZ: c.minZ, maxZ: ch.minZ },
    ];
    for (const r of floor) {
      const hx = (r.maxX - r.minX) / 2, hz = (r.maxZ - r.minZ) / 2;
      if (hx <= 0 || hz <= 0) continue;
      add(RAPIER.ColliderDesc.cuboid(hx, slab, hz).setTranslation(r.minX + hx, -slab, r.minZ + hz), 0.8, field.floorBounce);
    }
    if (field.bed) {
      // Fixing internal edges keeps prizes from snagging on the seams as they roll down the bed.
      const bed = RAPIER.ColliderDesc.trimesh(field.bed.vertices, field.bed.indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES);
      add(bed, 0.8, field.floorBounce);
    }
    for (const n of field.nets ?? []) {
      const hx = (n.maxX - n.minX) / 2, hz = (n.maxZ - n.minZ) / 2;
      if (hx <= 0 || hz <= 0) continue;
      add(RAPIER.ColliderDesc.cuboid(hx, 0.004, hz).setTranslation(n.minX + hx, -0.004, n.minZ + hz), 0.6, NET_BOUNCE);
    }
    for (const b of field.boxes ?? []) {
      add(RAPIER.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z).setTranslation(b.center.x, b.center.y, b.center.z), b.friction, b.bounce);
    }
    // Stepped tiers and a 火山口's walls sit on top of the floor.
    for (const b of field.blocks) {
      const hx = (b.maxX - b.minX) / 2, hz = (b.maxZ - b.minZ) / 2, hy = b.top / 2;
      if (hx <= 0 || hz <= 0 || hy <= 0) continue;
      add(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(b.minX + hx, hy, b.minZ + hz), 0.8, field.floorBounce);
    }
    for (const pts of field.hulls) {
      const hull = RAPIER.ColliderDesc.convexHull(pts);
      if (hull) add(hull, 0.4, field.pieceBounce);
    }
    for (const r of field.ropes ?? []) {
      const { center, rot, halfLen } = segmentTransform({ from: r.from, to: r.to, r: r.r });
      add(RAPIER.ColliderDesc.capsule(halfLen, r.r).setTranslation(center.x, center.y, center.z).setRotation(rot), 0.4, ROPE_BOUNCE);
    }
    // Catch tray far below every hole, so nothing falls forever.
    add(RAPIER.ColliderDesc.cuboid((c.maxX - c.minX) / 2, 0.05, (c.maxZ - c.minZ) / 2)
      .setTranslation((c.minX + c.maxX) / 2, -0.75, (c.minZ + c.maxZ) / 2), 0.5);
    // Acrylic 擋板 fencing the hole (none at height 0).
    if (ch.wallH > 0.001 && field.barrier !== false) {
      add(RAPIER.ColliderDesc.cuboid(0.003, ch.wallH / 2, (ch.maxZ - ch.minZ) / 2)
        .setTranslation(ch.maxX, ch.wallH / 2, (ch.minZ + ch.maxZ) / 2), 0.25);
      add(RAPIER.ColliderDesc.cuboid((ch.maxX - ch.minX) / 2, ch.wallH / 2, 0.003)
        .setTranslation((ch.minX + ch.maxX) / 2, ch.wallH / 2, ch.minZ), 0.25);
    }
  }

  /** Refit the chute and the play field. Ray queries see the new floor after the next step. */
  setChute(ch: ChuteDesc, field: FieldDesc = FLAT_FIELD) {
    for (const col of this.chuteColliders) this.world.removeCollider(col, false);
    this.chuteColliders = [];
    this.buildChute(ch, field);
  }

  private buildCabinet(c: CabinetDesc) {
    // Glass walls (slick), extending below the floor to wall in the chute.
    const t = 0.05, wy = (c.height + 1) / 2, cy = c.height / 2 - 0.5;
    const hz = (c.maxZ - c.minZ) / 2 + t * 2, hx = (c.maxX - c.minX) / 2 + t * 2;
    this.fixed(RAPIER.ColliderDesc.cuboid(t, wy, hz).setTranslation(c.minX - t, cy, 0), 0.15);
    this.fixed(RAPIER.ColliderDesc.cuboid(t, wy, hz).setTranslation(c.maxX + t, cy, 0), 0.15);
    this.fixed(RAPIER.ColliderDesc.cuboid(hx, wy, t).setTranslation(0, cy, c.minZ - t), 0.15);
    this.fixed(RAPIER.ColliderDesc.cuboid(hx, wy, t).setTranslation(0, cy, c.maxZ + t), 0.15);
  }

  // ── Prizes ────────────────────────────────────────────────────────────────

  addPrize(id: number, d: PrizeBodyDesc) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(d.pos.x, d.pos.y, d.pos.z)
        .setRotation(d.rot)
        .setLinearDamping(d.linearDamping)
        .setAngularDamping(d.angularDamping)
        .setCcdEnabled(true),
    );
    const shape = d.shape === 'sphere'
      ? RAPIER.ColliderDesc.ball(d.r)
      : d.shape === 'dodeca'
        ? RAPIER.ColliderDesc.convexHull(new Float32Array(DODECA.map((v) => v * d.r)))
        : RAPIER.ColliderDesc.cuboid(d.halfX, d.halfY, d.halfZ);
    if (!shape) throw new Error('could not build the prize collider');
    const col = this.world.createCollider(
      shape.setMass(d.mass).setFriction(d.friction).setRestitution(d.restitution).setCollisionGroups(PRIZE_GROUPS),
      body,
    );
    this.bodies.set(id, body);
    this.prizeColliders.set(col.handle, { round: d.shape !== 'box', body, x: d.pos.x, z: d.pos.z });
  }

  remove(id: number) {
    const body = this.bodies.get(id);
    if (!body) return;
    this.prizeColliders.delete(body.collider(0).handle);
    this.world.removeRigidBody(body);
    this.bodies.delete(id);
    this.ghosts.delete(id);
  }

  clearPrizes() {
    for (const id of [...this.bodies.keys()]) this.remove(id);
  }

  read(id: number, out: BodyState) {
    const body = this.bodies.get(id);
    if (!body) return false;
    const t = body.translation(), q = body.rotation(), v = body.linvel();
    out.x = t.x; out.y = t.y; out.z = t.z;
    out.qx = q.x; out.qy = q.y; out.qz = q.z; out.qw = q.w;
    out.vx = v.x; out.vy = v.y; out.vz = v.z;
    return true;
  }

  /** The claw has it: it now moves only where the claw carries it. */
  grab(id: number) {
    const body = this.bodies.get(id);
    if (!body) return;
    body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  carry(id: number, pos: Vec3) {
    this.bodies.get(id)?.setNextKinematicTranslation(pos);
  }

  /** Back to physics, moving with the claw; ghosted through the claw for a moment. */
  release(id: number, vel: Vec3, ghostSeconds = 0.5) {
    const body = this.bodies.get(id);
    if (!body) return;
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    body.setLinvel(vel, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.collider(0).setCollisionGroups(GHOST_GROUPS);
    this.ghosts.set(id, ghostSeconds);
  }

  /** Set a prize's spin (rad/s), e.g. a die jarred as the platform under it lets go. */
  spin(id: number, ang: Vec3) {
    this.bodies.get(id)?.setAngvel(ang, true);
  }

  // ── 大怒神 moving parts ─────────────────────────────────────────────────────

  private readonly movers = new Map<string, RAPIER.RigidBody>();

  /**
   * Put in (or, with null, take out) a moving part the sim drives, like a
   * 大怒神's 升降台 or its acrylic box: boxes placed relative to `pos`.
   * Prizes (the dice) ride it, and are thrown by how it moves.
   */
  setMover(name: string, desc: { parts: { offset: Vec3; half: Vec3 }[]; pos: Vec3 } | null) {
    const old = this.movers.get(name);
    if (old) this.world.removeRigidBody(old);
    this.movers.delete(name);
    if (!desc) return;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(desc.pos.x, desc.pos.y, desc.pos.z),
    );
    for (const part of desc.parts) {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(part.half.x, part.half.y, part.half.z)
          .setTranslation(part.offset.x, part.offset.y, part.offset.z)
          .setFriction(0.5).setRestitution(0.3).setCollisionGroups(groups(G_STATIC, G_PRIZE)),
        body,
      );
    }
    this.movers.set(name, body);
  }

  /** Where a moving part goes this step, and (if it tilts) how it's turned. */
  moveMover(name: string, pos: Vec3, rot?: Quat) {
    const body = this.movers.get(name);
    if (!body) return;
    body.setNextKinematicTranslation(pos);
    if (rot) body.setNextKinematicRotation(rot);
  }

  // ── Claw ──────────────────────────────────────────────────────────────────

  /** Place the claw's colliders; rebuilds them if the head (shape) changed. */
  poseClaw(pose: ClawPose, teleport = false) {
    const key = `${pose.hubR}:${pose.hubHalfH}:`
      + pose.segments.map((s) => `${segmentTransform(s).halfLen.toFixed(4)}/${s.r}/${s.solid ? 1 : 0}`).join(',');
    this.mouth = { x: pose.hub.x, z: pose.hub.z, r: pose.mouthR };
    if (key !== this.clawKey) {
      for (const b of this.clawBodies) this.world.removeRigidBody(b);
      this.clawBodies = [];
      this.tipColliders.clear();
      const claw = groups(G_CLAW, G_PRIZE);
      const hub = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      this.world.createCollider(RAPIER.ColliderDesc.cylinder(pose.hubHalfH, pose.hubR).setFriction(0.6).setCollisionGroups(claw), hub);
      this.clawBodies.push(hub);
      for (const s of pose.segments) {
        const seg = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
        const { halfLen } = segmentTransform(s);
        const desc = RAPIER.ColliderDesc.capsule(halfLen, s.r).setFriction(0.9).setCollisionGroups(claw);
        if (!s.solid) desc.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
        const tip = this.world.createCollider(desc, seg);
        if (!s.solid) this.tipColliders.add(tip.handle);
        this.clawBodies.push(seg);
      }
      this.clawKey = key;
      teleport = true;
    }
    const [hub, ...segs] = this.clawBodies;
    if (teleport) hub.setTranslation(pose.hub, true);
    else hub.setNextKinematicTranslation(pose.hub);
    pose.segments.forEach((s, i) => {
      const { center, rot } = segmentTransform(s);
      if (teleport) {
        segs[i].setTranslation(center, true);
        segs[i].setRotation(rot, true);
      } else {
        segs[i].setNextKinematicTranslation(center);
        segs[i].setNextKinematicRotation(rot);
      }
    });
  }

  // ── Stepping and queries ──────────────────────────────────────────────────

  step(h: number) {
    for (const [id, left] of this.ghosts) {
      const next = left - h;
      if (next > 0) { this.ghosts.set(id, next); continue; }
      this.ghosts.delete(id);
      this.bodies.get(id)?.collider(0).setCollisionGroups(PRIZE_GROUPS);
    }
    for (const prize of this.prizeColliders.values()) {
      if (!prize.round) continue;
      const t = prize.body.translation();
      prize.x = t.x;
      prize.z = t.z;
    }
    this.world.timestep = h;
    this.world.step(this.eventQueue, this.hooks);
    this.eventQueue.clear();
  }

  /**
   * Height of the first prize or floor straight below (x, fromY, z), or null
   * if the ray falls through (the chute). The claw itself is never hit.
   */
  rayDown(x: number, z: number, fromY: number, excludeId: number | null = null): number | null {
    const ray = new RAPIER.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
    const exclude = excludeId === null ? undefined : this.bodies.get(excludeId);
    const hit = this.world.castRay(ray, fromY + 0.5, true, undefined, RAY_GROUPS, undefined, exclude);
    return hit ? fromY - hit.timeOfImpact : null;
  }

  /** Deepest interpenetration among prizes and against the cabinet (m). For tests. */
  maxPenetration(): number {
    let worst = 0;
    for (const body of this.bodies.values()) {
      const col = body.collider(0);
      this.world.contactPairsWith(col, (other) => {
        this.world.contactPair(col, other, (m) => {
          for (let i = 0; i < m.numContacts(); i++) worst = Math.max(worst, -m.contactDist(i));
        });
      });
    }
    return worst;
  }

  /**
   * Is the claw resting on something? True when any claw collider (disc or
   * tip) is pressed against a prize that pushes back upward, i.e. the claw's
   * weight is carried and the cable would go slack. A tip merely brushing a
   * prize's side doesn't count; it shoves it aside and keeps going down.
   */
  clawSupported(): boolean {
    let supported = false;
    for (const b of this.clawBodies) {
      const col = b.collider(0);
      this.world.contactPairsWith(col, (other) => {
        if (supported) return;
        this.world.contactPair(col, other, (m, flipped) => {
          let touching = false;
          for (let i = 0; i < m.numContacts(); i++) if (m.contactDist(i) < 0.001) touching = true;
          if (!touching) return;
          // Manifold normal points from its first collider to its second.
          const ny = flipped ? -m.normal().y : m.normal().y;
          // Anything bearing down on the claw carries it; only pure side
          // contact (a tip brushing past) lets it keep descending.
          if (ny < -0.2) supported = true;
        });
      });
      if (supported) break;
    }
    return supported;
  }

  /** True once every prize has come to rest (Rapier put it to sleep or it is nearly still). */
  allResting(speed = 0.02) {
    for (const body of this.bodies.values()) {
      if (body.isKinematic() || body.isSleeping()) continue;
      const v = body.linvel(), w = body.angvel();
      if (Math.hypot(v.x, v.y, v.z) > speed || Math.hypot(w.x, w.y, w.z) > speed * 20) return false;
    }
    return true;
  }

  free() {
    if (this.freed) return;
    this.freed = true;
    this.eventQueue.free();
    this.world.free();
  }
}

