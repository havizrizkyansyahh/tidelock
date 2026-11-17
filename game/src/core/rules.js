// The tuning table as code: every number GAME-DESIGN.md promises lives here and nowhere
// else. Pure functions only — no three.js, no DOM, no clock — so `node --test` can import
// this file directly and the same numbers drive the browser build.

/** Air tank capacity, in "breaths" of one unit each. */
export const AIR_CAPACITY = 100;
/** Hull integrity capacity. */
export const HULL_CAPACITY = 100;

/** Air a spore cluster returns to the tank. */
export const SPORE_AIR = 18;
/** Score one spore is worth before the combo multiplier. */
export const SPORE_SCORE = 25;
/** Score banked for each beacon passed without surfacing. */
export const BEACON_SCORE = 600;
/** Score per unit of air still in the tank when the skiff surfaces. */
export const SURFACE_SCORE_PER_AIR = 3;

/** Seconds a pickup stays "in chain" for the next one. */
export const COMBO_WINDOW = 2.5;
/** Highest combo multiplier. */
export const COMBO_MAX = 5;

/** Hull lost to one rock strike. */
export const ROCK_DAMAGE = 18;
/** Seconds of immunity after a rock strike, so one wall cannot hit twice. */
export const ROCK_INVULNERABLE = 0.8;
/** Hull lost per drifter bite. */
export const DRIFTER_BITE = 12;
/** Seconds between bites while a drifter stays in contact. */
export const DRIFTER_BITE_INTERVAL = 0.7;

/** Air and hull a beacon ring gives the first time it is touched. */
export const BEACON_AIR = 35;
export const BEACON_HULL = 15;

/** Sonar: charges held, seconds to regain one, reach, stun and reveal durations. */
export const SONAR_MAX = 3;
export const SONAR_RECHARGE = 8;
export const SONAR_RADIUS = 22;
export const SONAR_STUN = 2.5;
export const SONAR_REVEAL = 4;

/** Air spent per second at a given depth: deeper water presses harder. */
export function airDrainPerSecond(depth) {
  const d = Number.isFinite(depth) && depth > 0 ? depth : 0;
  return 2.2 + d * 0.0008;
}

/**
 * Air left after `dt` seconds at `depth`. `boosting` multiplies the drain by 1.4, and the
 * tank floors at zero rather than going negative.
 */
export function airAfter(air, depth, dt, boosting = false) {
  const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
  const drain = airDrainPerSecond(depth) * (boosting ? 1.4 : 1) * step;
  return Math.max(0, air - drain);
}

/** The combo after a pickup that came `sinceLast` seconds after the previous one. */
export function comboStep(combo, sinceLast) {
  if (!(sinceLast <= COMBO_WINDOW)) return 1;
  const current = Number.isFinite(combo) && combo > 0 ? combo : 1;
  return Math.min(COMBO_MAX, Math.floor(current) + 1);
}

/**
 * The score breakdown of a finished run. Depth counts one point per whole metre, spores are
 * already combo-weighted when they arrive here, beacons pay a flat bonus, and only a
 * surfacing run earns the leftover-air bonus.
 */
export function scoreOf({ depth = 0, sporePoints = 0, beacons = 0, oxygen = 0, surfaced = false } = {}) {
  const wholeMetres = Math.max(0, Math.floor(Number.isFinite(depth) ? depth : 0));
  const spores = Math.max(0, Math.floor(Number.isFinite(sporePoints) ? sporePoints : 0));
  const beaconPoints = Math.max(0, Math.floor(Number.isFinite(beacons) ? beacons : 0)) * BEACON_SCORE;
  const surface = surfaced ? Math.max(0, Math.floor(Math.max(0, oxygen) * SURFACE_SCORE_PER_AIR)) : 0;
  return { depth: wholeMetres, spores, beacons: beaconPoints, surface, total: wholeMetres + spores + beaconPoints + surface };
}