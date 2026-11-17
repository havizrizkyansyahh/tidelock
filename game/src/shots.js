// The `?shot=` states: each one flies the real simulation forward with a pilot, so every screenshot
// is a frame the game itself produced — same rules, same collision, same scoring. Nothing here
// poses the game; the pilot simply aims and the dive happens.
import { createRun, start, step, pause, surface, autopilotInput, nextBeacon } from './core/run.js';
import { fireSonar } from './core/run.js';
import { BEACON_DEPTHS } from './core/trench.js';

const STEP = 1 / 60;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A pilot that flies toward `aim`, fires the sonar at threats, and stays off the walls. */
export function pilotInput(run, aim = null) {
  let input;
  if (aim === null) {
    input = autopilotInput(run);
  } else {
    const dx = aim.x - run.skiff.x;
    const dy = aim.y - run.skiff.y;
    const dz = aim.z - run.skiff.z;
    const desiredYaw = Math.atan2(-dx, -dz);
    const desiredPitch = Math.atan2(dy, Math.max(4, Math.hypot(dx, dz)));
    input = {
      thrust: 1,
      strafe: 0,
      lift: 0,
      boost: Math.abs(dz) > 24 && run.air > 45,
      lookYaw: clamp((desiredYaw - run.skiff.yaw) * 3.2, -2.2, 2.2),
      lookPitch: clamp((desiredPitch - run.skiff.pitch) * 3.2, -1.6, 1.6),
    };
    // Keep away from the wall when the aim sits near it.
    const off = Math.hypot(run.skiff.x, run.skiff.y / 0.8);
    if (off > run.radius - 2.2) {
      input.lookYaw += -Math.sign(run.skiff.x || 1) * 0.8;
      input.lookPitch += -Math.sign(run.skiff.y || 1) * 0.5;
    }
  }

  // The sonar is part of playing well: use it when a drifter is close enough to matter.
  const threat = run.drifters.some((d) => Math.hypot(d.x - run.skiff.x, d.y - run.skiff.y, d.z - run.skiff.z) < 10);
  if (threat && run.sonar > 0) fireSonar(run);
  return input;
}

function fly(run, seconds, aim = null) {
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i < frames; i += 1) {
    if (run.state !== 'playing') break;
    step(run, pilotInput(run, aim), STEP);
    run.events.length = 0;
  }
  return run;
}

function flyToBeacon(run, depth, seconds = 120) {
  const frames = Math.round(seconds / STEP);
  for (let i = 0; i < frames; i += 1) {
    if (run.state !== 'playing') break;
    const aim = { x: 0, y: 0, z: -depth };
    const input = pilotInput(run, aim);
    // Ease off as the ring fills the lens, so the frame is the decision, not a blur.
    input.thrust = run.depth > depth - 22 ? 0.25 : 1;
    step(run, input, STEP);
    run.events.length = 0;
    if (run.inBeacon) break;
  }
  return run;
}

/**
 * Build the run for a named shot: title, play, beacon, result or paused. Each seed is retried only
 * when a dive genuinely ends before the moment the shot is named for — never by forcing state.
 */
export function stageShot(name, seeds = [9, 21, 33, 45]) {
  const build = () => {
    const run = createRun({ seed: seeds[0], best: 0 });
    start(run);
    return run;
  };

  if (name === 'title') return fly(build(), 7);

  if (name === 'play') {
    for (const seed of seeds) {
      const run = createRun({ seed, best: 0 });
      start(run);
      fly(run, 38);
      if (run.state === 'playing' && run.depth > 260) return run;
    }
    return fly(build(), 30);
  }

  if (name === 'beacon') {
    const depth = BEACON_DEPTHS[1];
    for (const seed of seeds) {
      const run = createRun({ seed, best: 0 });
      start(run);
      flyToBeacon(run, depth);
      if (run.state === 'playing' && run.inBeacon) return run;
    }
    const run = build();
    return flyToBeacon(run, depth);
  }

  if (name === 'paused') {
    const run = fly(build(), 24);
    pause(run);
    return run;
  }

  // result: play until the run genuinely ends, one way or the other.
  for (const seed of seeds) {
    const run = createRun({ seed, best: 0 });
    start(run);
    for (let i = 0; i < 60 * 150 && run.state === 'playing'; i += 1) {
      step(run, pilotInput(run), STEP);
      run.events.length = 0;
    }
    if (run.state === 'result') return run;
  }
  const run = build();
  for (let i = 0; i < 60 * 150 && run.state === 'playing'; i += 1) {
    step(run, pilotInput(run), STEP);
    run.events.length = 0;
  }
  return run;
}

export { surface, nextBeacon };