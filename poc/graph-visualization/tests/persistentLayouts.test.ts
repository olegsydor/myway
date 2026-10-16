import assert from "node:assert/strict";
import { test } from "node:test";
import { graphNodesReady, layoutIsDirty, positionSnapshot, restoreLayoutPositions } from "../src/shared/persistentLayouts.ts";

const nodes = () => [
  { data: { originalId: 1 }, position: { x: 12.5, y: -4 }, hidden: false, selected: false },
  { data: { originalId: 2 }, position: { x: 60, y: 90 }, hidden: true, selected: false },
];

test("snapshot includes hidden nodes in graph-space coordinates", () => {
  assert.deepEqual(positionSnapshot(nodes()), [
    { node_id: 1, x: 12.5, y: -4 }, { node_id: 2, x: 60, y: 90 },
  ]);
});
test("loaded and serialized saved positions are clean", () => {
  const current = nodes();
  assert.equal(layoutIsDirty(current, JSON.parse(JSON.stringify(positionSnapshot(current)))), false);
});
test("movement is dirty and returning to the baseline is clean", () => {
  const current = nodes();
  const saved = positionSnapshot(current);
  current[0].position.x += 10;
  assert.equal(layoutIsDirty(current, saved), true);
  current[0].position.x -= 10;
  assert.equal(layoutIsDirty(current, saved), false);
});
test("hidden-member movement is dirty", () => {
  const current = nodes();
  const saved = positionSnapshot(current);
  current[1].position.y += 50;
  assert.equal(layoutIsDirty(current, saved), true);
});
test("filters and selection do not change dirty state", () => {
  const current = nodes();
  const saved = positionSnapshot(current);
  current[0].hidden = true;
  current[1].selected = true;
  assert.equal(layoutIsDirty(current, saved), false);
});
test("deleted nodes do not require coordinate resave", () => {
  const current = nodes();
  const saved = positionSnapshot(current);
  assert.equal(layoutIsDirty(current.slice(0, 1), saved), false);
  assert.equal(layoutIsDirty([], saved), false);
});
test("missing saved positions are dirty", () => {
  assert.equal(layoutIsDirty(nodes(), positionSnapshot(nodes()).slice(0, 1)), true);
});
test("first save is available for an empty graph", () => {
  assert.equal(layoutIsDirty([], null), true);
  assert.equal(graphNodesReady([], []), true);
});
test("discard restores saved nodes and applies fallback only to missing nodes", () => {
  const current = nodes();
  const saved = positionSnapshot(current).slice(0, 1);
  const fallback = nodes();
  fallback[0].position = { x: 999, y: 999 };
  fallback[1].position = { x: 30, y: 40 };
  current[0].position = { x: 1000, y: 500 };
  const restored = restoreLayoutPositions(current, saved, fallback);
  assert.deepEqual(restored[0].position, { x: 12.5, y: -4 });
  assert.deepEqual(restored[1].position, { x: 30, y: 40 });
  assert.equal(restored[1].hidden, true);
  assert.equal(layoutIsDirty(restored, saved), true);
  assert.deepEqual(current[0].position, { x: 1000, y: 500 });
});
test("discard to a complete snapshot clears dirty", () => {
  const current = nodes();
  const saved = positionSnapshot(current);
  current.forEach((node) => { node.position.x += 100; });
  const restored = restoreLayoutPositions(current, saved, []);
  assert.equal(layoutIsDirty(restored, saved), false);
  assert.equal(restored[1].hidden, true);
});
test("readiness checks exact graph IDs, not only counts", () => {
  assert.equal(graphNodesReady(nodes(), [1, 2]), true);
  assert.equal(graphNodesReady(nodes(), [1, 3]), false);
  assert.equal(graphNodesReady(nodes(), [1]), false);
  assert.equal(graphNodesReady([nodes()[0], nodes()[0]], [1, 2]), false);
});
test("serialization noise does not make a loaded layout dirty", () => {
  const current = nodes();
  const saved = positionSnapshot(current);
  current[0].position.x += 1e-10;
  assert.equal(layoutIsDirty(current, saved), false);
});
for (const bad of [NaN, Infinity, -Infinity]) {
  test(`nonfinite coordinate ${bad} is rejected`, () => {
    const current = nodes();
    current[0].position.x = bad;
    assert.throws(() => positionSnapshot(current));
  });
}
test("duplicate or unsafe IDs are rejected", () => {
  assert.throws(() => positionSnapshot([nodes()[0], nodes()[0]]));
  const current = nodes();
  current[0].data.originalId = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => positionSnapshot(current));
});
test("502 moved nodes including hidden members can be saved and restored", () => {
  const current = Array.from({ length: 502 }, (_, i) => ({
    data: { originalId: i + 1 }, position: { x: i * -17.25, y: i * 41 }, hidden: i % 3 === 0,
  }));
  const saved = positionSnapshot(current);
  current.forEach((node) => { node.position.x -= 900; node.position.y += 50; });
  assert.equal(layoutIsDirty(current, saved), true);
  const restored = restoreLayoutPositions(current, saved, []);
  assert.equal(layoutIsDirty(restored, saved), false);
  assert.deepEqual(positionSnapshot(restored), saved);
});
