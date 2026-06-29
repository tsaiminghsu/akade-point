export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  enter: boolean;         // E key
  phone: boolean;         // P key
  mapToggle: boolean;     // M key
  droneThrottleUp: boolean;   // Space
  droneThrottleDown: boolean; // F
  droneYawLeft: boolean;  // Z
  droneYawRight: boolean; // X
  brake: boolean;         // Space while driving
}

export class InputManager {
  private keys: Set<string> = new Set();
  private justPressed: Set<string> = new Set();
  private justReleased: Set<string> = new Set();
  private pendingConsumed: Set<string> = new Set();

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
  }

  getState(isDriving: boolean): InputState {
    return {
      up: this.isDown('KeyW') || this.isDown('ArrowUp'),
      down: this.isDown('KeyS') || this.isDown('ArrowDown'),
      left: this.isDown('KeyA') || this.isDown('ArrowLeft'),
      right: this.isDown('KeyD') || this.isDown('ArrowRight'),
      enter: this.wasJustPressed('KeyF'),
      phone: this.wasJustPressed('KeyP'),
      mapToggle: this.wasJustPressed('KeyM'),
      droneThrottleUp: this.isDown('Space') || this.isDown('KeyE'),
      droneThrottleDown: this.isDown('KeyQ'),
      droneYawLeft: this.isDown('KeyZ'),
      droneYawRight: this.isDown('KeyX'),
      brake: isDriving && this.isDown('Space'),
    };
  }
}
