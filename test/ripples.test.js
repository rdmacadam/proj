import test from "node:test";
import assert from "node:assert/strict";
import { createRipples } from "../js/ripples.js";

const strengths = d => Array.from({ length: d.length / 4 }, (_, i) => d[i * 4 + 3]);

test("empty buffer has zero strength everywhere", () => {
  const r = createRipples(8);
  const d = r.data(10);
  assert.equal(d.length, 32);
  assert.ok(strengths(d).every(s => s === 0));
});

test("adding more than max keeps only the newest", () => {
  const r = createRipples(8);
  for (let i = 0; i < 10; i++) r.add(i / 10, 0.5, i * 0.1);
  const d = r.data(1);
  const live = [];
  for (let i = 0; i < 8; i++) if (d[i * 4 + 3] > 0) live.push(Math.round(d[i * 4] * 10));
  assert.deepEqual(live.sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9]);
});

test("strength decays with age and layout is [x, y, age, strength]", () => {
  const r = createRipples(8);
  r.add(0.25, 0.75, 0);
  const fresh = r.data(0);
  const older = r.data(1);
  assert.equal(fresh[0], 0.25);
  assert.equal(fresh[1], 0.75);
  assert.equal(fresh[2], 0);
  assert.equal(older[2], 1);
  assert.ok(fresh[3] > older[3] && older[3] > 0);
});

test("ripples are gone after their 2.5 s lifetime", () => {
  const r = createRipples(8);
  r.add(0.5, 0.5, 0);
  assert.ok(strengths(r.data(3)).every(s => s === 0));
});

test("returning to a hidden tab (huge time jump) gives zeros, never NaN", () => {
  const r = createRipples(8);
  r.add(0.5, 0.5, 0);
  const d = r.data(1e6);
  assert.ok(Array.from(d).every(v => v === 0 && !Number.isNaN(v)));
});
