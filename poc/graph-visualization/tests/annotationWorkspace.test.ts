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

async function startText() {
  await run(() => current.switchMode("annotation"));
  await run(() => current.setActiveTool("text"));
  await run(() => current.begin(pointer(180, 130)));
}

test("Text placement creates a focused-editor draft at graph coordinates without dirtying committed state", async () => {
  await startText();
  assert.equal(current.editor?.isNew, true);
  assert.equal(current.editor?.annotation.x, 40);
  assert.equal(current.editor?.annotation.y, 40);
  assert.equal(busy, true);
  assert.equal(current.gestureActive, false);
  assert.equal(capture.size, 0);
  assert.deepEqual(annotations, baseline.annotations);
  assert.equal(workspaceIsDirty([], annotations, baseline), false);
  await run(() => current.updateText("  Перший рядок\nДругий 🌍  \n"));
  const id = current.editor!.annotation.id;
  assert.equal(await run(() => current.commitText()), true);
  assert.deepEqual(annotations[2], { id, kind: "text", x: 40, y: 40,
    text: "  Перший рядок\nДругий 🌍  \n", color: "gray", size: "medium" });
  assert.equal(current.selectedId, id);
  assert.equal(current.tool, "select");
  assert.equal(current.editor, null);
  assert.equal(busy, false);
});

test("empty new Text editors and whitespace-only content are discarded", async () => {
  for (const value of ["", " \n\t\u0085\u00a0\u2003\u3000"]) {
    await startText();
    await run(() => current.updateText(value));
    assert.equal(await run(() => current.commitText()), true);
    assert.deepEqual(annotations, baseline.annotations);
    assert.equal(current.editor, null);
    assert.equal(current.tool, "select");
    assert.equal(busy, false);
  }
});

test("Escape cancels new text and restores last committed existing text", async () => {
  await startText();
  await run(() => current.updateText("New draft"));
  await run(() => current.cancel());
  assert.deepEqual(annotations, baseline.annotations);
  await run(() => current.editText(text.id));
  assert.equal(current.editor?.isNew, false);
  await run(() => current.updateText("Changed draft"));
  await run(() => current.cancel());
  assert.deepEqual(annotations, baseline.annotations);
  assert.equal(current.selectedId, text.id);
  assert.equal(busy, false);
});

test("existing Text commit preserves UUID, geometry, styles and array order", async () => {
  await run(() => current.switchMode("annotation"));
  await run(() => current.editText(text.id));
  await run(() => current.updateText("Updated\ncontent"));
  await run(() => current.commitText());
  assert.deepEqual(annotations, [rectangle, { ...text, text: "Updated\ncontent" }]);
});

test("empty existing Text retains committed content and requires correction or explicit cancellation", async () => {
  await run(() => current.switchMode("annotation"));
  await run(() => current.editText(text.id));
  await run(() => current.updateText(" \n"));
  assert.equal(await run(() => current.commitText()), false);
  assert.match(current.error, /non-empty/);
  assert.notEqual(current.editor, null);
  assert.deepEqual(annotations, baseline.annotations);
  await run(() => current.switchMode("graph"));
  assert.equal(current.mode, "annotation");
  await run(() => current.cancel());
  assert.equal(current.editor, null);
  assert.deepEqual(annotations, baseline.annotations);
});

test("Text edits respect the Unicode code-point limit without truncating or mutating committed content", async () => {
  await startText();
  await run(() => current.updateText("🌍".repeat(2001)));
  assert.equal(await run(() => current.commitText()), false);
  assert.deepEqual(annotations, baseline.annotations);
  await run(() => current.updateText("🌍".repeat(2000)));
  assert.equal(await run(() => current.commitText()), true);
  assert.equal(annotations[2].kind === "text" && [...annotations[2].text].length, 2000);
});

test("mode exit commits valid Text, discards a new empty editor and clears annotation selection", async () => {
  await startText();
  await run(() => current.updateText("Keep before mode exit"));
  await run(() => current.switchMode("graph"));
  assert.equal(current.mode, "graph");
  assert.equal(annotations[2].kind === "text" && annotations[2].text, "Keep before mode exit");
  assert.equal(current.selectedId, null);
  assert.equal(current.editor, null);
  await startText();
  await run(() => current.switchMode("graph"));
  assert.equal(annotations.length, 3);
  assert.equal(current.editor, null);
  assert.equal(busy, false);
});

test("tool switching commits current Text, then selects the requested one-shot tool", async () => {
  await startText();
  await run(() => current.updateText("Keep before changing tool"));
  await run(() => current.setActiveTool("rectangle"));
  assert.equal(current.tool, "rectangle");
  assert.equal(current.editor, null);
  assert.equal(annotations.length, 3);
});

test("IME composition prevents Text commit/mode exit until composition ends", async () => {
  await startText();
  await run(() => { current.setComposing(true); current.updateText("Compose"); });
  assert.equal(await run(() => current.commitText()), false);
  await run(() => current.switchMode("graph"));
  assert.equal(current.mode, "annotation");
  assert.deepEqual(annotations, baseline.annotations);
  await run(() => { current.setComposing(false); current.updateText("Composed 日本語"); });
  assert.equal(await run(() => current.commitText()), true);
  assert.equal(annotations.length, 3);
});

test("Text movement previews one annotation and commits position only", async () => {
  await run(() => current.switchMode("annotation"));
  await run(() => current.begin(pointer(120, 90), text.id));
  await run(() => current.move(pointer(220, 190)));
  assert.deepEqual(annotations, baseline.annotations);
  assert.deepEqual(current.preview, { ...text, x: text.x + 50, y: text.y + 50 });
  await run(() => current.end(pointer(220, 190)));
  assert.deepEqual(annotations, [rectangle, { ...text, x: text.x + 50, y: text.y + 50 }]);
  assert.equal(current.selectedId, text.id);
  assert.equal(busy, false);
});

test("Text style and confirmation deletion never modify a Rectangle", async () => {
  await run(() => current.switchMode("annotation"));
  await run(() => current.begin(pointer(120, 90), text.id));
  await run(() => current.end(pointer(120, 90)));
  await run(() => current.setTextStyle({ color: "green", size: "large" }));
  assert.deepEqual(annotations, [rectangle, { ...text, color: "green", size: "large" }]);
  await run(() => current.requestDelete());
  assert.equal(current.deleteTarget?.kind, "text");
  await run(() => current.cancelDelete());
  assert.equal(annotations.length, 2);
  assert.equal(current.selectedId, text.id);
  await run(() => current.requestDelete());
  await run(() => current.confirmDelete());
  assert.deepEqual(annotations, [rectangle]);
});

test("Text edit cannot overlap gestures, delete confirmation or server locks", async () => {
  await run(() => current.switchMode("annotation"));
  await run(() => current.begin(pointer(120, 90), rectangle.id));
  await run(() => current.editText(text.id));
  assert.equal(current.editor, null);
  await run(() => current.cancel());
  await selectRectangle();
  await run(() => current.requestDelete());
  await run(() => current.editText(text.id));
  assert.equal(current.editor, null);
  await run(() => current.cancelDelete());
  await run(() => updateLocked(true));
  await run(() => current.editText(text.id));
  assert.equal(current.editor, null);
});
