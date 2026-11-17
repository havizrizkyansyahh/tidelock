// One dive, end to end: air, hull, sonar, spores, drifters, rock, beacons, the state machine and
// the score. Pure simulation — the view and the HUD only read this object, so the whole game can
// be played in a test at a thousand frames a second.
import {
  AIR_CAPACITY,
  HULL_CAPACITY,
  BEACON_AIR,
  BEACON_HULL,
  ROCK_DAMAGE,
  ROCK_INVULNERABLE,
  DRIFTER_BITE,
  DRIFTER_BITE_INTERVAL,
  SONAR_MAX,
  SONAR_RECHARGE,
  SONAR_RADIUS,
  SONAR_STUN,
  SONAR_REVEAL,
  COMBO_WINDOW,
  airAfter,
  comboStep,
  scoreOf,
} from './rules.js';
import { createSkiff, stepSkiff, SKIFF_RADIUS } from './skiff.js';
import { SECTION_LENGTH, BEACON_DEPTHS, sectionFor, trenchRadiusAt } from './trench.js';
import { makeRng } from './rng.js';

/** The simulation's fixed slice: the dive is deterministic whatever the frame rate does. */
export const FIXED_STEP = 1 / 120;
/** A frame may never hand the simulation more than this, so a stall cannot teleport the skiff. */
const MAX_FRAME = 0.25;

/** Reach at which a spore cluster is taken. */
const PICKUP_RADIUS = 1.4;
/** A drifter has to be this close to hurt. */
const BITE_RADIUS = 1.6;
/** Distance ahead of the skiff that is kept generated. */
const SECTIONS_AHEAD = 4;
/** Distance behind it that is dropped. */
const KEEP_BEHIND = 30;
/** Nothing spawns this close to the skiff, so the world never appears on top of the player. */
const SPAWN_CLEARANCE = 6;
/** How near a beacon the skiff must be for `E` to work. */
const SURFACE_RANGE = 3.8;

const DRIFTER_AGGRO = 11;
const DRIFTER_SPEED = 5.2;

const distanceTo = (skiff, p) => Math.hypot(p.x - skiff.x, p.y - skiff.y, p.z - skiff.z);

/** A fresh dive at the title, holding the best score it was given. */
export function createRun({ seed = 1, best = 0 } = {}) {
  const run = {
    seed: seed >>> 0,
    state: 'title',
    outcome: null,
    reason: null,
    time: 0,
    accumulator: 0,
    air: AIR_CAPACITY,
    hull: HULL_CAPACITY,
    sonar: SONAR_MAX,
    sonarTimer: 0,
    reveal: 0,
    invuln: 0,
    skiff: createSkiff(),
    depth: 0,
    radius: trenchRadiusAt(0),
    spores: [],
    rocks: [],
    drifters: [],
    beacons: [],
    sporePoints: 0,
    combo: 1,
    comboTimer: Infinity,
    beaconsPassed: 0,
    inBeacon: false,
    events: [],
    loadedFrom: 0,
    loadedTo: -1,
    best: Math.max(0, best),
    score: scoreOf({ ocean: 0 }),
    frame: 0,
  };
  return run;
}

/** Leave the title and begin the dive. */
export function start(run) {
  run.state = 'playing';
  run.events.push({ type: 'start' });
  ensureWorld(run, true);
  return run;
}

/** Freeze the dive. The clock stops exactly; nothing is stepped while paused. */
export function pause(run) {
  if (run.state === 'playing') run.state = 'paused';
}

/** Unfreeze it. */
export function resume(run) {
  if (run.state === 'paused') {
    run.state = 'playing';
    run.accumulator = 0;
  }
}

/** Take the score, keep the best, and stop the run. */
function finish(run, outcome, reason = null) {
  if (run.state === 'result') return;
  run.state = 'result';
  run.outcome = outcome;
  run.reason = reason;
  run.score = scoreOf({
    depth: run.depth,
    sporePoints: run.sporePoints,
    beacons: run.beaconsPassed,
    oxygen: run.air,
    surfaced: outcome === 'surfaced',
  });
  run.best = Math.max(run.best, run.score.total);
  run.events.push({ type: 'end', outcome, reason, score: run.score.total });
}

/** Surface at the beacon the skiff is inside, if it is inside one. */
export function surface(run) {
  if (run.state !== 'playing' || !run.inBeacon) return false;
  finish(run, 'surfaced');
  return true;
}

/** A new dive, same seed stream advanced, best score kept. */
export function restart(run) {
  const seed = (Math.imul(run.seed, 1664525) + 1013904223) >>> 0;
  const best = run.best;
  const fresh = createRun({ seed, best });
  Object.assign(run, fresh);
  run.state = 'playing';
  run.events.push({ type: 'start' });
  ensureWorld(run, true);
  return run;
}

/** Fire the sonar pulse: reveal the cave, stun what is close, spend one charge. */
export function fireSonar(run) {
  if (run.state !== 'playing' || run.sonar <= 0) return false;
  run.sonar -= 1;
  run.reveal = SONAR_REVEAL;
  let stunned = 0;
  for (const drifter of run.drifters) {
    if (distanceTo(run.skiff, drifter) <= SONAR_RADIUS) {
      drifter.stun = SONAR_STUN;
      stunned += 1;
    }
  }
  run.events.push({ type: 'sonar', stunned });
  return true;
}

/** Generate the sections the skiff is about to enter, drop the ones it has left behind. */
function ensureWorld(run, force = false) {
  const index = Math.max(0, Math.floor(run.depth / SECTION_LENGTH));
  const wantedTo = index + SECTIONS_AHEAD;
  if (!force && wantedTo <= run.loadedTo) return;
  for (let i = Math.max(0, run.loadedTo + 1); i <= wantedTo; i += 1) {
    const section = sectionFor(run.seed, i);
    const clear = (p) => Math.hypot(p.x - run.skiff.x, p.y - run.skiff.y, p.z - run.skiff.z) > SPAWN_CLEARANCE;
    for (const rock of section.rocks) {
      const placed = {
        id: `${i}:r${run.rocks.length}`,
        x: Math.cos(rock.angle) * rock.gap,
        y: Math.sin(rock.angle) * rock.gap * 0.8,
        z: rock.z,
        girth: rock.girth,
        length: rock.length,
        tip: rock.tip,
        angle: rock.angle,
      };
      if (!clear(placed)) continue;
      run.rocks.push(placed);
    }
    for (const spore of section.spores) {
      if (!clear(spore)) continue;
      run.spores.push({ id: spore.id, x: spore.x, y: spore.y, z: spore.z, air: spore.air, points: spore.points, phase: (spore.z * 0.7) % 6.28 });
    }
    for (const drifter of section.drifters) {
      if (!clear(drifter)) continue;
      run.drifters.push({
        id: drifter.id,
        x: drifter.x,
        y: drifter.y,
        z: drifter.z,
        homeX: drifter.x,
        homeY: drifter.y,
        vx: 0,
        vy: 0,
        vz: 0,
        stun: 0,
        bite: 0,
        phase: drifter.phase,
      });
    }
    if (section.beacon) {
      run.beacons.push({ ...section.beacon, touched: false });
    }
    run.loadedTo = i;
  }
  const cut = -(run.depth - KEEP_BEHIND);
  run.spores = run.spores.filter((s) => s.z <= cut);
  run.rocks = run.rocks.filter((s) => s.z <= cut);
  run.drifters = run.drifters.filter((s) => s.z <= cut);
  run.beacons = run.beacons.filter((b) => b.z <= cut + 200);
  run.loadedFrom = Math.max(0, Math.floor((run.depth - KEEP_BEHIND) / SECTION_LENGTH));
}

/** One fixed slice of the dive. Called by `step`; tests may call it directly for exactness. */
export function simulate(run, input, h) {
  run.frame += 1;
  run.time += h;

  const boosting = input.boost === true && input.thrust > 0;
  run.air = airAfter(run.air, run.depth, h, boosting);
  if (run.air <= 0) {
    run.air = 0;
    finish(run, 'lost', 'air');
    return;
  }

  if (run.sonar < SONAR_MAX) {
    run.sonarTimer += h;
    while (run.sonar < SONAR_MAX && run.sonarTimer >= SONAR_RECHARGE) {
      run.sonarTimer -= SONAR_RECHARGE;
      run.sonar += 1;
      run.events.push({ type: 'charge' });
    }
    if (run.sonar >= SONAR_MAX) run.sonarTimer = 0;
  }

  run.reveal = Math.max(0, run.reveal - h);
  run.invuln = Math.max(0, run.invuln - h);
  run.comboTimer += h;
  if (run.comboTimer > COMBO_WINDOW && run.combo !== 1) run.combo = 1;

  const flight = stepSkiff(run.skiff, input, h, run.radius);
  run.depth = Math.max(run.depth, -run.skiff.z);
  run.radius = trenchRadiusAt(run.depth);
  if (flight.wall && run.events.filter((e) => e.type === 'wall').length < 1) run.events.push({ type: 'wall' });

  ensureWorld(run);

  // Spores: taken once, paying score with the chain multiplier and air back into the tank.
  for (let i = run.spores.length - 1; i >= 0; i -= 1) {
    const spore = run.spores[i];
    if (distanceTo(run.skiff, spore) > PICKUP_RADIUS) continue;
    run.combo = comboStep(run.combo, run.comboTimer);
    run.comboTimer = 0;
    const worth = spore.points * run.combo;
    run.sporePoints += worth;
    run.air = Math.min(AIR_CAPACITY, run.air + spore.air);
    run.events.push({ type: 'spore', id: spore.id, worth, combo: run.combo, x: spore.x, y: spore.y, z: spore.z });
    run.spores.splice(i, 1);
  }

  // Rock: one strike, then a short immunity so a wall cannot chew the hull away.
  if (run.invuln <= 0) {
    for (const rock of run.rocks) {
      if (distanceTo(run.skiff, rock) > SKIFF_RADIUS + rock.girth) continue;
      run.hull = Math.max(0, run.hull - ROCK_DAMAGE);
      run.invuln = ROCK_INVULNERABLE;
      run.events.push({ type: 'rock', x: rock.x, y: rock.y, z: rock.z });
      break;
    }
  }

  // Drifters: hold their ledge until the lamp comes near, then come at it. A stunned drifter
  // hangs still, which is exactly what the sonar is for.
  for (const drifter of run.drifters) {
    // A drifter added by hand (a test, a debug spawn) has no ledge yet: its first position is it.
    if (!Number.isFinite(drifter.homeX)) drifter.homeX = Number.isFinite(drifter.x) ? drifter.x : 0;
    if (!Number.isFinite(drifter.homeY)) drifter.homeY = Number.isFinite(drifter.y) ? drifter.y : 0;
    drifter.bite = Math.max(0, drifter.bite - h);
    if (drifter.stun > 0) {
      drifter.stun = Math.max(0, drifter.stun - h);
      continue;
    }
    const toSkiffX = run.skiff.x - drifter.x;
    const toSkiffY = run.skiff.y - drifter.y;
    const toSkiffZ = run.skiff.z - drifter.z;
    const d = Math.hypot(toSkiffX, toSkiffY, toSkiffZ);
    if (d < DRIFTER_AGGRO && d > 0.001) {
      const k = (DRIFTER_SPEED * h) / d;
      drifter.x += toSkiffX * k;
      drifter.y += toSkiffY * k;
      drifter.z += toSkiffZ * k;
    } else {
      // Idle: a slow circle around its ledge, so the trench never looks frozen.
      drifter.phase += h * 0.6;
      drifter.x = drifter.homeX + Math.cos(drifter.phase) * 0.6;
      drifter.y = drifter.homeY + Math.sin(drifter.phase * 1.3) * 0.4;
    }
    if (d < BITE_RADIUS && drifter.bite <= 0) {
      drifter.bite = DRIFTER_BITE_INTERVAL;
      run.hull = Math.max(0, run.hull - DRIFTER_BITE);
      run.events.push({ type: 'bite', id: drifter.id });
    }
  }

  // Beacons: a ring that pays once, and the only place the skiff may surface.
  run.inBeacon = false;
  for (const beacon of run.beacons) {
    const d = distanceTo(run.skiff, beacon);
    if (d > SURFACE_RANGE) continue;
    run.inBeacon = true;
    if (!beacon.touched) {
      beacon.touched = true;
      run.beaconsPassed += 1;
      run.air = Math.min(AIR_CAPACITY, run.air + BEACON_AIR);
      run.hull = Math.min(HULL_CAPACITY, run.hull + BEACON_HULL);
      run.events.push({ type: 'beacon', number: beacon.number, depth: beacon.depth });
    }
  }

  run.score = scoreOf({
    depth: run.depth,
    sporePoints: run.sporePoints,
    beacons: run.beaconsPassed,
    oxygen: run.air,
    surfaced: false,
  });

  if (run.hull <= 0) finish(run, 'lost', 'hull');
}

/**
 * Advance the dive by `dt` seconds of wall clock. The simulation itself runs in fixed slices, so
 * a 12 fps machine and a 144 fps machine fly the same trench.
 */
export function step(run, input, dt) {
  if (run.state !== 'playing') return run;
  const frame = Math.min(MAX_FRAME, Math.max(0, Number.isFinite(dt) ? dt : 0));
  run.accumulator += frame;
  while (run.accumulator >= FIXED_STEP && run.state === 'playing') {
    simulate(run, input, FIXED_STEP);
    run.accumulator -= FIXED_STEP;
  }
  return run;
}

/**
 * A simple pilot used by the `?shot=` screenshots and by the tests: aim at the next spore, lean
 * away from rock, keep thrust on. It plays the real rules — it is not a scripted animation.
 */
export function autopilotInput(run) {
  const skiff = run.skiff;
  const input = { thrust: 1, strafe: 0, lift: 0, boost: false, lookYaw: 0, lookPitch: 0 };

  let target = null;
  let bestAhead = 34;
  for (const spore of run.spores) {
    const ahead = skiff.z - spore.z;
    if (ahead <= 0.5 || ahead > bestAhead) continue;
    target = spore;
    bestAhead = ahead;
  }

  let aimX = 0;
  let aimY = 0;
  if (target) {
    aimX = target.x - skiff.x;
    aimY = target.y - skiff.y;
  }

  // Rock ahead: add a push away from anything on the nose.
  for (const rock of run.rocks) {
    const ahead = skiff.z - rock.z;
    if (ahead <= 0 || ahead > 14) continue;
    const dx = rock.x - skiff.x;
    const dy = rock.y - skiff.y;
    const d = Math.hypot(dx, dy);
    if (d > rock.girth + SKIFF_RADIUS + 2.2) continue;
    aimX -= (dx / (d || 1)) * 6;
    aimY -= (dy / (d || 1)) * 6;
  }

  const desiredYaw = Math.atan2(-aimX, Math.max(4, bestAhead));
  const desiredPitch = Math.atan2(aimY, Math.max(6, Math.hypot(aimX, bestAhead)));
  input.lookYaw = Math.max(-2.2, Math.min(2.2, (desiredYaw - skiff.yaw) * 3.4));
  input.lookPitch = Math.max(-1.6, Math.min(1.6, (desiredPitch - skiff.pitch) * 3.4));
  input.boost = run.air > 45 && bestAhead > 6;
  return input;
}

/** The next beacon ahead of the skiff, for the HUD's distance readout. */
export function nextBeacon(run) {
  let best = null;
  for (const beacon of run.beacons) {
    const d = beacon.depth - run.depth;
    if (d < -2) continue;
    if (best === null || d < best.distance) best = { depth: beacon.depth, number: beacon.number, distance: d };
  }
  if (best === null) {
    const upcoming = BEACON_DEPTHS.find((d) => d > run.depth);
    if (upcoming !== undefined) best = { depth: upcoming, number: BEACON_DEPTHS.indexOf(upcoming) + 1, distance: upcoming - run.depth };
  }
  return best;
}

export { PICKUP_RADIUS, SURFACE_RANGE, DRIFTER_AGGRO };