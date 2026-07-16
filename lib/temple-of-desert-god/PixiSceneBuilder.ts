import * as PIXI from 'pixi.js';
import { SYMBOL_DEFS, SYMBOL_SIZE, REEL_GAP, GRID_COLS, GRID_ROWS } from './constants';
import type { SymbolId } from './types';

export interface SceneRefs {
  background: PIXI.Graphics;
  reelWindow: PIXI.Container;
  reelContainers: PIXI.Container[];
  symbolCells: PIXI.Container[][];   // [reelIdx][row] each contains Graphics + Text
  paylineOverlay: PIXI.Graphics;
  glowContainer: PIXI.Container;
  wildTextContainer: PIXI.Container;
  particleContainer: PIXI.Container;
  frameGraphics: PIXI.Graphics;
  effectsContainer: PIXI.Container;
}

/** Width of the entire reel area */
export function getReelAreaWidth(): number {
  return GRID_COLS * (SYMBOL_SIZE + REEL_GAP) - REEL_GAP;
}

export function getReelAreaHeight(): number {
  return GRID_ROWS * (SYMBOL_SIZE + REEL_GAP) - REEL_GAP;
}

/** Build the full PixiJS scene and return refs to all manipulable layers */
export function buildScene(app: PIXI.Application): SceneRefs {
  const { width, height } = app.screen;
  const reelW = getReelAreaWidth();
  const reelH = getReelAreaHeight();
  const reelOriginX = (width - reelW) / 2;
  const reelOriginY = (height - reelH) / 2 + 20;

  // ── Background ────────────────────────────────────────────────────────────
  const background = new PIXI.Graphics();
  drawBackground(background, width, height);
  app.stage.addChild(background);

  // ── Machine frame ─────────────────────────────────────────────────────────
  const frameGraphics = new PIXI.Graphics();
  drawMachineFrame(frameGraphics, reelOriginX, reelOriginY, reelW, reelH);
  app.stage.addChild(frameGraphics);

  // ── Reel window (clipping mask) ───────────────────────────────────────────
  const reelWindow = new PIXI.Container();
  reelWindow.x = reelOriginX;
  reelWindow.y = reelOriginY;
  app.stage.addChild(reelWindow);

  const mask = new PIXI.Graphics();
  mask.beginFill(0xFFFFFF);
  mask.drawRect(-4, -4, reelW + 8, reelH + 8);
  mask.endFill();
  reelWindow.addChild(mask);
  reelWindow.mask = mask;

  // ── Reel containers ───────────────────────────────────────────────────────
  const reelContainers: PIXI.Container[] = [];
  const symbolCells: PIXI.Container[][] = [];

  for (let reelIdx = 0; reelIdx < GRID_COLS; reelIdx++) {
    const reelX = reelIdx * (SYMBOL_SIZE + REEL_GAP);
    const reelContainer = new PIXI.Container();
    reelContainer.x = reelX;
    reelWindow.addChild(reelContainer);
    reelContainers.push(reelContainer);
    // symbolCells populated by AnimationEngine after ReelRenderer init
    symbolCells[reelIdx] = [];
  }

  // ── Payline overlay ───────────────────────────────────────────────────────
  const paylineOverlay = new PIXI.Graphics();
  paylineOverlay.x = reelOriginX;
  paylineOverlay.y = reelOriginY;
  app.stage.addChild(paylineOverlay);

  // ── Glow container (winning symbol highlights) ────────────────────────────
  const glowContainer = new PIXI.Container();
  glowContainer.x = reelOriginX;
  glowContainer.y = reelOriginY;
  app.stage.addChild(glowContainer);

  // ── Wild multiplier text container ────────────────────────────────────────
  const wildTextContainer = new PIXI.Container();
  wildTextContainer.x = reelOriginX;
  wildTextContainer.y = reelOriginY;
  app.stage.addChild(wildTextContainer);

  // ── Particle layer ────────────────────────────────────────────────────────
  const particleContainer = new PIXI.Container();
  app.stage.addChild(particleContainer);

  // ── Effects overlay ───────────────────────────────────────────────────────
  const effectsContainer = new PIXI.Container();
  app.stage.addChild(effectsContainer);

  return {
    background,
    reelWindow,
    reelContainers,
    symbolCells,
    paylineOverlay,
    glowContainer,
    wildTextContainer,
    particleContainer,
    frameGraphics,
    effectsContainer,
  };
}

// ─── Symbol cell factory ──────────────────────────────────────────────────────

export function createSymbolCell(symbolId: SymbolId): PIXI.Container {
  const container = new PIXI.Container();

  const def = SYMBOL_DEFS.find(s => s.id === symbolId);
  const color = def?.color ?? 0x888888;
  const label = def?.label ?? symbolId;

  // Background circle
  const bg = new PIXI.Graphics();
  bg.name = 'bg';
  drawSymbolGraphic(bg, symbolId, color, SYMBOL_SIZE);
  container.addChild(bg);

  // Label text
  const text = new PIXI.Text(label, {
    fontFamily: 'Arial',
    fontSize: 14,
    fill: 0xFFFFFF,
    fontWeight: 'bold',
    stroke: 0x000000,
    strokeThickness: 3,
    align: 'center',
    wordWrap: true,
    wordWrapWidth: SYMBOL_SIZE - 8,
  });
  text.name = 'label';
  text.anchor.set(0.5);
  text.x = SYMBOL_SIZE / 2;
  text.y = SYMBOL_SIZE - 22;
  container.addChild(text);

  // Tier badge
  const tier = def?.tier;
  if (tier === 'wild') {
    addWildBadge(container);
  } else if (tier === 'scatter') {
    addScatterBadge(container);
  }

  return container;
}

export function updateSymbolCell(container: PIXI.Container, symbolId: SymbolId): void {
  const def = SYMBOL_DEFS.find(s => s.id === symbolId);
  const color = def?.color ?? 0x888888;
  const label = def?.label ?? symbolId;

  const bg = container.getChildByName('bg') as PIXI.Graphics;
  if (bg) {
    bg.clear();
    drawSymbolGraphic(bg, symbolId, color, SYMBOL_SIZE);
  }

  const text = container.getChildByName('label') as PIXI.Text;
  if (text) text.text = label;

  // Remove old badges
  const badges = container.children.filter(c => c.name === 'badge');
  for (const b of badges) container.removeChild(b);

  const tier = def?.tier;
  if (tier === 'wild') addWildBadge(container);
  else if (tier === 'scatter') addScatterBadge(container);
}

function drawSymbolGraphic(g: PIXI.Graphics, symbolId: SymbolId, color: number, size: number): void {
  const def = SYMBOL_DEFS.find(s => s.id === symbolId);
  const tier = def?.tier;

  // Dark background
  g.beginFill(0x1A0A00, 0.9);
  g.lineStyle(2, 0x3D2A00, 1);
  g.drawRoundedRect(2, 2, size - 4, size - 4, 12);
  g.endFill();

  // Symbol shape
  if (tier === 'wild') {
    // Sun shape — 8-pointed star
    drawStar(g, size / 2, size / 2 - 8, 40, 20, 8, color);
  } else if (tier === 'scatter') {
    // Temple arch
    drawTemple(g, size / 2, size / 2 - 8, color);
  } else if (tier === 'high') {
    // Ornate diamond
    drawDiamond(g, size / 2, size / 2 - 8, 38, color);
  } else {
    // Gem shape
    drawGem(g, size / 2, size / 2 - 10, 28, color);
  }
}

function drawGem(g: PIXI.Graphics, cx: number, cy: number, r: number, color: number): void {
  g.beginFill(color, 1);
  g.lineStyle(2, 0xFFFFFF, 0.5);
  g.drawPolygon([
    cx, cy - r,
    cx + r * 0.7, cy - r * 0.3,
    cx + r * 0.5, cy + r * 0.7,
    cx - r * 0.5, cy + r * 0.7,
    cx - r * 0.7, cy - r * 0.3,
  ]);
  g.endFill();
  // Highlight
  g.beginFill(0xFFFFFF, 0.3);
  g.drawPolygon([
    cx, cy - r,
    cx + r * 0.4, cy - r * 0.3,
    cx, cy - r * 0.1,
    cx - r * 0.4, cy - r * 0.3,
  ]);
  g.endFill();
}

function drawDiamond(g: PIXI.Graphics, cx: number, cy: number, r: number, color: number): void {
  g.beginFill(color);
  g.lineStyle(2, lightenColor(color), 0.8);
  g.drawPolygon([
    cx, cy - r,
    cx + r * 0.7, cy,
    cx, cy + r,
    cx - r * 0.7, cy,
  ]);
  g.endFill();
  g.beginFill(0xFFFFFF, 0.25);
  g.drawPolygon([
    cx, cy - r,
    cx + r * 0.35, cy - r * 0.3,
    cx, cy - r * 0.05,
    cx - r * 0.35, cy - r * 0.3,
  ]);
  g.endFill();
}

function drawStar(
  g: PIXI.Graphics,
  cx: number, cy: number,
  outerR: number, innerR: number,
  points: number,
  color: number
): void {
  const pts: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  g.beginFill(color);
  g.lineStyle(2, 0xFFFFFF, 0.6);
  g.drawPolygon(pts);
  g.endFill();
  // Core glow
  g.beginFill(0xFFFFFF, 0.4);
  g.drawCircle(cx, cy, innerR * 0.7);
  g.endFill();
}

function drawTemple(g: PIXI.Graphics, cx: number, cy: number, color: number): void {
  // Base
  g.beginFill(color);
  g.drawRect(cx - 30, cy + 10, 60, 28);
  g.endFill();
  // Arch
  g.beginFill(color);
  g.moveTo(cx - 30, cy + 10);
  g.lineTo(cx - 30, cy - 10);
  g.arc(cx, cy - 10, 30, Math.PI, 0, false);
  g.lineTo(cx + 30, cy + 10);
  g.endFill();
  // Door
  g.beginFill(0x1A0A00);
  g.drawRect(cx - 10, cy + 5, 20, 33);
  g.endFill();
  g.beginFill(0x1A0A00);
  g.arc(cx, cy + 5, 10, Math.PI, 0, false);
  g.endFill();
}

function lightenColor(color: number): number {
  const r = Math.min(255, ((color >> 16) & 0xFF) + 60);
  const gr = Math.min(255, ((color >> 8) & 0xFF) + 60);
  const b = Math.min(255, (color & 0xFF) + 60);
  return (r << 16) | (gr << 8) | b;
}

function addWildBadge(container: PIXI.Container): void {
  const badge = new PIXI.Graphics();
  badge.name = 'badge';
  badge.beginFill(0xFFD700);
  badge.drawRoundedRect(SYMBOL_SIZE / 2 - 22, 4, 44, 18, 8);
  badge.endFill();
  const t = new PIXI.Text('WILD', {
    fontFamily: 'Arial', fontSize: 11, fill: 0x000000, fontWeight: 'bold',
  });
  t.anchor.set(0.5);
  t.x = SYMBOL_SIZE / 2;
  t.y = 13;
  badge.addChild(t);
  container.addChild(badge);
}

function addScatterBadge(container: PIXI.Container): void {
  const badge = new PIXI.Graphics();
  badge.name = 'badge';
  badge.beginFill(0xFF8C00);
  badge.drawRoundedRect(SYMBOL_SIZE / 2 - 30, 4, 60, 18, 8);
  badge.endFill();
  const t = new PIXI.Text('SCATTER', {
    fontFamily: 'Arial', fontSize: 10, fill: 0xFFFFFF, fontWeight: 'bold',
  });
  t.anchor.set(0.5);
  t.x = SYMBOL_SIZE / 2;
  t.y = 13;
  badge.addChild(t);
  container.addChild(badge);
}

// ─── Background ───────────────────────────────────────────────────────────────

function drawBackground(g: PIXI.Graphics, w: number, h: number): void {
  // Deep desert night sky gradient (simulated with bands)
  g.beginFill(0x0D0818);
  g.drawRect(0, 0, w, h);
  g.endFill();

  // Stars
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h * 0.6;
    const r = Math.random() < 0.2 ? 1.5 : 0.8;
    const alpha = 0.4 + Math.random() * 0.6;
    g.beginFill(0xFFFFFF, alpha);
    g.drawCircle(x, y, r);
    g.endFill();
  }

  // Distant pyramid silhouette
  g.beginFill(0x1C1005, 0.8);
  g.drawPolygon([0, h, w * 0.3, h * 0.5, w * 0.5, h]);
  g.endFill();
  g.beginFill(0x1A0F03, 0.6);
  g.drawPolygon([w * 0.4, h, w * 0.65, h * 0.55, w * 0.85, h]);
  g.endFill();
  g.beginFill(0x150C02, 0.5);
  g.drawPolygon([w * 0.7, h, w * 0.85, h * 0.6, w, h]);
  g.endFill();

  // Ground / sand glow
  g.beginFill(0x3D2200, 0.4);
  g.drawRect(0, h * 0.85, w, h * 0.15);
  g.endFill();
}

// ─── Frame ────────────────────────────────────────────────────────────────────

function drawMachineFrame(
  g: PIXI.Graphics,
  rx: number, ry: number,
  rw: number, rh: number
): void {
  const pad = 16;

  // Outer glow
  g.beginFill(0xB8860B, 0.15);
  g.drawRoundedRect(rx - pad - 8, ry - pad - 8, rw + pad * 2 + 16, rh + pad * 2 + 16, 24);
  g.endFill();

  // Frame body
  g.beginFill(0x2C1900);
  g.lineStyle(3, 0xFFD700, 0.9);
  g.drawRoundedRect(rx - pad, ry - pad, rw + pad * 2, rh + pad * 2, 18);
  g.endFill();

  // Inner bevel
  g.lineStyle(1.5, 0xC09000, 0.6);
  g.drawRoundedRect(rx - pad + 4, ry - pad + 4, rw + pad * 2 - 8, rh + pad * 2 - 8, 15);

  // Corner ornaments
  const corners = [
    [rx - pad, ry - pad],
    [rx + rw + pad, ry - pad],
    [rx - pad, ry + rh + pad],
    [rx + rw + pad, ry + rh + pad],
  ];
  for (const [cx, cy] of corners) {
    g.lineStyle(0);
    g.beginFill(0xFFD700);
    g.drawCircle(cx, cy, 8);
    g.endFill();
    g.beginFill(0xB8860B);
    g.drawCircle(cx, cy, 4);
    g.endFill();
  }
}

// ─── Cell position helpers ────────────────────────────────────────────────────

export function getCellPosition(reelIdx: number, rowIdx: number): { x: number; y: number } {
  return {
    x: reelIdx * (SYMBOL_SIZE + REEL_GAP) + SYMBOL_SIZE / 2,
    y: rowIdx * (SYMBOL_SIZE + REEL_GAP) + SYMBOL_SIZE / 2,
  };
}

