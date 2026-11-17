// Keyboard and pointer lock in one place. The rest of the game asks `readStick()` for a steering
// frame and `takeAction(name)` for the one-shot buttons, so no other module knows about events.

const KEYMAP = {
  KeyW: 'thrust', ArrowUp: 'thrust',
  KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'yawLeft',
  KeyD: 'yawRight',
  ArrowLeft: 'strafeLeft',
  ArrowRight: 'strafeRight',
  KeyR: 'noseUp',
  KeyF: 'noseDown',
  ShiftLeft: 'boost', ShiftRight: 'boost',
  Space: 'sonar',
  KeyE: 'surface',
  Escape: 'pause', KeyP: 'pause',
  Enter: 'start',
  KeyM: 'mute',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.actions = new Set();
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.pointerLocked = false;
    this.sensitivity = 0.0022;

    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space' || event.code === 'Tab') event.preventDefault();
      const action = KEYMAP[event.code];
      if (!action) return;
      if (!event.repeat) this.actions.add(action);
      this.held.add(action);
    });
    window.addEventListener('keyup', (event) => {
      const action = KEYMAP[event.code];
      if (action) this.held.delete(action);
    });
    window.addEventListener('blur', () => this.held.clear());

    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) this.actions.add('sonar');
      this.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
    window.addEventListener('mousemove', (event) => {
      if (!this.pointerLocked) return;
      this.lookYaw -= event.movementX * this.sensitivity;
      this.lookPitch -= event.movementY * this.sensitivity;
    });
  }

  lock() {
    if (!this.pointerLocked && this.canvas.requestPointerLock) {
      const asked = this.canvas.requestPointerLock();
      if (asked && typeof asked.catch === 'function') asked.catch(() => {});
    }
  }

  /** The steering frame for one tick: thrust, strafe, lift, boost and the two look rates. */
  readStick() {
    const held = this.held;
    const thrust = (held.has('thrust') ? 1 : 0) - (held.has('brake') ? 1 : 0);
    // Without pointer lock, A/D turn the skiff; with it, the mouse does, so A/D strafe instead.
    const strafe = this.pointerLocked
      ? ((held.has('strafeRight') || held.has('yawRight') ? 1 : 0)
        - (held.has('strafeLeft') || held.has('yawLeft') ? 1 : 0))
      : 0;
    // A keyboard turn is a rate in radians per second; a mouse move is an angle already turned.
    // They are reported apart so the loop can convert the mouse into a rate for this frame.
    const yawRate = this.pointerLocked
      ? (held.has('strafeLeft') ? 0.5 : 0) - (held.has('strafeRight') ? 0.5 : 0)
      : (held.has('yawLeft') ? 1.6 : 0) - (held.has('yawRight') ? 1.6 : 0);
    const lift = (held.has('noseUp') ? 1 : 0) - (held.has('noseDown') ? 1 : 0);
    const stick = {
      thrust,
      strafe,
      lift,
      boost: held.has('boost'),
      lookYaw: this.lookYaw,
      lookPitch: this.lookPitch,
      yawRate,
    };
    this.lookYaw = 0;
    this.lookPitch = 0;
    return stick;
  }

  /** True once per press, then forgotten. */
  takeAction(name) {
    if (!this.actions.has(name)) return false;
    this.actions.delete(name);
    return true;
  }

  /** Queue an action from a pointer gesture, so a click does what the matching key does. */
  press(name) {
    this.actions.add(name);
  }

  clearActions() {
    this.actions.clear();
  }
}