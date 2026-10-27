import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { act, createElement, useLayoutEffect, useState } from "react";
import { create } from "react-test-renderer";
import { useAnnotationWorkspace, type AnnotationPointer, type AnnotationWorkspace } from "../src/react-flow/useAnnotationWorkspace.ts";
import { workspaceIsDirty, workspaceSnapshot } from "../src/shared/persistentLayouts.ts";
import { rectangle, text } from "./annotationFixtures.ts";
import type { Annotation } from "../src/shared/annotations.ts";

let current: AnnotationWorkspace;
let annotations: Annotation[];
let busy: boolean;
let entered: number;
let locked: boolean;
let root: ReturnType<typeof create>;
let capture: Set<number>;
let updateLocked: (locked: boolean) => void;
const baseline = workspaceSnapshot([], [rectangle, text]);
function Harness() {
  const [working, setWorking] = useState<Annotation[]>([rectangle, text]);
  const [isBusy, setBusy] = useState(false);
  const [isLocked, setLocked] = useState(false);
  const workspace = useAnnotationWorkspace({ annotations: working, setAnnotations: setWorking,
    locked: isLocked, onBusy: setBusy,
    // Simulate a panned/zoomed viewport: screen delta 100 equals graph delta 50.
    toGraph: ({ x, y }) => ({ x: (x - 100) / 2, y: (y - 50) / 2 }),
    onEnterAnnotation() { entered++; },
  });
  useLayoutEffect(() => {
    current = workspace; annotations = working; busy = isBusy; locked = isLocked; updateLocked = setLocked;
  }, [workspace, working, isBusy, isLocked]);
  return null;
}
function pointer(x: number, y: number, id = 1, button = 0): AnnotationPointer & { prevented: boolean; stopped: boolean } {
  const event = { clientX: x, clientY: y, pointerId: id, button, prevented: false, stopped: false,
    currentTarget: {
      setPointerCapture: (id: number) => { capture.add(id); },
      hasPointerCapture: (id: number) => capture.has(id),
      releasePointerCapture: (id: number) => { capture.delete(id); },
    },
    preventDefault() { event.prevented = true; }, stopPropagation() { event.stopped = true; },
  };
  return event;
}
async function run(action: () => unknown) { let result: unknown; await act(async () => { result = action(); }); return result; }
async function selectRectangle() { await run(() => current.begin(pointer(120, 90), rectangle.id)); await run(() => current.end(pointer(120, 90))); }

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  capture = new Set(); entered = 0;
  await act(async () => { root = create(createElement(Harness)); });
});
afterEach(async () => { await act(async () => root.unmount()); });

test("startup is Graph; entering Annotation clears graph selection once and preserves committed annotations", async () => {
  assert.equal(current.mode, "graph");
  assert.equal(await run(() => current.begin(pointer(10, 10), rectangle.id)), false);
  await run(() => current.switchMode("annotation"));
  assert.equal(current.mode, "annotation");
  assert.equal(current.tool, "select");
  assert.equal(entered, 1);
  assert.deepEqual(annotations, baseline.annotations);
  await run(() => current.switchMode("annotation"));
  assert.equal(entered, 1);
});

test("drawing is a transient preview until pointer release, then returns to Select", async () => {
  await run(() => current.switchMode("annotation"));
  await run(() => current.setActiveTool("rectangle"));
  const down = pointer(100, 50);
  assert.equal(await run(() => current.begin(down)), true);
  assert.equal(down.prevented && down.stopped, true);
  assert.equal(busy, true);
  assert.equal(workspaceIsDirty([], annotations, baseline), false);
  await run(() => current.move(pointer(300, 250)));
  assert.equal(current.preview?.width, 100);
  assert.equal(current.preview?.height, 100);
  assert.deepEqual(annotations, baseline.annotations);
  await run(() => current.end(pointer(320, 270)));
  assert.equal(busy, false);
  assert.equal(capture.size, 0);
  assert.equal(current.tool, "select");
  assert.equal(annotations.length, 3);
  assert.equal(workspaceIsDirty([], annotations, baseline), true);
  const created = annotations[2];
  assert.equal(created.id, current.selectedId);
  assert.equal(created.x, 0);
  assert.equal(created.y, 0);
  assert.equal(created.kind === "rectangle" && created.width, 110);
});

test("undersized drawing, pointer cancellation and Escape cancellation create no annotation", async () => {
  await run(() => current.switchMode("annotation"));
  for (const cancel of ["small", "pointer", "escape"]) {
    await run(() => current.setActiveTool("rectangle"));
    await run(() => current.begin(pointer(100, 50)));
    await run(() => current.move(pointer(150, 100)));
    if (cancel === "small") await run(() => current.end(pointer(110, 60)));
    if (cancel === "pointer") await run(() => current.cancelPointer(pointer(150, 100)));
    if (cancel === "escape") await run(() => current.cancel());
    assert.deepEqual(annotations, baseline.annotations);
    assert.equal(current.preview, null);
    assert.equal(current.tool, "select");
    assert.equal(busy, false);
    assert.equal(capture.size, 0);
  }
});

test("mode changes cancel previews, clear selection and preserve already committed edits", async () => {
  await run(() => current.switchMode("annotation"));
  await selectRectangle();
  await run(() => current.setRectangleStyle({ color: "purple" }));
  await run(() => current.begin(pointer(120, 90), rectangle.id));
  await run(() => current.move(pointer(220, 190)));
  await run(() => current.switchMode("graph"));
  assert.equal(current.mode, "graph");
  assert.equal(current.selectedId, null);
  assert.equal(current.preview, null);
  assert.equal(busy, false);
  assert.equal(capture.size, 0);
  assert.deepEqual(annotations, [{ ...rectangle, color: "purple" }, text]);
  await run(() => current.switchMode("annotation"));
  assert.equal(current.tool, "select");
});

test("move and resize affect exactly one annotation, committing one complete latest value", async () => {
  await run(() => current.switchMode("annotation"));
  await run(() => current.begin(pointer(120, 90), rectangle.id));
  await run(() => current.move(pointer(220, 190)));
  assert.deepEqual(annotations, baseline.annotations);
  await run(() => current.end(pointer(220, 190)));
  assert.deepEqual(annotations, [{ ...rectangle, x: rectangle.x + 50, y: rectangle.y + 50 }, text]);
  const moved = { ...annotations[0] };
  await run(() => current.begin(pointer(220, 190), rectangle.id, "se"));
  await run(() => current.end(pointer(320, 290)));
  assert.deepEqual(annotations[0], { ...moved, width: 80, height: 90 });
  assert.deepEqual(annotations[1], text);
});

test("empty primary canvas clears selection and lets pan run; secondary gestures do not start drawing", async () => {
  await run(() => current.switchMode("annotation"));
  await selectRectangle();
  const empty = pointer(150, 150);
  assert.equal(await run(() => current.begin(empty)), false);
  assert.equal(current.selectedId, null);
  assert.equal(empty.prevented, false);
  await run(() => current.setActiveTool("rectangle"));
  assert.equal(await run(() => current.begin(pointer(10, 20, 1, 1))), false);
  assert.equal(await run(() => current.begin(pointer(10, 20, 1, 2))), false);
  assert.equal(current.gestureActive, false);
});

test("single-pointer gesture ignores other pointer events and repeated pointer downs", async () => {
  await run(() => current.switchMode("annotation"));
  await run(() => current.setActiveTool("rectangle"));
  await run(() => current.begin(pointer(100, 50)));
  assert.equal(await run(() => current.begin(pointer(200, 150, 2))), false);
  assert.equal(await run(() => current.move(pointer(300, 250, 2))), false);
  assert.equal(await run(() => current.end(pointer(300, 250, 2))), false);
  await run(() => current.cancelPointer({ pointerId: 2 }));
  assert.equal(current.gestureActive, true);
  await run(() => current.cancel());
});

test("selection and properties target a single rectangle and retain ID/order", async () => {
  await run(() => current.switchMode("annotation"));
  await selectRectangle();
  await run(() => current.setRectangleStyle({ color: "red", fill: "none", border: "thick" }));
  assert.equal(current.selectedId, rectangle.id);
  assert.deepEqual(annotations, [{ ...rectangle, color: "red", fill: "none", border: "thick" }, text]);
});

test("annotation deletion is confirmation-only; cancellation preserves selection and exact values", async () => {
  await run(() => current.switchMode("annotation"));
  await selectRectangle();
  await run(() => current.requestDelete());
  assert.equal(current.deleteTarget?.id, rectangle.id);
  assert.deepEqual(annotations, baseline.annotations);
  await run(() => current.cancelDelete());
  assert.equal(current.selectedId, rectangle.id);
  assert.deepEqual(annotations, baseline.annotations);
  await run(() => current.requestDelete());
  await run(() => current.confirmDelete());
  assert.deepEqual(annotations, [text]);
  assert.equal(current.selectedId, null);
  assert.equal(current.deleteTarget, null);
  await run(() => current.confirmDelete());
  assert.deepEqual(annotations, [text]);
});

test("layout switching resets transient annotation state while retaining Annotation mode", async () => {
  await run(() => current.switchMode("annotation"));
  await selectRectangle();
  await run(() => current.setActiveTool("rectangle"));
  await run(() => current.reset());
  assert.equal(current.mode, "annotation");
  assert.equal(current.tool, "select");
  assert.equal(current.selectedId, null);
  assert.deepEqual(annotations, baseline.annotations);
});

test("persistence/graph locks block modes, gestures, styles and deletion", async () => {
  await run(() => updateLocked(true));
  assert.equal(locked, true);
  await run(() => current.switchMode("annotation"));
  assert.equal(current.mode, "graph");
  await run(() => updateLocked(false));
  await run(() => current.switchMode("annotation"));
  await selectRectangle();
  await run(() => updateLocked(true));
  await run(() => current.switchMode("graph"));
  await run(() => current.setActiveTool("rectangle"));
  await run(() => current.setRectangleStyle({ fill: "none" }));
  await run(() => current.requestDelete());
  assert.equal(await run(() => current.begin(pointer(100, 50), rectangle.id)), false);
  assert.equal(current.mode, "annotation");
  assert.equal(current.tool, "select");
  assert.equal(current.deleteTarget, null);
  assert.deepEqual(annotations, baseline.annotations);
});
