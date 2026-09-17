export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  enter: boolean;         // F key
  phone: boolean;         // P key
  mapToggle: boolean;     // M key
  droneThrottleUp: boolean;   // Space or E
  droneThrottleDown: boolean; // Q
  droneYawLeft: boolean;  // Z
  droneYawRight: boolean; // X
  brake: boolean;         // Space while driving
  // Race mode
  boost: boolean;         // Shift — held, speed burst
  respawn: boolean;       // R — one-shot, respawn at last gate
  fpvToggle: boolean;     // Tab — one-shot, toggle FPV camera
  // On-foot movement
  jump: boolean;          // Space — one-shot, on foot only
  sprint: boolean;        // Shift — held
  // Missions
  interact: boolean;      // E — one-shot, ground only (E is drone throttle in the air)
  cancelMission: boolean; // X — one-shot, ground only (X is drone yaw in the air)
  // Driving
  autopilot: boolean;     // C — one-shot, toggle self-driving to the active waypoint
}

/** Movement axes: +y = forward (away from the camera), +x = right. */
export interface MoveAxes {
  x: number;
  y: number;
}

export class InputManager {
  private keys: Set<string> = new Set();
  private justPressed: Set<string> = new Set();
  private justReleased: Set<string> = new Set();
  private pendingConsumed: Set<string> = new Set();
  private touchState = {
    up: false, down: false, left: false, right: false,
    droneThrottleUp: false, droneThrottleDown: false,
    droneYawLeft: false, droneYawRight: false,
    brake: false,
    boost: false,
    sprint: false,
  };
  private touchOneShots: Set<string> = new Set();

  // Analog joystick value, kept alongside the boolean quantisation so on-foot
  // movement can be smooth while vehicles keep their digital steering.
  private virtualX = 0;
  private virtualY = 0;

  // ── Look / zoom accumulators ──────────────────────────────────────────────
  private lookDX = 0;
  private lookDY = 0;
  private wheelSteps = 0;
  private locked = false;
  private dragging = false;
  lastLookMs = 0;

  private canvas: HTMLElement | null = null;
  private attached = false;
  private pointerAttached = false;

  constructor() {
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onLockChange = this.onLockChange.bind(this);
    this.onLockError = this.onLockError.bind(this);
  }

  // Idempotent: the engine is a module-level singleton that survives HMR, so a
  // double attach would otherwise leak duplicate listeners.
  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.keys.clear();
  }

  private onKeyDown(e: KeyboardEvent): void {
    const key = e.code;
    if (!this.keys.has(key)) {
      this.justPressed.add(key);
    }
    this.keys.add(key);

    // Prevent page scroll / focus loss on game keys
    if (
      ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(key)
    ) {
      e.preventDefault();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const key = e.code;
    this.keys.delete(key);
    this.justReleased.add(key);
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasJustPressed(code: string): boolean {
    return this.justPressed.has(code) && !this.pendingConsumed.has(code);
  }

  consume(code: string): void {
    this.pendingConsumed.add(code);
  }

  // Call at end of each game tick to flush one-shot events
  flush(): void {
    this.justPressed.clear();
    this.justReleased.clear();
    this.pendingConsumed.clear();
    this.touchOneShots.clear();
  }

  // ── Pointer lock / mouse look ─────────────────────────────────────────────

  /**
   * Wire mouse look to the WebGL canvas. Clicking requests pointer lock; if the
   * browser refuses (or has no pointer lock, e.g. iPadOS Safari) we fall back to
   * drag-to-look while the button is held.
   */
  attachPointer(canvas: HTMLElement): void {
    if (this.pointerAttached) {
      if (this.canvas === canvas) return;
      this.detachPointer();
    }
    this.canvas = canvas;
    this.pointerAttached = true;
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
  }

  detachPointer(): void {
    if (!this.pointerAttached) return;
    this.pointerAttached = false;
    const canvas = this.canvas;
    if (canvas) {
      canvas.removeEventListener('mousedown', this.onMouseDown);
      canvas.removeEventListener('wheel', this.onWheel);
    }
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    this.releasePointerLock();
    this.canvas = null;
    this.dragging = false;
    this.locked = false;
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.dragging = true;
    if (!this.locked && this.canvas?.requestPointerLock) {
      // Chrome returns a promise and rejects during the ~1s cooldown after Esc;
      // Firefox/Safari return undefined. Swallow either way.
      try {
        const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        r?.catch?.(() => {});
      } catch {
        /* pointer lock unavailable — drag fallback covers it */
      }
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.locked && !this.dragging) return;
    this.lookDX += e.movementX;
    this.lookDY += e.movementY;
    this.lastLookMs = performance.now();
  }

  private onMouseUp(): void {
    this.dragging = false;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.wheelSteps += Math.sign(e.deltaY);
  }

  private onLockChange(): void {
    this.locked = document.pointerLockElement === this.canvas;
  }

  private onLockError(): void {
    this.locked = false;
  }

  releasePointerLock(): void {
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  isPointerLocked(): boolean {
    return this.locked;
  }

  /** Feed look delta from a touch drag (mobile look zone). */
  addLook(dx: number, dy: number): void {
    this.lookDX += dx;
    this.lookDY += dy;
    this.lastLookMs = performance.now();
  }

  /** Feed a discrete zoom step from a non-wheel source. */
  addWheel(steps: number): void {
    this.wheelSteps += steps;
  }

  /** Read and clear the accumulated look delta. */
  consumeLook(): { dx: number; dy: number } {
    const dx = this.lookDX;
    const dy = this.lookDY;
    this.lookDX = 0;
    this.lookDY = 0;
    return { dx, dy };
  }

  /** Read and clear the accumulated zoom notches. */
  consumeWheelSteps(): number {
    const w = this.wheelSteps;
    this.wheelSteps = 0;
    return w;
  }

  // ── Touch / virtual input API ─────────────────────────────────────────────

  setVirtualMove(x: number, y: number): void {
    const DEAD = 0.25;
    this.virtualX = x;
    this.virtualY = y;
    this.touchState.up    = y < -DEAD;
    this.touchState.down  = y >  DEAD;
    this.touchState.left  = x < -DEAD;
    this.touchState.right = x >  DEAD;
  }

  setTouchButton(
    name: 'droneThrottleUp' | 'droneThrottleDown' | 'droneYawLeft' | 'droneYawRight' | 'brake' | 'boost' | 'sprint',
    pressed: boolean,
  ): void {
    this.touchState[name] = pressed;
  }

  triggerTouchAction(
    name: 'enter' | 'phone' | 'mapToggle' | 'respawn' | 'fpvToggle' | 'jump' | 'interact' | 'cancelMission' | 'autopilot',
  ): void {
    this.touchOneShots.add(name);
  }

  /**
   * Analog movement axes for camera-relative on-foot control.
   * Keyboard wins when pressed; otherwise the joystick supplies a smooth value.
   * The result is clamped to unit length so diagonals are not faster.
   */
  getMoveAxes(): MoveAxes {
    let x = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0)
          - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    let y = (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0)
          - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);

    if (x === 0 && y === 0) {
      const mag = Math.hypot(this.virtualX, this.virtualY);
      if (mag > 0.2) {
        x = this.virtualX;
        // Joystick y is screen-space (up is negative); forward is +y here.
        y = -this.virtualY;
      }
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  getState(isDriving: boolean, isOnFoot = false, isAirborne = false): InputState {
    const ts = this.touchState;
    return {
      up:                this.isDown('KeyW') || this.isDown('ArrowUp')    || ts.up,
      down:              this.isDown('KeyS') || this.isDown('ArrowDown')  || ts.down,
      left:              this.isDown('KeyA') || this.isDown('ArrowLeft')  || ts.left,
      right:             this.isDown('KeyD') || this.isDown('ArrowRight') || ts.right,
      enter:             this.wasJustPressed('KeyF') || this.touchOneShots.has('enter'),
      phone:             this.wasJustPressed('KeyP') || this.touchOneShots.has('phone'),
      mapToggle:         this.wasJustPressed('KeyM') || this.touchOneShots.has('mapToggle'),
      droneThrottleUp:   this.isDown('Space') || this.isDown('KeyE') || ts.droneThrottleUp,
      droneThrottleDown: this.isDown('KeyQ')  || ts.droneThrottleDown,
      droneYawLeft:      this.isDown('KeyZ')  || ts.droneYawLeft,
      droneYawRight:     this.isDown('KeyX')  || ts.droneYawRight,
      brake:             isDriving && (this.isDown('Space') || ts.brake),
      boost:             this.isDown('ShiftLeft') || this.isDown('ShiftRight') || ts.boost,
      respawn:           this.wasJustPressed('KeyR') || this.touchOneShots.has('respawn'),
      fpvToggle:         this.wasJustPressed('Tab')  || this.touchOneShots.has('fpvToggle'),
      // Space is handbrake in a car and throttle in the air, so jumping is
      // restricted to on-foot; there is no conflict.
      jump:              isOnFoot && (this.wasJustPressed('Space') || this.touchOneShots.has('jump')),
      sprint:            this.isDown('ShiftLeft') || this.isDown('ShiftRight') || ts.sprint,
      // E and X stay bound to drone throttle / yaw while airborne.
      interact:          !isAirborne && (this.wasJustPressed('KeyE') || this.touchOneShots.has('interact')),
      cancelMission:     !isAirborne && (this.wasJustPressed('KeyX') || this.touchOneShots.has('cancelMission')),
      autopilot:         this.wasJustPressed('KeyC') || this.touchOneShots.has('autopilot'),
    };
  }
}
