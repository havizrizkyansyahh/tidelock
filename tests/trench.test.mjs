// The world's promises: the same seed always builds the same trench, every rock leaves a
// flyable gap, spores and drifters stay inside the water, and beacons sit at fixed depths.
import test from 'node:test';
import assert from 'node:assert/strict';

import { makeRng } from '../game/src/core/rng.js';
import { SECTION_LENGTH, BEACON_DEPTHS, BEACON_CLEARANCE, trenchRadiusAt, sectionFor } from '../game/src/core/trench.js';

const SEED = 7;

test('a seeded rng replays the same sequence and stays in [0, 1)', () => {
  const a = makeRng(1234);
  const b = makeRng(1234);
  const c = makeRng(1235);
  const xs = Array.from({ length: 64 }, () => a());
  const ys = Array.from({ length: 64 }, () => b());
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, Array.from({ length: 64 }, () => c()));
  for (const x of xs) assert.ok(x >= 0 && x < 1, `out of range: ${x}`);
});

test('the rng exposes range and pick helpers that respect their bounds', () => {
  const r = makeRng(99);
  for (let i = 0; i < 200; i += 1) {
    const v = r.range(-3, 4.5);
    assert.ok(v >= -3 && v < 4.5);
  }
  const picks = new Set(Array.from({ length: 200 }, () => r.pick(['a', 'b', 'c'])));
  assert.deepEqual([...picks].sort(), ['a', 'b', 'c']);
});

test('the trench narrows with depth, from 8.5 m to a 5.5 m floor', () => {
  assert.equal(trenchRadiusAt(0), 8.5);
  assert.ok(trenchRadiusAt(600) < trenchRadiusAt(0));
  assert.ok(trenchRadiusAt(1350) >= 5.4 && trenchRadiusAt(1350) <= 5.6);
  assert.equal(trenchRadiusAt(4000), trenchRadiusAt(1350));
});

test('a section is identical for the same seed and different for another', () => {
  const one = sectionFor(SEED, 5);
  const two = sectionFor(SEED, 5);
  assert.deepEqual(one, two);
  assert.notDeepEqual(sectionFor(SEED + 1, 5).rocks, one.rocks);
});

test('sections tile the depth axis without gaps or overlap', () => {
  for (let index = 0; index < 40; index += 1) {
    const s = sectionFor(SEED, index);
    assert.equal(s.index, index);
    assert.equal(s.depthStart, index * SECTION_LENGTH);
    assert.equal(s.depthEnd, (index + 1) * SECTION_LENGTH);
  }
});

test('every rock column leaves a gap wide enough to fly through', () => {
  for (let index = 0; index < 120; index += 1) {
    const s = sectionFor(SEED, index);
    for (const rock of s.rocks) {
      assert.ok(rock.gap >= 3.2, `section ${index}: gap ${rock.gap}`);
      assert.ok(rock.gap <= s.radius, `section ${index}: rock starts outside the wall`);
      assert.ok(rock.girth > 0 && rock.girth <= 2.6, `section ${index}: girth ${rock.girth}`);
      assert.ok(rock.z <= -s.depthStart && rock.z > -s.depthEnd, `section ${index}: z ${rock.z} outside its section`);
    }
  }
});

test('rock columns get denser with depth', () => {
  const count = (from, to) => {
    let n = 0;
    for (let i = from; i < to; i += 1) n += sectionFor(SEED, i).rocks.length;
    return n;
  };
  assert.ok(count(0, 8) < count(24, 32), 'the deep trench must not be emptier than the top');
});

test('spore clusters sit in open water, three to six per section', () => {
  for (let index = 0; index < 80; index += 1) {
    const s = sectionFor(SEED, index);
    assert.ok(s.spores.length >= 3 && s.spores.length <= 6, `section ${index}: ${s.spores.length}`);
    for (const spore of s.spores) {
      const off = Math.hypot(spore.x, spore.y);
      assert.ok(off <= s.radius - 1, `section ${index}: spore outside the water`);
      assert.ok(spore.z <= -s.depthStart && spore.z > -s.depthEnd);
      assert.ok(spore.air > 0 && spore.points > 0);
    }
  }
});

test('drifters keep to the water and leave a beacon a clear band', () => {
  let seen = 0;
  for (let index = 0; index < 120; index += 1) {
    const s = sectionFor(SEED, index);
    assert.ok(s.drifters.length <= 2);
    seen += s.drifters.length;
    for (const drifter of s.drifters) {
      assert.ok(Math.hypot(drifter.x, drifter.y) <= s.radius - 1.5);
      assert.ok(drifter.z <= -s.depthStart && drifter.z > -s.depthEnd);
      for (const beacon of BEACON_DEPTHS) {
        const clear = Math.abs(-drifter.z - beacon);
        assert.ok(clear >= BEACON_CLEARANCE, `drifter ${clear} m from beacon ${beacon}`);
      }
    }
  }
  assert.ok(seen > 40, `only ${seen} drifters in 120 sections`);
});

test('beacons appear exactly at their fixed depths, once each', () => {
  const found = [];
  for (let index = 0; index < 40; index += 1) {
    const s = sectionFor(SEED, index);
    if (s.beacon) found.push(s.beacon);
  }
  assert.deepEqual(found.map((b) => b.depth), BEACON_DEPTHS);
  for (const beacon of found) {
    assert.ok(Math.hypot(beacon.x, beacon.y) <= sectionFor(SEED, Math.floor(beacon.depth / SECTION_LENGTH)).radius - 2);
    assert.equal(beacon.radius, 2.6);
  }
});

test('the beacon band is free of rocks as well', () => {
  for (const beacon of BEACON_DEPTHS) {
    for (const s of [sectionFor(SEED, Math.floor(beacon / SECTION_LENGTH) - 1), sectionFor(SEED, Math.floor(beacon / SECTION_LENGTH))]) {
      for (const rock of s.rocks) assert.ok(Math.abs(-rock.z - beacon) >= BEACON_CLEARANCE - 20, 'rock too near the beacon ring');
    }
  }
});