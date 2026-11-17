// Seeded randomness. Every generated thing in the trench comes from a stream built here, so a
// seed alone reproduces a whole dive — which is what makes the `?shot=` screenshots and the
// unit tests honest.

/**
 * mulberry32: a small, fast, well-distributed 32-bit generator. Returns a function that yields
 * floats in [0, 1) plus the helpers the world builder needs.
 */
export function makeRng(seed) {
  let state = (Number.isFinite(seed) ? Math.floor(seed) : 1) >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (min, max) => min + next() * (max - min);
  next.int = (maxExclusive) => Math.floor(next() * maxExclusive);
  next.pick = (items) => items[Math.floor(next() * items.length)];
  next.chance = (p) => next() < p;
  return next;
}

/** Two independent-looking streams from one seed: world layout and creature behaviour. */
export function makeStreams(seed) {
  const base = (Number.isFinite(seed) ? Math.floor(seed) : 1) >>> 0;
  return {
    world: makeRng(base ^ 0x9e3779b9),
    life: makeRng(base ^ 0x85ebca6b),
    section: (index) => makeRng((base ^ Math.imul(index + 1, 0x27d4eb2f)) >>> 0),
  };
}