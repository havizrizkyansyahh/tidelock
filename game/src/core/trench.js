// The Tidewell: a deterministic trench generated one 40 m section at a time. Every section is
// a pure function of (seed, index), so the same seed rebuilds the same dive and the tests can
// check the geometry without a browser.
import { makeRng } from './rng.js';
import { SPORE_AIR, SPORE_SCORE } from './rules.js';

/** Metres of trench one section covers. */
export const SECTION_LENGTH = 40;
/** The trench at the top, and the width it never narrows past. */
const BASE_RADIUS = 8.5;
const MIN_RADIUS = 5.5;
/** The trench loses its 3 m of extra width over the first 1350 m, then holds. */
const NARROWING_PER_METRE = 3 / 1350;
/** The deepest beacon; past it the trench keeps going, score only. */
export const BEACON_DEPTHS = [300, 650, 1000, 1350];
/** No drifter and no rock this close to a beacon, so the decision there is never a trap. */
export const BEACON_CLEARANCE = 55;
/** A rock column never reaches closer to the axis than this, so a line is always flyable. */
export const ROCK_MIN_GAP = 3.2;
/** Radius of a beacon ring, in metres. */
export const BEACON_RADIUS = 2.6;

/** Trench radius at a depth: wide at the top, tight at the bottom. */
export function trenchRadiusAt(depth) {
  const d = Number.isFinite(depth) && depth > 0 ? depth : 0;
  return Math.max(MIN_RADIUS, BASE_RADIUS - d * NARROWING_PER_METRE);
}

const nearBeacon = (depth, clearance = BEACON_CLEARANCE) => BEACON_DEPTHS.some((b) => Math.abs(depth - b) < clearance);

/**
 * One section of the trench: its walls' width, its rock columns, its spore clusters, its
 * drifters and, if a beacon depth falls inside it, the beacon. Positions are (x, y) across the
 * trench with z descending into it, so deeper is more negative.
 */
export function sectionFor(seed, index) {
  const depthStart = index * SECTION_LENGTH;
  const depthEnd = depthStart + SECTION_LENGTH;
  const radius = trenchRadiusAt(depthStart);
  const rng = makeRng((Math.floor(seed) ^ Math.imul(index + 1, 0x27d4eb2f)) >>> 0);
  const depthAt = (t) => depthStart + t * SECTION_LENGTH;

  // Rock columns: one per section at the top, three a section by 220 m, never crowding a beacon.
  const wanted = Math.min(3, 1 + Math.floor(depthStart / 220));
  const rocks = [];
  for (let i = 0; i < wanted; i += 1) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const t = attempt === 0 ? rng() : rng();
      const depth = depthAt(t);
      if (nearBeacon(depth, 45)) continue;
      const angle = rng.range(0, Math.PI * 2);
      rocks.push({
        angle,
        gap: rng.range(ROCK_MIN_GAP, Math.min(radius - 0.6, ROCK_MIN_GAP + 2.4)),
        girth: rng.range(0.65, 2.2),
        length: rng.range(3, 9),
        z: -depth,
        tip: rng.chance(0.5) ? 'hang' : 'spire',
      });
      break;
    }
  }

  // Spore clusters: three to six, in arcs that reward a line through the middle.
  const sporeCount = 3 + Math.floor(rng() * 4);
  const spores = [];
  const arcAngle = rng.range(0, Math.PI * 2);
  const arcDir = rng.chance(0.5) ? 1 : -1;
  for (let i = 0; i < sporeCount; i += 1) {
    const t = (i + 0.5) / sporeCount;
    const along = arcAngle + arcDir * (i - sporeCount / 2) * 0.22;
    const off = rng.range(0.9, Math.max(1.2, radius - 1.6));
    const depth = depthAt(t);
    spores.push({
      id: `${index}:s${i}`,
      x: Math.cos(along) * off,
      y: Math.sin(along) * off * 0.72,
      z: -depth,
      air: SPORE_AIR,
      points: SPORE_SCORE,
    });
  }

  // Drifters guard the ledges: none at the very top, one a section by 200 m, two past 700 m.
  const drifters = [];
  const wantedDrifters = depthStart < 200 ? 0 : depthStart < 700 ? 1 : rng.chance(0.55) ? 2 : 1;
  for (let i = 0; i < wantedDrifters; i += 1) {
    const t = rng.range(0.15, 0.85);
    const depth = depthAt(t);
    if (nearBeacon(depth)) continue;
    const angle = rng.range(0, Math.PI * 2);
    const off = rng.range(1.6, Math.max(2, radius - 2.2));
    drifters.push({
      id: `${index}:d${i}`,
      x: Math.cos(angle) * off,
      y: Math.sin(angle) * off * 0.8,
      z: -depth,
      phase: rng.range(0, Math.PI * 2),
    });
  }

  // Beacons: one per fixed depth, standing on the axis so the prompt is unmissable.
  const beaconDepth = BEACON_DEPTHS.find((b) => b >= depthStart && b < depthEnd);
  const beacon = beaconDepth === undefined
    ? null
    : {
        number: BEACON_DEPTHS.indexOf(beaconDepth) + 1,
        depth: beaconDepth,
        x: 0,
        y: 0,
        z: -beaconDepth,
        radius: BEACON_RADIUS,
      };

  return { index, depthStart, depthEnd, radius, rocks, spores, drifters, beacon };
}