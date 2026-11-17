// Input contract: the title card promises "W thrust · S brake · A D strafe · yaw without the mouse",
// so these tests pin the steering frame the rest of the game relies on.
import assert from 'node:assert/strict';
import test from 'node:test';
import { Input } from '../game/src/input.js';

function harness() {
  const listeners = (map) => (type, fn) => {
    const list = map.get(type) ?? [];
    map.set(type, list);
    list.push(fn);
  };
  const winHandlers = new Map(), docHandlers = new Map(), canvasHandlers = new Map();
  const win = { addEventListener: listeners(winHandlers) };
  const doc = { addEventListener: listeners(docHandlers), pointerLockElement: null, exitPointerLock() {} };
  const canvas = { addEventListener: listeners(canvasHandlers), requestPointerLock() {} };
  globalThis.window = win;
  globalThis.document = doc;
  const fire = (map, type, event = {}) => (map.get(type) ?? []).forEach((fn) => fn(event));
  const input = new Input(canvas);
  return {
    input,
    keyDown: (code) => fire(winHandlers, 'keydown', { code, repeat: false, preventDefault() {} }),
    keyUp: (code) => fire(winHandlers, 'keyup', { code }),
    lock() { doc.pointerLockElement = canvas; fire(docHandlers, 'pointerlockchange'); },
  };
}

test('without pointer lock A and D turn the skiff', () => {
  const h = harness();
  h.keyDown('KeyA');
  const stick = h.input.readStick();
  assert.ok(stick.yawRate > 0, 'A should yaw left: ' + stick.yawRate);
  assert.equal(stick.strafe, 0, 'no strafe before the mouse takes the look');
});

test('with pointer lock A and D strafe, as the title card says', () => {
  const h = harness();
  h.lock();
  assert.equal(h.input.pointerLocked, true);
  h.keyDown('KeyD');
  const stick = h.input.readStick();
  assert.ok(stick.strafe > 0, 'D should strafe right under pointer lock: ' + stick.strafe);
});

test('a pressed action is delivered once and then clears', () => {
  const h = harness();
  h.input.press('start');
  assert.equal(h.input.takeAction('start'), true);
  assert.equal(h.input.takeAction('start'), false);
});