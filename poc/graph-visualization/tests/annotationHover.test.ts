import assert from "node:assert/strict";
import test from "node:test";
import { annotationTooltipPosition, createAnnotationHover } from "../src/react-flow/annotationHover.ts";

test("hover requires one second at rest and clears immediately after leaving", ({ mock }) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const output: unknown[] = [];
  const target = { id: "shape", x: 150, y: 80 };
  const hover = createAnnotationHover({ eligible: () => true, show: candidate => output.push(candidate) });
  hover.move(target);
  mock.timers.tick(999);
  assert.deepEqual(output, []);
  hover.move({ ...target, x: 151 });
  mock.timers.tick(999);
  assert.deepEqual(output, []);
  mock.timers.tick(1);
  assert.deepEqual(output, [{ ...target, x: 151 }]);
  hover.move(target);
  hover.move(undefined);
  assert.deepEqual(output, [{ ...target, x: 151 }, null]);
});

test("cancel, target change and eligibility checks prevent stale tips", ({ mock }) => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const output: unknown[] = [];
  let eligible = true;
  const hover = createAnnotationHover({ eligible: () => eligible, show: candidate => output.push(candidate) });
  hover.move({ id: "old", x: 2, y: 3 });
  mock.timers.tick(800);
  hover.move({ id: "new", x: 2, y: 3 });
  mock.timers.tick(300);
  assert.deepEqual(output, []);
  hover.clear();
  mock.timers.tick(1000);
  assert.deepEqual(output, []);
  hover.move({ id: "old", x: 2, y: 3 });
  eligible = false;
  mock.timers.tick(1000);
  assert.deepEqual(output, []);
});

test("tooltip uses the other side at viewport edges and clamps into view", () => {
  assert.equal(annotationTooltipPosition(50, 100, 400), 62);
  assert.equal(annotationTooltipPosition(380, 100, 400), 268);
  assert.equal(annotationTooltipPosition(8, 184, 200), 8);
});
