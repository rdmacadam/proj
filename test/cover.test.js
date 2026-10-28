import test from "node:test";
import assert from "node:assert/strict";
import { coverScale } from "../js/cover.js";

test("wide view of a square image crops vertically", () => {
  assert.deepEqual(coverScale(1000, 500, 1000, 1000), [1, 0.5]);
});

test("tall view of a square image crops horizontally", () => {
  assert.deepEqual(coverScale(500, 1000, 1000, 1000), [0.5, 1]);
});

test("matching aspect ratios need no cropping", () => {
  assert.deepEqual(coverScale(800, 800, 400, 400), [1, 1]);
});

test("ultrawide view never stretches: scale stays within (0, 1] and one axis is 1", () => {
  const [sx, sy] = coverScale(2560, 600, 1090, 800);
  assert.ok(sx > 0 && sx <= 1 && sy > 0 && sy <= 1);
  assert.ok(sx === 1 || sy === 1);
});

test("tiny phone view keeps the image aspect ratio", () => {
  const [sx, sy] = coverScale(320, 568, 1090, 800);
  const viewAspect = 320 / 568;
  const imgAspect = 1090 / 800;
  assert.ok(Math.abs((sx * imgAspect) / (sy * 1) - viewAspect) < 1e-9);
});
