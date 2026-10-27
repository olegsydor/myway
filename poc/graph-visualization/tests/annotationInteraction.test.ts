import assert from "node:assert/strict";
import test from "node:test";
import { clearEdgeHighlights, clearNodeHighlights, finishRectangle, rectanglePreview, RESIZE_HANDLES, type RectangleGesture } from "../src/react-flow/annotationInteraction.ts";
import { rectangle } from "./annotationFixtures.ts";

const start = { x: 10, y: 20 };
function gesture(kind: RectangleGesture["kind"], handle?: RectangleGesture["handle"]): RectangleGesture {
  return { kind, start, handle, original: { ...rectangle, x: 10, y: 20, width: 100, height: 80 } };
}
test("draw preview follows every drag direction and only a valid final size is committed", () => {
  const draw = gesture("draw");
  assert.deepEqual(rectanglePreview(draw, { x: -30, y: -40 }), { ...draw.original, x: -30, y: -40, width: 40, height: 60 });
  assert.equal(finishRectangle(draw, { x: 29, y: 80 }), null);
  assert.equal(finishRectangle(draw, { x: 60, y: 39 }), null);
  assert.equal(finishRectangle(draw, start), null);
  assert.equal(finishRectangle(draw, { x: 30, y: 40 })?.width, 20);
});

test("movement changes geometry alone and retains UUID, size and semantic styles", () => {
  const moving = gesture("move");
  assert.deepEqual(finishRectangle(moving, { x: 50, y: -10 }), { ...moving.original, x: 50, y: -10 });
  assert.deepEqual(moving.original, { ...rectangle, x: 10, y: 20, width: 100, height: 80 });
});

for (const handle of RESIZE_HANDLES) {
  test(`resize ${handle} preserves opposite edges and clamps to the 20-unit minimum`, () => {
    const resizing = gesture("resize", handle);
    const result = finishRectangle(resizing, { x: 30, y: 50 })!;
    assert.equal(result.x, handle.includes("w") ? 30 : 10);
    assert.equal(result.y, handle.includes("n") ? 50 : 20);
    assert.equal(result.width, handle.includes("w") ? 80 : handle.includes("e") ? 120 : 100);
    assert.equal(result.height, handle.includes("n") ? 50 : handle.includes("s") ? 110 : 80);
    const crossed = finishRectangle(resizing, { x: handle.includes("w") ? 1000 : -1000, y: handle.includes("n") ? 1000 : -1000 })!;
    assert(crossed.width >= 20 && crossed.height >= 20);
    if (handle.includes("w")) assert.equal(crossed.x + crossed.width, 110);
    if (handle.includes("n")) assert.equal(crossed.y + crossed.height, 100);
  });
}

test("nonfinite and overflowing gesture previews are rejected", () => {
  assert.equal(rectanglePreview(gesture("move"), { x: Infinity, y: 1 }), null);
  assert.equal(finishRectangle(gesture("resize", "se"), { x: NaN, y: 1 }), null);
  assert.equal(finishRectangle({ ...gesture("draw"), start: { x: -Number.MAX_VALUE, y: 0 } }, { x: Number.MAX_VALUE, y: 100 }), null);
});

test("entering Annotation clears graph highlights while preserving hidden flags, graph data and coordinates", () => {
  const nodes = [{ id: "n1", selected: true, hidden: true, position: { x: 10, y: 20 },
    data: { label: "Node" }, style: { opacity: 0.1, border: "red", background: "white" } }];
  const edges = [{ id: "e1", selected: true, hidden: true, source: "n1", target: "n2",
    style: { stroke: "red", opacity: 0.1 }, markerEnd: { type: "arrowclosed", color: "red" } }];
  const clearedNodes = clearNodeHighlights(nodes);
  const clearedEdges = clearEdgeHighlights(edges);
  assert.equal(clearedNodes[0].hidden, true);
  assert.equal(clearedEdges[0].hidden, true);
  assert.equal(clearedNodes[0].selected, false);
  assert.equal(clearedEdges[0].selected, false);
  assert.equal(clearedNodes[0].style.opacity, 1);
  assert.equal(clearedEdges[0].style.opacity, 1);
  assert.equal(clearedNodes[0].position, nodes[0].position);
  assert.equal(clearedNodes[0].data, nodes[0].data);
  assert.equal(clearedEdges[0].source, edges[0].source);
  assert.equal(nodes[0].selected, true);
});
