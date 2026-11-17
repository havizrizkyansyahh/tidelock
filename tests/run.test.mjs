// The simulation's promises, written before game/src/core/run.js and skiff.js exist: air that
// runs out, hull that breaks, spores that pay and refill, a sonar that charges and stuns, a
// beacon that can be surfaced at, a state machine that only moves where it should, and a dive
// that replays identically from its seed.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRun,
  start,
  pause,
  resume,
  restart,
  step,
  fireSonar,
  surface,
  autopilotInput,
} from '../game/src/core/run.js';
import { SKIFF_RADIUS } from '../game/src/core/skiff.js';
import { SECTION_LENGTH, BEACON_DEPTHS } from '../game/src/core/trench.js';
import { AIR_CAPACITY, HULL_CAPACITY, SPORE_AIR, SONAR_MAX, SONAR_RECHARGE, SONAR_RADIUS } from '../game/src/core/rules.js';

const IDLE = { thrust: 0, strafe: 0, lift: 0, boost: false, lookYaw: 0, lookPitch: 0 };
const RUN_IN = { ...IDLE, thrust: 1 };

/** A run with its generated world cleared, so a test can place exactly what it means to test. */
function bareRun(seed = 11) {
  const run = createRun({ seed });
  start(run);
  run.spores.length = 0;
  run.drifters.length = 0;
  run.rocks.length = 0;
  run.events.length = 0;
  return run;
}

/** Steps the run in small slices, like the frame loop does, and returns the last event list. */
function runFor(run, seconds, input = IDLE, dt = 1 / 60) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i += 1) step(run, input, dt);
  return run.events;
}

const types = (events) => events.map((e) => e.type);

test('a new run starts at the title, and starting hands over a full tank and hull', () => {
  const run = createRun({ seed: 5 });
  assert.equal(run.state, 'title');
  start(run);
  assert.equal(run.state, 'playing');
  assert.equal(run.air, AIR_CAPACITY);
  assert.equal(run.hull, HULL_CAPACITY);
  assert.equal(run.depth, 0);
});

test('air drains with the clock: ten seconds costs twenty-two breaths', () => {
  const run = bareRun();
  runFor(run, 10);
  assert.ok(Math.abs(run.air - 78) < 1.5, `air ${run.air}`);
  assert.equal(run.state, 'playing');
});

test('air that reaches zero ends the run as lost', () => {
  const run = bareRun();
  run.air = 0.2;
  runFor(run, 1);
  assert.equal(run.state, 'result');
  assert.equal(run.outcome, 'lost');
  assert.equal(run.reason, 'air');
});

test('thrust carries the skiff down the trench; coasting slows it', () => {
  const run = bareRun();
  runFor(run, 3, RUN_IN);
  const after = run.depth;
  assert.ok(after > 10, `depth ${after}`);
  const speedAtThrust = run.skiff.speed;
  runFor(run, 3, IDLE);
  assert.ok(run.skiff.speed < speedAtThrust, 'drag must slow a coasting skiff');
  assert.ok(run.depth > after);
});

test('the walls keep the skiff inside the water without hurting it', () => {
  const run = bareRun();
  runFor(run, 4, { ...IDLE, strafe: -1 });
  const off = Math.hypot(run.skiff.x, run.skiff.y / 0.8);
  assert.ok(off <= run.radius + 0.001, `skiff at ${off} of ${run.radius}`);
  assert.equal(run.hull, HULL_CAPACITY);
});

test('a spore cluster scores, tops up air and disappears once', () => {
  const run = bareRun();
  run.air = 60;
  run.spores.push({ id: 'test', x: run.skiff.x, y: run.skiff.y, z: run.skiff.z, air: SPORE_AIR, points: 25 });
  const events = runFor(run, 0.2);
  assert.ok(types(events).includes('spore'));
  assert.equal(run.spores.length, 0);
  assert.equal(run.sporePoints, 25);
  assert.ok(run.air > 60 + SPORE_AIR - 1, `air ${run.air}`);
});

test('spores taken inside the window chain the multiplier, and it decays after it', () => {
  const run = bareRun();
  const drop = () => run.spores.push({ id: `s${run.sporePoints}`, x: run.skiff.x, y: run.skiff.y, z: run.skiff.z, air: SPORE_AIR, points: 25 });
  drop();
  runFor(run, 0.1);
  drop();
  runFor(run, 0.1);
  assert.equal(run.sporePoints, 25 + 50);
  assert.equal(run.combo, 2, 'the second spore in the chain is worth double');
  runFor(run, 3);
  assert.equal(run.combo, 1);
  drop();
  runFor(run, 0.1);
  assert.equal(run.sporePoints, 75 + 25);
});

test('the sonar spends a charge, stuns what is near and comes back one charge at a time', () => {
  const run = bareRun();
  run.drifters.push({ id: 'd', x: 4, y: 0, z: run.skiff.z - 2, vx: 0, vy: 0, vz: 0, stun: 0, bite: 0, phase: 0 });
  assert.equal(run.sonar, SONAR_MAX);
  assert.equal(fireSonar(run), true);
  assert.equal(run.sonar, SONAR_MAX - 1);
  assert.ok(run.drifters[0].stun > 2, 'a drifter inside the pulse is stunned');
  assert.ok(run.reveal > 0);
  const stunnedAt = { x: run.drifters[0].x, z: run.drifters[0].z };
  runFor(run, 0.5);
  assert.ok(Math.hypot(run.drifters[0].x - stunnedAt.x, run.drifters[0].z - stunnedAt.z) < 0.15, 'a stunned drifter holds still');
  runFor(run, SONAR_RECHARGE + 0.2);
  assert.equal(run.sonar, SONAR_MAX);
  run.sonar = 0;
  assert.equal(fireSonar(run), false, 'an empty sonar cannot fire');
});

test('a drifter outside the pulse radius is not stunned', () => {
  const run = bareRun();
  run.drifters.push({ id: 'far', x: 0, y: 0, z: run.skiff.z - SONAR_RADIUS - 6, vx: 0, vy: 0, vz: 0, stun: 0, bite: 0, phase: 0 });
  fireSonar(run);
  assert.equal(run.drifters[0].stun, 0);
});

test('rock costs hull once, and the immunity window holds off a second hit', () => {
  const run = bareRun();
  run.rocks.push({ id: 'r', x: 0, y: 0, z: -3, girth: 1.2, gap: 3.4 });
  runFor(run, 0.6, RUN_IN);
  assert.equal(run.hull, HULL_CAPACITY - 18);
  const after = run.hull;
  runFor(run, 0.5);
  assert.equal(run.hull, after, 'one wall must not hit twice inside the window');
});

test('a drifter that stays in contact bites on a rhythm, and hull zero ends the run', () => {
  const run = bareRun();
  run.drifters.push({ id: 'd', x: 0, y: 0, z: run.skiff.z, vx: 0, vy: 0, vz: 0, stun: 0, bite: 0, phase: 0 });
  runFor(run, 1.5);
  assert.ok(run.hull <= HULL_CAPACITY - 24, `hull ${run.hull}`);
  run.hull = 6;
  runFor(run, 1.5);
  assert.equal(run.state, 'result');
  assert.equal(run.reason, 'hull');
});

test('a beacon pays air and hull once, and surfacing there wins the run', () => {
  const run = bareRun();
  const beacon = BEACON_DEPTHS[0];
  run.skiff.z = -beacon;
  run.depth = beacon;
  run.air = 50;
  run.hull = 70;
  const events = runFor(run, 0.2);
  assert.ok(types(events).includes('beacon'));
  assert.ok(run.air > 50 && run.hull > 70);
  assert.equal(run.beaconsPassed, 1);
  runFor(run, 0.2);
  assert.equal(run.beaconsPassed, 1, 'a beacon pays once');
  assert.equal(run.inBeacon, true);
  assert.equal(surface(run), true);
  assert.equal(run.state, 'result');
  assert.equal(run.outcome, 'surfaced');
  assert.ok(run.score.surface > 0);
  assert.ok(run.best >= run.score.total);
});

test('surfacing away from a beacon is refused', () => {
  const run = bareRun();
  run.skiff.z = -12;
  run.depth = 12;
  assert.equal(surface(run), false);
  assert.equal(run.state, 'playing');
});

test('pause freezes the dive exactly, and resume continues it', () => {
  const run = bareRun();
  runFor(run, 1, RUN_IN);
  const frozen = { z: run.skiff.z, air: run.air, depth: run.depth };
  pause(run);
  assert.equal(run.state, 'paused');
  runFor(run, 5, RUN_IN);
  assert.deepEqual({ z: run.skiff.z, air: run.air, depth: run.depth }, frozen);
  resume(run);
  runFor(run, 1, RUN_IN);
  assert.ok(run.skiff.z < frozen.z);
  assert.ok(run.air < frozen.air);
});

test('restart begins a fresh dive and keeps the best score', () => {
  const run = bareRun();
  run.score = { depth: 0, spores: 0, beacons: 0, surface: 0, total: 999 };
  run.best = 999;
  run.air = 10;
  runFor(run, 2);
  restart(run);
  assert.equal(run.state, 'playing');
  assert.equal(run.air, AIR_CAPACITY);
  assert.equal(run.depth, 0);
  assert.equal(run.sporePoints, 0);
  assert.equal(run.best, 999);
});

test('the same seed and the same stick replay the same dive, step for step', () => {
  const script = (i) => ({ ...IDLE, thrust: 1, strafe: Math.sin(i / 40), lookYaw: Math.cos(i / 70) * 0.4 });
  const play = (seed) => {
    const run = createRun({ seed });
    start(run);
    for (let i = 0; i < 900; i += 1) step(run, script(i), 1 / 60);
    return {
      depth: +run.depth.toFixed(6),
      air: +run.air.toFixed(6),
      hull: run.hull,
      spores: run.sporePoints,
      x: +run.skiff.x.toFixed(6),
      y: +run.skiff.y.toFixed(6),
      z: +run.skiff.z.toFixed(6),
      drifters: run.drifters.length,
    };
  };
  assert.deepEqual(play(42), play(42));
  assert.notDeepEqual(play(42), play(43));
});

test('the autopilot flies forward, hunts spores and keeps clear of rock', () => {
  const run = createRun({ seed: 3 });
  start(run);
  let rockHits = 0;
  for (let i = 0; i < 3600; i += 1) {
    step(run, autopilotInput(run), 1 / 60);
    rockHits += run.events.filter((e) => e.type === 'rock').length;
    run.events.length = 0;
  }
  assert.ok(run.depth > 120, `autopilot only reached ${run.depth}`);
  assert.ok(run.sporePoints > 0, 'autopilot collected nothing');
  assert.ok(rockHits < 4, `autopilot hit rock ${rockHits} times`);
});

test('sections stream in ahead of the skiff and behind it are dropped', () => {
  const run = bareRun();
  runFor(run, 8, RUN_IN);
  assert.ok(run.loadedTo >= Math.floor(run.depth / SECTION_LENGTH) + 1, 'the world must exist ahead');
  assert.ok(run.loadedFrom >= 0);
  assert.ok(run.spores.every((s) => s.z < -run.depth + 120), 'stale spores are dropped');
});

test('the generated world actually carries rock, spores and drifters into the dive', () => {
  const run = createRun({ seed: 3 });
  start(run);
  for (let i = 0; i < 1800; i += 1) step(run, autopilotInput(run), 1 / 60);
  assert.ok(run.depth > 200, `depth ${run.depth}`);
  assert.ok(run.rocks.length > 0, 'no rock column was ever loaded');
  for (const rock of run.rocks) {
    assert.ok(Number.isFinite(rock.x) && Number.isFinite(rock.y), `rock ${rock.id} has no position`);
    assert.ok(Math.hypot(rock.x, rock.y / 0.8) <= run.radius + 0.001, `rock ${rock.id} sits outside the trench`);
  }
});