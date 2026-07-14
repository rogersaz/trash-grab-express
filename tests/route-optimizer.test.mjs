import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_STOPS, sumDurationSeconds } from '../netlify/functions/optimize-route.mjs';

test('route planner accepts the documented maximum stop count', () => {
  assert.equal(MAX_STOPS, 25);
});

test('route optimization transition durations are totaled safely', () => {
  assert.equal(sumDurationSeconds(['60s', '120.5s', null, 'bad']), 180.5);
});
