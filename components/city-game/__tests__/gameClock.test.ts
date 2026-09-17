import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as gameClock from '../gameClock';
import { GameEngine3D } from '../engine3d';

/** Minimal in-memory localStorage so the engine's save layer works in node. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

describe('gameClock', () => {
  let wall = 0;

  beforeEach(() => {
    wall = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => wall);
    gameClock.resetClock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    gameClock.resetClock();
  });

  it('follows the wall clock while running', () => {
    expect(gameClock.now()).toBe(1000);
    wall = 1500;
    expect(gameClock.now()).toBe(1500);
    expect(gameClock.isPaused()).toBe(false);
  });

  it('freezes while paused', () => {
    gameClock.pause();
    wall = 5000;
    expect(gameClock.now()).toBe(1000);
    expect(gameClock.isPaused()).toBe(true);
  });

  it('excludes paused time once resumed', () => {
    gameClock.pause();
    wall = 5000;            // four seconds spent in the pause menu
    gameClock.resume();
    expect(gameClock.now()).toBe(1000);
    wall = 5250;
    expect(gameClock.now()).toBe(1250);   // only the 250ms since resuming counts
  });

  it('accumulates across repeated pauses', () => {
    gameClock.pause();
    wall = 3000;
    gameClock.resume();     // skipped 2000
    wall = 4000;
    gameClock.pause();
    wall = 9000;
    gameClock.resume();     // skipped a further 5000
    wall = 9500;
    expect(gameClock.now()).toBe(2500);
  });

  it('ignores a second pause rather than re-stamping', () => {
    gameClock.pause();
    wall = 3000;
    gameClock.pause();
    wall = 5000;
    gameClock.resume();
    wall = 5100;
    expect(gameClock.now()).toBe(1100);
  });

  it('ignores resume when it was never paused', () => {
    gameClock.resume();
    expect(gameClock.now()).toBe(1000);
  });
});

describe('engine pause gate', () => {
  let engine: GameEngine3D;

  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    gameClock.resetClock();
    engine = new GameEngine3D();
  });

  afterEach(() => {
    engine.setPaused(false);
    gameClock.resetClock();
  });

  it('stops advancing the simulation', () => {
    const car = engine.vehicles.get(engine.player.currentVehicleId!)!;
    car.speed = 120;
    const startTick = engine.tick;
    const startX = engine.player.x;
    const startY = engine.player.y;

    engine.setPaused(true);
    for (let i = 0; i < 60; i++) engine.update(1 / 60, gameClock.now());

    expect(engine.tick).toBe(startTick);
    expect(engine.player.x).toBe(startX);
    expect(engine.player.y).toBe(startY);
  });

  it('resumes ticking once unpaused', () => {
    engine.setPaused(true);
    engine.update(1 / 60, gameClock.now());
    const paused = engine.tick;

    engine.setPaused(false);
    engine.update(1 / 60, gameClock.now());

    expect(engine.tick).toBe(paused + 1);
  });

  it('holds the game clock for as long as it is paused', () => {
    engine.setPaused(true);
    expect(gameClock.isPaused()).toBe(true);
    expect(gameClock.now()).toBe(gameClock.now());

    engine.setPaused(false);
    expect(gameClock.isPaused()).toBe(false);
  });

  it('does not latch one-shot input pressed while paused', () => {
    expect(engine.player.state).toBe('inCar');

    engine.setPaused(true);
    engine.input.triggerTouchAction('enter');   // F — would leave the car
    engine.update(1 / 60, gameClock.now());
    engine.setPaused(false);
    engine.update(1 / 60, gameClock.now());

    expect(engine.player.state).toBe('inCar');
  });
});
