import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputManager } from '../controls';

describe('InputManager: touch and virtual input (no DOM required)', () => {
  let im: InputManager;

  beforeEach(() => { im = new InputManager(); });

  it('quantises the virtual joystick into digital directions past the dead zone', () => {
    im.setVirtualMove(0, -0.5);
    let s = im.getState(false);
    expect(s.up).toBe(true);
    expect(s.down).toBe(false);

    im.setVirtualMove(0.9, 0);
    s = im.getState(false);
    expect(s.right).toBe(true);
    expect(s.left).toBe(false);
  });

  it('stays neutral inside the dead zone', () => {
    im.setVirtualMove(0.1, -0.1);
    const s = im.getState(false);
    expect(s.up).toBe(false);
    expect(s.down).toBe(false);
    expect(s.left).toBe(false);
    expect(s.right).toBe(false);
  });

  it('held touch buttons stay true across getState calls until released', () => {
    im.setTouchButton('sprint', true);
    expect(im.getState(false).sprint).toBe(true);
    expect(im.getState(false).sprint).toBe(true); // not a one-shot
    im.setTouchButton('sprint', false);
    expect(im.getState(false).sprint).toBe(false);
  });

  it('touch one-shots fire exactly once, cleared by flush()', () => {
    im.triggerTouchAction('jump');
    expect(im.getState(false, true).jump).toBe(true);
    im.flush();
    expect(im.getState(false, true).jump).toBe(false);
  });

  it('the new autopilot one-shot is wired the same way', () => {
    im.triggerTouchAction('autopilot');
    expect(im.getState(true).autopilot).toBe(true);
    im.flush();
    expect(im.getState(true).autopilot).toBe(false);
  });
});

describe('InputManager.getMoveAxes', () => {
  let im: InputManager;
  beforeEach(() => { im = new InputManager(); });

  it('falls back to the joystick only when the keyboard is neutral', () => {
    im.setVirtualMove(0, -1); // pushed "up" on screen
    expect(im.getMoveAxes()).toEqual({ x: 0, y: 1 }); // forward is +y here
  });

  it('clamps diagonal magnitude to 1', () => {
    im.setVirtualMove(1, -1);
    const { x, y } = im.getMoveAxes();
    expect(Math.hypot(x, y)).toBeCloseTo(1, 5);
  });

  it('returns zero with no input at all', () => {
    expect(im.getMoveAxes()).toEqual({ x: 0, y: 0 });
  });
});

describe('InputManager.getState: context gating', () => {
  let im: InputManager;
  beforeEach(() => { im = new InputManager(); });

  it('brake only asserts while isDriving is true', () => {
    im.setTouchButton('brake', true);
    expect(im.getState(false).brake).toBe(false);
    expect(im.getState(true).brake).toBe(true);
  });

  it('jump requires isOnFoot, even from touch', () => {
    im.triggerTouchAction('jump');
    expect(im.getState(false, false).jump).toBe(false);
  });

  it('jump fires once isOnFoot is true', () => {
    im.triggerTouchAction('jump');
    expect(im.getState(false, true).jump).toBe(true);
  });

  it('interact and cancelMission are suppressed while airborne', () => {
    im.triggerTouchAction('interact');
    im.triggerTouchAction('cancelMission');
    const grounded = im.getState(false, false, false);
    expect(grounded.interact).toBe(true);
    expect(grounded.cancelMission).toBe(true);

    im.triggerTouchAction('interact');
    im.triggerTouchAction('cancelMission');
    const airborne = im.getState(false, false, true);
    expect(airborne.interact).toBe(false);
    expect(airborne.cancelMission).toBe(false);
  });

  it('does not gate autopilot on driving/airborne state (the engine decides validity)', () => {
    im.triggerTouchAction('autopilot');
    expect(im.getState(false, false, true).autopilot).toBe(true);
  });
});

describe('InputManager: look and wheel accumulators', () => {
  let im: InputManager;
  beforeEach(() => { im = new InputManager(); });

  it('accumulates and drains look deltas', () => {
    im.addLook(3, -2);
    im.addLook(1, 1);
    expect(im.consumeLook()).toEqual({ dx: 4, dy: -1 });
    expect(im.consumeLook()).toEqual({ dx: 0, dy: 0 });
  });

  it('accumulates and drains wheel steps', () => {
    im.addWheel(1);
    im.addWheel(1);
    im.addWheel(-1);
    expect(im.consumeWheelSteps()).toBe(1);
    expect(im.consumeWheelSteps()).toBe(0);
  });

  it('records lastLookMs when a look delta arrives', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1234);
    im.addLook(1, 0);
    expect(im.lastLookMs).toBe(1234);
    vi.restoreAllMocks();
  });

  it('reports not locked before any pointer is attached', () => {
    expect(im.isPointerLocked()).toBe(false);
  });
});

// ── Keyboard + pointer lock, using a minimal fake DOM ──────────────────────────
// The `unit` vitest project runs in node, so window/document do not exist.
// A tiny EventTarget stand-in is enough to exercise attach/detach and the
// pointer-lock state machine without pulling in jsdom.

type FakeEvent = Record<string, unknown>;

class FakeTarget {
  private listeners = new Map<string, Set<(e: FakeEvent) => void>>();
  addEventListener(type: string, fn: (e: FakeEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: (e: FakeEvent) => void) {
    this.listeners.get(type)?.delete(fn);
  }
  dispatch(type: string, event: FakeEvent = {}) {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

class FakeCanvas extends FakeTarget {
  requestPointerLock = vi.fn();
}

describe('InputManager: keyboard via a fake window', () => {
  let im: InputManager;
  let win: FakeTarget;

  beforeEach(() => {
    im = new InputManager();
    win = new FakeTarget();
    vi.stubGlobal('window', win);
  });

  afterEach(() => {
    im.detach();
    vi.unstubAllGlobals();
  });

  it('tracks held keys and one-shot presses, cleared by flush', () => {
    im.attach();
    win.dispatch('keydown', { code: 'KeyW', preventDefault: () => {} });
    let s = im.getState(false);
    expect(s.up).toBe(true);
    expect(s.enter).toBe(false);

    win.dispatch('keydown', { code: 'KeyF', preventDefault: () => {} });
    s = im.getState(false);
    expect(s.enter).toBe(true); // wasJustPressed
    im.flush();
    s = im.getState(false);
    expect(s.enter).toBe(false); // one-shot consumed
    expect(s.up).toBe(true); // held key persists

    win.dispatch('keyup', { code: 'KeyW' });
    expect(im.getState(false).up).toBe(false);
  });

  it('is idempotent: a second attach does not double-register listeners', () => {
    im.attach();
    im.attach();
    expect(win.listenerCount('keydown')).toBe(1);
  });

  it('detach removes listeners and clears held keys', () => {
    im.attach();
    win.dispatch('keydown', { code: 'KeyW', preventDefault: () => {} });
    im.detach();
    expect(win.listenerCount('keydown')).toBe(0);
    // A stray dispatch after detach must not resurrect state.
    win.dispatch('keydown', { code: 'KeyA', preventDefault: () => {} });
    expect(im.getState(false).left).toBe(false);
  });

  it('detach on an unattached manager is a no-op', () => {
    expect(() => im.detach()).not.toThrow();
  });
});

describe('InputManager: pointer lock state machine via a fake document/canvas', () => {
  let im: InputManager;
  let doc: FakeTarget & { pointerLockElement: FakeCanvas | null; exitPointerLock: () => void };
  let canvas: FakeCanvas;

  beforeEach(() => {
    im = new InputManager();
    canvas = new FakeCanvas();
    doc = Object.assign(new FakeTarget(), {
      pointerLockElement: null as FakeCanvas | null,
      exitPointerLock: vi.fn(() => {
        doc.pointerLockElement = null;
        doc.dispatch('pointerlockchange');
      }),
    });
    vi.stubGlobal('document', doc);
  });

  afterEach(() => {
    im.detachPointer();
    vi.unstubAllGlobals();
  });

  it('a second attach to the same canvas is a no-op', () => {
    im.attachPointer(canvas as unknown as HTMLElement);
    im.attachPointer(canvas as unknown as HTMLElement);
    expect(canvas.listenerCount('mousedown')).toBe(1);
  });

  it('re-attaching to a different canvas detaches the old one first', () => {
    im.attachPointer(canvas as unknown as HTMLElement);
    const canvas2 = new FakeCanvas();
    im.attachPointer(canvas2 as unknown as HTMLElement);
    expect(canvas.listenerCount('mousedown')).toBe(0);
    expect(canvas2.listenerCount('mousedown')).toBe(1);
  });

  it('mousedown requests pointer lock', () => {
    im.attachPointer(canvas as unknown as HTMLElement);
    canvas.dispatch('mousedown', { button: 0 });
    expect(canvas.requestPointerLock).toHaveBeenCalled();
  });

  it('ignores non-primary mouse buttons', () => {
    im.attachPointer(canvas as unknown as HTMLElement);
    canvas.dispatch('mousedown', { button: 2 });
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
  });

  it('tracks the locked flag from pointerlockchange', () => {
    im.attachPointer(canvas as unknown as HTMLElement);
    doc.pointerLockElement = canvas;
    doc.dispatch('pointerlockchange');
    expect(im.isPointerLocked()).toBe(true);

    doc.pointerLockElement = null;
    doc.dispatch('pointerlockchange');
    expect(im.isPointerLocked()).toBe(false);
  });

  it('mousemove only accumulates look while locked or dragging', () => {
    im.attachPointer(canvas as unknown as HTMLElement);
    doc.dispatch('mousemove', { movementX: 5, movementY: 5 });
    expect(im.consumeLook()).toEqual({ dx: 0, dy: 0 }); // not locked, not dragging

    doc.pointerLockElement = canvas;
    doc.dispatch('pointerlockchange');
    doc.dispatch('mousemove', { movementX: 5, movementY: -3 });
    expect(im.consumeLook()).toEqual({ dx: 5, dy: -3 });
  });

  it('wheel events preventDefault and accumulate signed steps', () => {
    im.attachPointer(canvas as unknown as HTMLElement);
    const prevented: boolean[] = [];
    canvas.dispatch('wheel', { deltaY: 10, preventDefault: () => prevented.push(true) });
    canvas.dispatch('wheel', { deltaY: -5, preventDefault: () => prevented.push(true) });
    expect(prevented).toEqual([true, true]);
    expect(im.consumeWheelSteps()).toBe(0); // +1 then -1
  });

  it('distinguishes a lock we released ourselves from the browser dropping it', () => {
    im.attachPointer(canvas as unknown as HTMLElement);
    doc.pointerLockElement = canvas;
    doc.dispatch('pointerlockchange');

    // Simulate the player pressing Esc: the browser clears the lock without
    // InputManager having called releasePointerLock() itself.
    doc.pointerLockElement = null;
    doc.dispatch('pointerlockchange');
    expect(im.consumeReleasedByUs()).toBe(false);

    // Now our own code releases it.
    doc.pointerLockElement = canvas;
    doc.dispatch('pointerlockchange');
    im.releasePointerLock();
    expect(im.consumeReleasedByUs()).toBe(true);
    // Reading it clears the flag.
    expect(im.consumeReleasedByUs()).toBe(false);
  });

  it('detachPointer removes every listener and releases the lock', () => {
    im.attachPointer(canvas as unknown as HTMLElement);
    doc.pointerLockElement = canvas;
    doc.dispatch('pointerlockchange');

    im.detachPointer();
    expect(canvas.listenerCount('mousedown')).toBe(0);
    expect(canvas.listenerCount('wheel')).toBe(0);
    expect(doc.listenerCount('mousemove')).toBe(0);
    expect(doc.listenerCount('pointerlockchange')).toBe(0);
    expect(im.isPointerLocked()).toBe(false);
  });

  it('detachPointer on an unattached manager is a no-op', () => {
    expect(() => im.detachPointer()).not.toThrow();
  });
});
