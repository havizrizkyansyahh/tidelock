// Feedback rules that the HUD depends on: depth milestones are a real rule (they fire once per
// hundred metres and never twice), so they are tested like any other part of the simulation.
import test from 'node:test';
import assert from 'node:assert/strict';

import { milestoneAt, MILESTONE_STEP } from '../game/src/core/rules.js';

test('a dive only reaches a milestone every hundred metres', () => {
  assert.equal(MILESTONE_STEP, 100);
  assert.equal(milestoneAt(0), null);
  assert.equal(milestoneAt(99.9), null);
  assert.equal(milestoneAt(100), 100);
  assert.equal(milestoneAt(150.4), 100);
  assert.equal(milestoneAt(1350), 1300);
});

test('milestones never fire twice for the same crossing', () => {
  assert.equal(milestoneAt(100, 100), null, 'the same milestone is not announced again');
  assert.equal(milestoneAt(140, 100), null);
  assert.equal(milestoneAt(200, 100), 200);
  assert.equal(milestoneAt(150, 200), null, 'a shallower depth never announces an earlier one');
});