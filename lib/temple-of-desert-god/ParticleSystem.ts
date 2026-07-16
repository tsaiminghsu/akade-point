import * as PIXI from 'pixi.js';

interface Particle {
  sprite: PIXI.Sprite;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  rotSpeed: number;
  scaleDecay: number;
}

type ParticleType = 'coin' | 'star' | 'glow' | 'spark';

const PARTICLE_COLORS: Record<ParticleType, number[]> = {
  coin:  [0xFFD700, 0xFFC000, 0xFFE066],
  star:  [0xFFFFFF, 0xFFD700, 0xFFA500],
  glow:  [0xFF8C00, 0xFFD700, 0xFFFFFF],
  spark: [0xFF4500, 0xFF6B35, 0xFFD700],
};

export class ParticleSystem {
  private container: PIXI.Container;
  private pool: Particle[] = [];
  private active: Particle[] = [];
  private maxParticles = 800;

  constructor(parent: PIXI.Container) {
    this.container = new PIXI.Container();
    parent.addChild(this.container);
    this.buildPool();
  }

  private buildPool(): void {
    for (let i = 0; i < this.maxParticles; i++) {
      const sprite = new PIXI.Sprite(PIXI.Texture.WHITE);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.container.addChild(sprite);
      this.pool.push({
        sprite,
        vx: 0, vy: 0, gravity: 0,
        life: 0, maxLife: 1,
        rotSpeed: 0, scaleDecay: 0,
      });
    }
  }

  private getParticle(): Particle | null {
    const p = this.pool.pop();
    if (!p) return null;
    this.active.push(p);
    return p;
  }

  emit(type: ParticleType, x: number, y: number, count: number): void {
    const colors = PARTICLE_COLORS[type];

    for (let i = 0; i < count; i++) {
      const p = this.getParticle();
      if (!p) break;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      const size = type === 'glow' ? 8 + Math.random() * 16
                 : type === 'coin' ? 6 + Math.random() * 10
                 : 3 + Math.random() * 6;

      p.sprite.tint = colors[Math.floor(Math.random() * colors.length)];
      p.sprite.width = size;
      p.sprite.height = type === 'coin' ? size * 0.6 : size;
      p.sprite.x = x + (Math.random() - 0.5) * 40;
      p.sprite.y = y + (Math.random() - 0.5) * 20;
      p.sprite.alpha = 1;
      p.sprite.rotation = Math.random() * Math.PI * 2;
      p.sprite.visible = true;

      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - (type === 'coin' ? 4 : 2);
      p.gravity = type === 'coin' ? 0.25 : 0.1;
      p.life = 0;
      p.maxLife = 40 + Math.random() * 40;
      p.rotSpeed = (Math.random() - 0.5) * 0.2;
      p.scaleDecay = 0.98;
    }
  }

  /** Called every frame from PixiJS ticker */
  update(_dt: number): void {
    const toReturn: Particle[] = [];

    for (const p of this.active) {
      p.life++;
      p.vx *= 0.97;
      p.vy += p.gravity;
      p.sprite.x += p.vx;
      p.sprite.y += p.vy;
      p.sprite.rotation += p.rotSpeed;
      p.sprite.alpha = 1 - p.life / p.maxLife;
      p.sprite.scale.x *= p.scaleDecay;
      p.sprite.scale.y *= p.scaleDecay;

      if (p.life >= p.maxLife) {
        p.sprite.visible = false;
        p.sprite.scale.set(1);
        toReturn.push(p);
      }
    }

    for (const p of toReturn) {
      const idx = this.active.indexOf(p);
      if (idx !== -1) this.active.splice(idx, 1);
      this.pool.push(p);
    }
  }

  burst(x: number, y: number): void {
    this.emit('coin', x, y, 20);
    this.emit('star', x, y, 10);
    this.emit('glow', x, y, 8);
    this.emit('spark', x, y, 15);
  }

  clear(): void {
    for (const p of this.active) {
      p.sprite.visible = false;
      p.sprite.scale.set(1);
      this.pool.push(p);
    }
    this.active = [];
  }
}
