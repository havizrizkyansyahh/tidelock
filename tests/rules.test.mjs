// The rules contract, written before the module exists: this file defines what
// game/src/core/rules.js must promise, and stays green for the rest of the build.
// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AIR_CAPACITY,
  HULL_CAPACITY,
  SPORE_AIR,
  SPORE_SCORE,
  BEACON_SCORE,
  SURFACE_SCORE_PER_AIR,
  airDrainPerSecond,
  airAfter,
  comboStep,
  scoreOf,
} from '../game/src/core/rules.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test('capacities are the tuning table in GAME-DESIGN.md', () => {
  assert.equal(AIR_CAPACITY, 100);
  assert.equal(HULL_CAPACITY, 100);
  assert.equal(SPORE_AIR, 18);
  assert.equal(SPORE_SCORE, 25);
  assert.equal(BEACON_SCORE, 600);
  assert.equal(SURFACE_SCORE_PER_AIR, 3);
});

test('air drains 2.2/s at the surface and 3.28/s at 1350 m', () => {
  close(airDrainPerSecond(0), 2.2);
  close(airDrainPerSecond(1350), 3.28);
});

test('ten seconds at the top costs 22 air, and boosting costs 40 % more', () => {
  close(airAfter(100, 0, 10, false), 78);
  close(airAfter(100, 0, 10, true), 69.2);
});

test('air never goes below zero', () => {
  assert.equal(airAfter(5, 1200, 30, true), 0);
});

test('a spore tops up air but never past the tank', () => {
  close(airAfter(90, 0, 0, false), 90);
  assert.equal(Math.min(AIR_CAPACITY, 90 + SPORE_AIR), 100);
});

test('combo climbs one per pickup within 2.5 s, holds at 5, and resets after the window', () => {
  assert.equal(comboStep(1, 1.0), 2);
  assert.equal(comboStep(4, 0.2), 5);
  assert.equal(comboStep(5, 0.1), 5);
  assert.equal(comboStep(3, 2.6), 1);
  assert.equal(comboStep(3, 2.5), 4);
});

test('score adds depth, weighted spores, banked beacons and the surface bonus', () => {
  const s = scoreOf({ depth: 321.7, sporePoints: 150, beacons: 2, oxygen: 40, surfaced: true });
  assert.deepEqual(s, { depth: 321, spores: 150, beacons: 1200, surface: 120, total: 1791 });
});

test('a lost run keeps its depth and spores but earns no surface bonus', () => {
  const s = scoreOf({ depth: 88.9, sporePoints: 25, beacons: 0, oxygen: 12, surfaced: false });
  assert.deepEqual(s, { depth: 88, spores: 25, beacons: 0, surface: 0, total: 113 });
});