// The skiff's motion, kept pure: given a stick and a slice of time, where does the hull go and
// what does it touch? No three.js, no DOM, no clock, so the tests can fly it a thousand times a
// second.

/** The skiff is a small bubble; this is how close its centre may come to anything solid. */
export const SKIFF_RADIUS = 0.9;

/** Metres per second squared under full thrust. */
export const THRUST_ACCEL = 16;
/** Boost multiplies thrust and air draw. */
export const BOOST_MULTIPLIER = 1.45;
/** Top speed without boost; boost raises the ceiling by a quarter. */
export const MAX_SPEED = 13;
/** Braking is stronger than thrust, so stopping feels decisive. */
export const BRAKE_ACCEL = 20;
/** Sideways thrust, in metres per second of target velocity. */
export const STRAFE_SPEED = 7;
/** Water drag, per second, so a released stick coasts and slows. */
export const DRAG = 1.2;
/** How far the nose may pitch up or down, in radians. */
export const PITCH_LIMIT = 0.62;
/** The trench cross-section is an ellipse: wider across than tall. */
export const TRENCH_FLATTEN = 0.8;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A fresh skiff at the mouth of the trench, nose down the axis. */
export function createSkiff() {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, speed: 0 };
}

/** Unit vector the nose points along: yaw turns around Y, pitch tilts it. */
export function forwardOf(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** Unit vector 90° to the right of the nose, level with the water. */
export function rightOf(yaw) {
  return { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
}

/** How far off the axis the skiff sits, measured against the trench's flattened section. */
export function offsetFromAxis(skiff) {
  return Math.hypot(skiff.x, skiff.y / TRENCH_FLATTEN);
}

/**
 * Advance the skiff by `h` seconds. `input` is the stick: thrust (−1 brake … 0 … 1 forward),
 * strafe (−1 … 1), lift (−1 … 1), boost, and the two look rates in radians per second.
 * `radius` is the trench width here; the hull is kept inside it. Returns what happened, for the
 * caller to turn into damage, sound or shake.
 */
export function stepSkiff(skiff, input, h, radius) {
  const thrust = clamp(Number.isFinite(input.thrust) ? input.thrust : 0, -1, 1);
  const strafe = clamp(Number.isFinite(input.strafe) ? input.strafe : 0, -1, 1);
  const lift = clamp(Number.isFinite(input.lift) ? input.lift : 0, -1, 1);
  const boost = input.boost === true;

  skiff.yaw += (Number.isFinite(input.lookYaw) ? input.lookYaw : 0) * h;
  skiff.pitch = clamp(skiff.pitch + (Number.isFinite(input.lookPitch) ? input.lookPitch : 0) * h, -PITCH_LIMIT, PITCH_LIMIT);

  const fwd = forwardOf(skiff.yaw, skiff.pitch);
  const right = rightOf(skiff.yaw);
  const accel = thrust >= 0 ? THRUST_ACCEL * (boost ? BOOST_MULTIPLIER : 1) : BRAKE_ACCEL;

  skiff.vx += fwd.x * thrust * accel * h;
  skiff.vy += fwd.y * thrust * accel * h;
  skiff.vz += fwd.z * thrust * accel * h;

  // Strafe and lift are velocity targets rather than accelerations: the side thrusters bite
  // immediately, which is what makes dodging feel responsive at speed.
  const targetX = right.x * strafe * STRAFE_SPEED;
  const targetZ = right.z * strafe * STRAFE_SPEED;
  const sideGrip = Math.min(1, 10 * h);
  skiff.vx += targetX * sideGrip;
  skiff.vz += targetZ * sideGrip;
  skiff.vy += lift * STRAFE_SPEED * 0.55 * sideGrip;

  const damp = Math.max(0, 1 - DRAG * h);
  skiff.vx *= damp;
  skiff.vy *= damp;
  skiff.vz *= damp;

  const ceiling = MAX_SPEED * (boost ? 1.25 : 1);
  const speed = Math.hypot(skiff.vx, skiff.vy, skiff.vz);
  if (speed > ceiling) {
    const k = ceiling / speed;
    skiff.vx *= k;
    skiff.vy *= k;
    skiff.vz *= k;
  }

  skiff.x += skiff.vx * h;
  skiff.y += skiff.vy * h;
  skiff.z += skiff.vz * h;

  // The trench wall: push the hull back onto the water and kill the outward part of its motion.
  let wall = false;
  const limit = Math.max(1, radius - SKIFF_RADIUS);
  const off = Math.hypot(skiff.x, skiff.y / TRENCH_FLATTEN);
  if (off > limit) {
    const k = limit / off;
    skiff.x *= k;
    skiff.y *= k;
    const nx = skiff.x / (off * k || 1);
    const ny = skiff.y / (off * k || 1);
    const outward = skiff.vx * nx + skiff.vy * ny;
    if (outward > 0) {
      skiff.vx -= nx * outward;
      skiff.vy -= ny * outward;
    }
    wall = true;
  }

  skiff.speed = Math.hypot(skiff.vx, skiff.vy, skiff.vz);
  return { wall, depth: -skiff.z, speed: skiff.speed };
}