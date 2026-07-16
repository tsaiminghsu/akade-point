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
  };
  private touchOneShots: Set<string> = new Set();

  constructor() {
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
  }

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown(e: KeyboardEvent): void {
    const key = e.code;
    if (!this.keys.has(key)) {
      this.justPressed.add(key);
    }
    this.keys.add(key);

    // Prevent page scroll on game keys
    if (
      ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)
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

  // ── Touch / virtual input API ─────────────────────────────────────────────

  setVirtualMove(x: number, y: number): void {
    const DEAD = 0.25;
    this.touchState.up    = y < -DEAD;
    this.touchState.down  = y >  DEAD;
    this.touchState.left  = x < -DEAD;
    this.touchState.right = x >  DEAD;
  }

  setTouchButton(
    name: 'droneThrottleUp' | 'droneThrottleDown' | 'droneYawLeft' | 'droneYawRight' | 'brake' | 'boost',
    pressed: boolean,
  ): void {
    this.touchState[name] = pressed;
  }

  triggerTouchAction(name: 'enter' | 'phone' | 'mapToggle' | 'respawn' | 'fpvToggle'): void {
    this.touchOneShots.add(name);
  }

  getState(isDriving: boolean): InputState {
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
    };
  }
}
