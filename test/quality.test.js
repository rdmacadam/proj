import test from "node:test";
import assert from "node:assert/strict";
import { createQuality } from "../js/quality.js";

const run = (q, frames, dt) => {
  for (let i = 0; i < frames; i++) q.update(dt);
};

test("sustained slow frames lower the scale but never below min", () => {
  const q = createQuality();
  run(q, 120, 40);
  assert.ok(q.scale < 1, `scale ${q.scale}`);
  assert.ok(q.scale >= 0.5, `scale ${q.scale}`);
  run(q, 2000, 40);
  assert.equal(q.scale, 0.5);
});

test("fast frames keep full quality", () => {
  const q = createQuality();
  run(q, 300, 8);
  assert.equal(q.scale, 1);
});

test("quality recovers after load goes away", () => {
  const q = createQuality();
  run(q, 120, 40);
  const low = q.scale;
  run(q, 600, 8);
  assert.ok(q.scale > low, `scale ${q.scale} not above ${low}`);
});

test("a multi-second frame gap (returning to a hidden tab) is ignored", () => {
  const q = createQuality();
  run(q, 60, 8);
  assert.equal(q.update(5000), 1);
  run(q, 10, 8);
  assert.equal(q.scale, 1);
});
