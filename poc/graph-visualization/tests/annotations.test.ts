import assert from "node:assert/strict";
import test from "node:test";
import {
  annotationSnapshot, annotationFingerprint, annotationsEqual, normalizeRectangle,
  type Annotation, type RectangleAnnotation,
} from "../src/shared/annotations.ts";
import { restoreWorkspace, workspaceIsDirty, workspaceSnapshot } from "../src/shared/persistentLayouts.ts";
import { rectangle, text } from "./annotationFixtures.ts";
const nodes = [{ data: { originalId: 1 }, position: { x: 10, y: 20 } }];

test("annotation snapshots preserve order, precision and multiline content with detached objects", () => {
  const source = [rectangle, text];
  const copied = annotationSnapshot(source);
  assert.deepEqual(copied, source);
  assert.notEqual(copied, source);
  assert.notEqual(copied[0], rectangle);
  assert.equal(annotationFingerprint(source), annotationFingerprint(source.map((row) => Object.fromEntries(Object.entries(row).reverse()))));
  assert.notEqual(annotationFingerprint(source), annotationFingerprint([...source].reverse()));
  assert.equal(annotationSnapshot([{ ...rectangle, id: rectangle.id.toUpperCase() }])[0].id, rectangle.id);
});

for (const change of [
  { id: "bad" }, { id: 7 }, { x: "2" }, { y: true }, { x: NaN }, { y: Infinity },
  { width: 0 }, { height: -1 }, { height: Infinity }, { width: "20" }, { width: null },
  { color: "pink" }, { fill: "heavy" }, { border: "wide" }, { kind: "ellipse" },
  { node_id: 1 }, { text: "forbidden" }, { size: "small" },
]) {
  test(`rejects invalid rectangle ${JSON.stringify(change)}`, () => {
    assert.throws(() => annotationSnapshot([{ ...rectangle, ...change }]));
  });
}
for (const change of [
  { text: "" }, { text: " \n\t\u0085\u00a0\u2003\u202f\u3000" }, { text: "я".repeat(2001) },
  { text: 8 }, { text: null }, { size: "huge" }, { width: 30 }, { fill: "none" }, { color: "orange" },
]) {
  test(`rejects invalid text ${Object.keys(change).join(",")} ${String(Object.values(change)[0]).slice(0, 20)}`, () => {
    assert.throws(() => annotationSnapshot([{ ...text, ...change }]));
  });
}

test("validates UUID uniqueness, missing fields, sparse arrays and snapshot bounds", () => {
  assert.throws(() => annotationSnapshot([rectangle, { ...rectangle, id: rectangle.id.toUpperCase() }]));
  assert.throws(() => annotationSnapshot([null]));
  assert.throws(() => annotationSnapshot(new Array(1)));
  assert.throws(() => annotationSnapshot({}));
  const missing = { ...rectangle } as Partial<RectangleAnnotation>;
  delete missing.border;
  assert.throws(() => annotationSnapshot([missing]));
  const boundary = Array.from({ length: 2000 }, (_, i) => ({ ...text,
    id: `12345678-1234-4123-8123-${i.toString(16).padStart(12, "0")}`, text: "🌍".repeat(2000) }));
  assert.equal(annotationSnapshot(boundary).length, 2000);
  assert.throws(() => annotationSnapshot([...boundary, text]));
  assert.throws(() => annotationSnapshot([{ ...text, text: "🌍".repeat(2001) }]));
});

test("normalizes drawing in all directions and cancels undersized rectangles", () => {
  for (const [start, end] of [
    [{ x: -10, y: 20 }, { x: 30, y: 60 }], [{ x: 30, y: 60 }, { x: -10, y: 20 }],
    [{ x: -10, y: 60 }, { x: 30, y: 20 }], [{ x: 30, y: 20 }, { x: -10, y: 60 }],
  ]) assert.deepEqual(normalizeRectangle(start, end), { x: -10, y: 20, width: 40, height: 40 });
  assert.equal(normalizeRectangle({ x: 0, y: 0 }, { x: 19, y: 30 }), null);
  assert.equal(normalizeRectangle({ x: 0, y: 0 }, { x: 30, y: 19 }), null);
  assert.throws(() => normalizeRectangle({ x: Infinity, y: 0 }, { x: 30, y: 30 }));
  assert.throws(() => normalizeRectangle({ x: -Number.MAX_VALUE, y: 0 }, { x: Number.MAX_VALUE, y: 30 }));
});

test("annotation equality includes all persisted values and array order with geometry tolerance", () => {
  assert(annotationsEqual([rectangle, text], annotationSnapshot([rectangle, text])));
  assert(annotationsEqual([rectangle], [{ ...rectangle, width: rectangle.width + 1e-7 }]));
  for (const changed of [
    [{ ...rectangle, id: text.id }, text], [text, rectangle], [rectangle],
    [{ ...rectangle, width: 31 }, text], [{ ...rectangle, height: 41 }, text],
    [{ ...rectangle, x: 10 }, text], [{ ...rectangle, y: 10 }, text],
    [{ ...rectangle, color: "red" }, text], [{ ...rectangle, fill: "none" }, text],
    [{ ...rectangle, border: "thick" }, text], [rectangle, { ...text, text: "Changed" }],
    [rectangle, { ...text, size: "large" }],
  ] as Annotation[][]) assert.equal(annotationsEqual([rectangle, text], changed), false);
});

test("workspace dirty, restore and graph reconciliation preserve annotation independence", () => {
  const saved = workspaceSnapshot(nodes, [rectangle, text]);
  assert.equal(workspaceIsDirty(nodes, [rectangle, text], saved), false);
  assert.equal(workspaceIsDirty(nodes, [], saved), true);
  assert.equal(workspaceIsDirty(nodes, [rectangle, text], null), true);
  const movedNodes = [{ ...nodes[0], position: { x: 99, y: 99 } }];
  assert.equal(workspaceIsDirty(movedNodes, [rectangle, text], saved), true);
  const restored = restoreWorkspace(movedNodes, saved, nodes);
  assert.deepEqual(restored, { nodes, annotations: [rectangle, text] });
  assert.equal(workspaceIsDirty(restored.nodes, restored.annotations, saved), false);
  restored.annotations[0].x = 100;
  assert.equal(saved.annotations[0].x, rectangle.x);
  assert.equal(workspaceIsDirty([], [rectangle, text], saved), false);
  assert.equal(workspaceIsDirty([...nodes, { data: { originalId: 2 }, position: { x: 0, y: 0 } }], [rectangle, text], saved), true);
  assert.deepEqual(restoreWorkspace([], saved, []).annotations, [rectangle, text]);
});
