import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { act, createElement, useLayoutEffect, useState } from "react";
import { create } from "react-test-renderer";
import { IDBFactory } from "fake-indexeddb";
import { useAnnotationWorkspace, type AnnotationWorkspace, type AnnotationPointer } from "../src/react-flow/useAnnotationWorkspace.ts";
import { usePersistentLayout } from "../src/react-flow/usePersistentLayout.ts";
import { readLayoutRecovery, writeLayoutRecovery } from "../src/react-flow/layoutRecoveryStorage.ts";
import { createRecoveryRecord } from "../src/react-flow/layoutRecovery.ts";
import { rectangle, text } from "./annotationFixtures.ts";
import type { Annotation } from "../src/shared/annotations.ts";
import type { ReactFlowNode } from "../src/react-flow/adapter.ts";

const initialNodes = [{ id: "node-1", position: { x: 0, y: 0 }, data: { originalId: 1 } }] as ReactFlowNode[];
const scope = "hook-test:user";
const metadata = (id: number, is_default: boolean) => ({ id, name: `Layout ${id}`, is_default,
  created_at: "2026-10-27T00:00:00Z", updated_at: "2026-10-27T00:00:00Z" });
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalIndexedDB = globalThis.indexedDB;
let current: ReturnType<typeof usePersistentLayout> & {
  nodes: ReactFlowNode[]; annotations: Annotation[];
  editAnnotations: (annotations: Annotation[]) => void;
  annotationGesture: (busy: boolean) => void;
  graphOperation: (busy: boolean) => void;
  move: (x: number) => void;
};
let interaction: AnnotationWorkspace;
let root: ReturnType<typeof create>;
let layouts: Map<number, { positions: { node_id: number; x: number; y: number }[]; annotations: Annotation[] } & ReturnType<typeof metadata>>;
let calls: { method: string; path: string; body: any }[];
let failSave: boolean;
let failLoad: boolean;

function Harness() {
  const [nodes, setNodes] = useState(initialNodes);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationBusy, setAnnotationBusy] = useState(false);
  const [gestureBusy, setGestureBusy] = useState(false);
  const [graphBusy, setGraphBusy] = useState(false);
  const layout = usePersistentLayout({
    nodes, nodeIds: [1], annotations, setAnnotations, annotationBusy: annotationBusy || gestureBusy, graphBusy, setNodes,
    recoveryScope: scope, fallback: () => initialNodes,
    onRestored() {}, onSwitched() { workspace.reset(); },
  });
  const workspace = useAnnotationWorkspace({
    annotations, setAnnotations, locked: layout.locked || graphBusy,
    toGraph: (point) => point, onBusy: setGestureBusy, onEnterAnnotation() {},
  });
  useLayoutEffect(() => {
    interaction = workspace;
    current = { ...layout, nodes, annotations, editAnnotations: setAnnotations,
      annotationGesture: setAnnotationBusy, graphOperation: setGraphBusy,
      move: (x) => setNodes((previous) => previous.map((node) => ({ ...node, position: { x, y: 0 } }))),
    };
  }, [layout, nodes, annotations, workspace]);
  return null;
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(condition: () => boolean) {
  for (let attempt = 0; attempt < 100 && !condition(); attempt++) await act(async () => { await delay(10); });
  assert(condition(), `Hook did not settle; phase=${current?.phase} error=${current?.error}`);
}
async function mount() {
  await act(async () => { root = create(createElement(Harness)); });
  await waitFor(() => current.phase === "ready" || current.phase === "recovery");
}
async function run(action: () => unknown) {
  let result: unknown;
  await act(async () => { result = await action(); });
  return result;
}
const state = () => ({ annotations: current.annotations, x: current.nodes[0].position.x,
  dirty: current.dirty, active: current.active?.id });
const clean = () => ({ annotations: [text], x: 10, dirty: false, active: 1 });

beforeEach(async () => {
  Object.assign(globalThis, { window: new EventTarget(), indexedDB: new IDBFactory(), IS_REACT_ACT_ENVIRONMENT: true });
  calls = [];
  failSave = failLoad = false;
  layouts = new Map([[1, { ...metadata(1, true), positions: [{ node_id: 1, x: 10, y: 0 }], annotations: [text] }],
    [2, { ...metadata(2, false), positions: [{ node_id: 1, x: 20, y: 0 }], annotations: [rectangle] }]]);
  globalThis.fetch = async (url, options) => {
    const parts = String(url).split("/").filter(Boolean);
    const id = Number(parts[2]);
    const method = options?.method ?? "GET";
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    calls.push({ method, path: String(url), body });
    const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (method === "GET" && parts.length === 2) return response([...layouts.values()].map(({ positions: _positions, annotations: _annotations, ...rest }) => rest));
    if (method === "GET") return failLoad ? response({ detail: "Injected load failure" }, 503) : response(layouts.get(id));
    if (method === "PUT") {
      if (failSave) return response({ detail: "Injected save failure" }, 409);
      assert.equal(parts[3], "workspace");
      const accepted = { ...layouts.get(id)!, ...body };
      layouts.set(id, accepted);
      return response(accepted);
    }
    if (method === "POST") {
      const newId = Math.max(...layouts.keys(), 0) + 1;
      const accepted = { ...metadata(newId, layouts.size === 0), ...body };
      layouts.set(newId, accepted);
      return response(accepted, 201);
    }
    if (method === "DELETE") { layouts.delete(id); return new Response(null, { status: 204 }); }
    throw new Error(`Unexpected request ${method} ${url}`);
  };
  await mount();
});
afterEach(async () => {
  await act(async () => root.unmount());
  Object.assign(globalThis, { fetch: originalFetch, window: originalWindow, indexedDB: originalIndexedDB });
});

test("startup applies server positions and annotations before revealing the workspace", () => {
  assert.equal(current.startupReady, true);
  assert.deepEqual(state(), clean());
});

test("annotation-only changes are dirty and Discard restores both baseline parts", async () => {
  await run(() => current.editAnnotations([text, rectangle]));
  assert.equal(current.dirty, true);
  await run(() => current.move(99));
  assert.equal(await run(() => current.discard()), true);
  assert.deepEqual(state(), clean());
});

test("failed Save preserves both working parts, baseline and stored recovery", async () => {
  await run(() => current.editAnnotations([rectangle]));
  await run(() => current.move(99));
  await run(() => delay(550));
  const draft = await readLayoutRecovery(scope, 1);
  assert.deepEqual((draft as any).annotations, [rectangle]);
  failSave = true;
  assert.equal(await run(() => current.save()), false);
  assert.deepEqual(state(), { annotations: [rectangle], x: 99, dirty: true, active: 1 });
  assert.deepEqual(await readLayoutRecovery(scope, 1), draft);
  failSave = false;
  await run(() => current.discard());
  assert.deepEqual(state(), clean());
});

test("Save accepts a complete workspace and becomes clean", async () => {
  await run(() => { current.editAnnotations([rectangle, text]); current.move(88); });
  assert.equal(await run(() => current.save()), true);
  assert.deepEqual(state(), { annotations: [rectangle, text], x: 88, dirty: false, active: 1 });
  assert.deepEqual(calls.find((call) => call.method === "PUT")?.body,
    { positions: [{ node_id: 1, x: 88, y: 0 }], annotations: [rectangle, text] });
  assert.equal(await readLayoutRecovery(scope, 1), null);
});

test("Save as New includes both parts and leaves the previous layout independent", async () => {
  await run(() => { current.editAnnotations([rectangle]); current.move(77); });
  assert.equal(await run(() => current.saveAsNew("Copy")), true);
  assert.deepEqual(state(), { annotations: [rectangle], x: 77, dirty: false, active: 3 });
  assert.deepEqual(layouts.get(1)?.annotations, [text]);
  assert.deepEqual(layouts.get(3)?.annotations, [rectangle]);
});

test("failed destination load and Cancel preserve working workspace", async () => {
  await run(() => { current.editAnnotations([rectangle, text]); current.move(99); });
  const working = state();
  failLoad = true;
  assert.equal(await run(() => current.switchTo(2, "discard")), false);
  assert.deepEqual(state(), working);
  failLoad = false;
  assert.equal(await run(() => current.switchTo(2, "cancel")), false);
  assert.deepEqual(state(), working);
});

test("Save and switch persists both parts before loading destination", async () => {
  await run(() => { current.editAnnotations([rectangle, text]); current.move(99); });
  assert.equal(await run(() => current.switchTo(2, "save")), true);
  assert.deepEqual(state(), { annotations: [rectangle], x: 20, dirty: false, active: 2 });
  assert.deepEqual(layouts.get(1)?.annotations, [rectangle, text]);
  assert.equal(layouts.get(1)?.positions[0].x, 99);
  const last = calls.slice(-2);
  assert.deepEqual(last.map(({ method }) => method), ["PUT", "GET"]);
});

test("Discard and switch replaces both parts without saving the old workspace", async () => {
  await run(() => { current.editAnnotations([]); current.move(99); });
  assert.equal(await run(() => current.switchTo(2, "discard")), true);
  assert.deepEqual(state(), { annotations: [rectangle], x: 20, dirty: false, active: 2 });
  assert.deepEqual(layouts.get(1)?.annotations, [text]);
  assert.equal(calls.some(({ method }) => method === "PUT"), false);
});

test("layout deletion applies prefetched default annotations and coordinates", async () => {
  await run(() => current.switchTo(2, "discard"));
  assert.equal(await run(() => current.deleteActive()), true);
  assert.deepEqual(state(), clean());
  assert.equal(layouts.has(2), false);
});

test("annotation gesture and graph operations block Save and recovery writes", async () => {
  await run(() => current.editAnnotations([rectangle]));
  await run(() => current.annotationGesture(true));
  assert.equal(current.blocked, true);
  assert.equal(await run(() => current.save()), false);
  await run(() => delay(550));
  assert.equal(await readLayoutRecovery(scope, 1), null);
  await run(() => { current.annotationGesture(false); current.graphOperation(true); });
  assert.equal(await run(() => current.save()), false);
  await run(() => current.graphOperation(false));
  await run(() => delay(550));
  const draft = await readLayoutRecovery(scope, 1) as any;
  assert.equal(draft.version, 2);
  assert.deepEqual(draft.annotations, [rectangle]);
});

test("startup recovery holds barrier and restores both parts together as dirty", async () => {
  await act(async () => root.unmount());
  const draft = createRecoveryRecord(scope, 1,
    [{ data: { originalId: 1 }, position: { x: 99, y: 0 } }],
    layouts.get(1)!.positions, undefined, [rectangle], [text]);
  await writeLayoutRecovery(draft);
  await mount();
  assert.equal(current.phase, "recovery");
  assert.equal(current.startupReady, false);
  assert.deepEqual(state(), clean());
  await run(() => current.restoreRecovery());
  assert.equal(current.startupReady, true);
  assert.deepEqual(state(), { annotations: [rectangle], x: 99, dirty: true, active: 1 });
});

test("recovery Discard retains server workspace and deletes the complete draft", async () => {
  await act(async () => root.unmount());
  const draft = createRecoveryRecord(scope, 1,
    [{ data: { originalId: 1 }, position: { x: 99, y: 0 } }],
    layouts.get(1)!.positions, undefined, [rectangle], [text]);
  await writeLayoutRecovery(draft);
  await mount();
  await run(() => current.discardRecovery());
  assert.equal(current.startupReady, true);
  assert.deepEqual(state(), clean());
  assert.equal(await readLayoutRecovery(scope, 1), null);
});

test("cleanup failure prevents Discard and Discard-and-switch from losing working state", async () => {
  await run(() => { current.editAnnotations([rectangle]); current.move(66); });
  const original = globalThis.indexedDB;
  Object.assign(globalThis, { indexedDB: { open() { throw new Error("Injected cleanup failure"); } } });
  try {
    assert.equal(await run(() => current.discard()), false);
    assert.deepEqual(state(), { annotations: [rectangle], x: 66, dirty: true, active: 1 });
    assert.equal(await run(() => current.switchTo(2, "discard")), false);
    assert.deepEqual(state(), { annotations: [rectangle], x: 66, dirty: true, active: 1 });
  } finally { globalThis.indexedDB = original; }
});

test("invalid outgoing annotations preserve working state and make no save request", async () => {
  await run(() => current.editAnnotations([{ ...rectangle, width: -1 }]));
  assert.equal(await run(() => current.save()), false);
  assert.equal(current.dirty, true);
  assert.equal(current.annotations[0].kind, "rectangle");
  assert.equal(calls.some(({ method }) => method === "PUT"), false);
});

test("first Save includes annotations before any server layout exists", async () => {
  await act(async () => root.unmount());
  layouts.clear();
  await mount();
  assert.equal(current.active, null);
  await run(() => { current.editAnnotations([rectangle]); current.move(55); });
  await run(() => delay(550));
  assert.equal(await readLayoutRecovery(scope, null), null);
  assert.equal(await run(() => current.save()), true);
  assert.deepEqual(state(), { annotations: [rectangle], x: 55, dirty: false, active: 1 });
});

test("v1 with an empty server annotation baseline upgrades and restores safely", async () => {
  await act(async () => root.unmount());
  layouts.get(1)!.annotations = [];
  const draft = { version: 1, scope, layoutId: 1, savedAt: "2026-10-27T00:00:00Z",
    baseFingerprint: "[[1,10,0]]", nodeFingerprint: "[1]", positions: [{ node_id: 1, x: 44, y: 0 }] };
  // Simulates an old IndexedDB record; reads are intentionally unknown until validated.
  await writeLayoutRecovery(draft as any);
  await mount();
  assert.equal(current.phase, "recovery");
  assert.equal(current.recoveryOffer?.version, 2);
  assert.deepEqual(current.recoveryOffer?.annotations, []);
  await run(() => current.restoreRecovery());
  assert.deepEqual(state(), { annotations: [], x: 44, dirty: true, active: 1 });
});

test("v1 with server annotations is removed without blocking server startup", async () => {
  await act(async () => root.unmount());
  const draft = { version: 1, scope, layoutId: 1, savedAt: "2026-10-27T00:00:00Z",
    baseFingerprint: "[[1,10,0]]", nodeFingerprint: "[1]", positions: [{ node_id: 1, x: 44, y: 0 }] };
  await writeLayoutRecovery(draft as any);
  await mount();
  assert.equal(current.phase, "ready");
  assert.deepEqual(state(), clean());
  assert.equal(await readLayoutRecovery(scope, 1), null);
});

test("malformed v2 annotations invalidate the entire draft, including valid positions", async () => {
  await act(async () => root.unmount());
  const draft = createRecoveryRecord(scope, 1,
    [{ data: { originalId: 1 }, position: { x: 99, y: 0 } }],
    layouts.get(1)!.positions, undefined, [rectangle], [text]);
  draft.annotations = [];
  await writeLayoutRecovery(draft);
  await mount();
  assert.equal(current.phase, "ready");
  assert.deepEqual(state(), clean());
  assert.equal(await readLayoutRecovery(scope, 1), null);
});

test("failed recovery Discard keeps the startup barrier and restore offer", async () => {
  await act(async () => root.unmount());
  const draft = createRecoveryRecord(scope, 1,
    [{ data: { originalId: 1 }, position: { x: 99, y: 0 } }],
    layouts.get(1)!.positions, undefined, [rectangle], [text]);
  await writeLayoutRecovery(draft);
  await mount();
  const original = globalThis.indexedDB;
  Object.assign(globalThis, { indexedDB: { open() { throw new Error("Injected cleanup failure"); } } });
  try {
    await run(() => current.discardRecovery());
    assert.equal(current.startupReady, false);
    assert.equal(current.phase, "recovery");
    assert.deepEqual(current.recoveryOffer?.annotations, [rectangle]);
    assert.deepEqual(state(), clean());
  } finally { globalThis.indexedDB = original; }
});

test("restoring exact saved values clears stale recovery as well as dirty state", async () => {
  await run(() => current.editAnnotations([rectangle]));
  await run(() => delay(550));
  assert.notEqual(await readLayoutRecovery(scope, 1), null);
  await run(() => current.editAnnotations([text]));
  assert.deepEqual(state(), clean());
  await run(() => delay(30));
  assert.equal(await readLayoutRecovery(scope, 1), null);
});

test("duplicate Save submissions share the synchronous persistence guard", async () => {
  await run(() => { current.editAnnotations([rectangle]); current.move(77); });
  const results = await run(() => Promise.all([current.save(), current.save()]));
  assert.deepEqual(results, [true, false]);
  assert.equal(calls.filter(({ method }) => method === "PUT").length, 1);
  assert.deepEqual(state(), { annotations: [rectangle], x: 77, dirty: false, active: 1 });
});

function annotationPointer(x: number, y: number): AnnotationPointer {
  return { pointerId: 1, button: 0, clientX: x, clientY: y,
    currentTarget: { setPointerCapture() {}, hasPointerCapture: () => false, releasePointerCapture() {} },
    preventDefault() {}, stopPropagation() {},
  };
}
async function drawRectangle() {
  await run(() => interaction.switchMode("annotation"));
  await run(() => interaction.setActiveTool("rectangle"));
  await run(() => interaction.begin(annotationPointer(0, 0)));
  await run(() => interaction.end(annotationPointer(100, 100)));
}

test("Rectangle preview blocks Save without dirtying workspace; committed creation saves both parts", async () => {
  await run(() => interaction.switchMode("annotation"));
  await run(() => interaction.setActiveTool("rectangle"));
  await run(() => interaction.begin(annotationPointer(0, 0)));
  await run(() => interaction.move(annotationPointer(100, 100)));
  assert.equal(current.dirty, false);
  assert.equal(current.blocked, true);
  assert.equal(await run(() => current.save()), false);
  assert.equal(calls.some(({ method }) => method === "PUT"), false);
  await run(() => interaction.end(annotationPointer(100, 100)));
  const created = current.annotations[1];
  assert.equal(created.kind, "rectangle");
  assert.equal(current.dirty, true);
  assert.equal(current.blocked, false);
  assert.equal(await run(() => current.save()), true);
  assert.deepEqual(layouts.get(1)?.annotations, [text, created]);
  assert.equal(current.dirty, false);
  assert.equal(interaction.mode, "annotation");
});

test("Discard restores workspace after Rectangle creation while preserving current mode", async () => {
  await drawRectangle();
  assert.equal(current.annotations.length, 2);
  assert.equal(await run(() => current.discard()), true);
  assert.deepEqual(state(), clean());
  assert.equal(interaction.mode, "annotation");
  assert.equal(interaction.selected, null);
});

test("switching a layout clears Rectangle tool and selection without leaving Annotation mode", async () => {
  await drawRectangle();
  assert.notEqual(interaction.selected, null);
  await run(() => interaction.setActiveTool("rectangle"));
  assert.equal(await run(() => current.switchTo(2, "discard")), true);
  assert.equal(interaction.mode, "annotation");
  assert.equal(interaction.tool, "select");
  assert.equal(interaction.selectedId, null);
  assert.deepEqual(current.annotations, [rectangle]);
});

async function createTextAnnotation() {
  await run(() => interaction.switchMode("annotation"));
  await run(() => interaction.setActiveTool("text"));
  await run(() => interaction.begin(annotationPointer(30, 50)));
  await run(() => interaction.updateText("Text\nwith 🌍"));
}

test("Text editing blocks Save and recovery, then commits a complete latest snapshot", async () => {
  await createTextAnnotation();
  assert.equal(current.dirty, false);
  assert.equal(current.blocked, true);
  assert.equal(await run(() => current.save()), false);
  await run(() => delay(550));
  assert.equal(await readLayoutRecovery(scope, 1), null);
  await run(() => interaction.commitText());
  const accepted = current.annotations[1];
  assert.equal(current.dirty, true);
  await run(() => delay(550));
  const draft = await readLayoutRecovery(scope, 1) as any;
  assert.deepEqual(draft.annotations, [text, accepted]);
  assert.equal(await run(() => current.save()), true);
  assert.deepEqual(layouts.get(1)?.annotations, [text, accepted]);
  assert.equal(current.dirty, false);
});

test("mode exit commits Text before guarded Save and Discard restores full workspace", async () => {
  await createTextAnnotation();
  await run(() => interaction.switchMode("graph"));
  assert.equal(current.blocked, false);
  assert.equal(current.annotations.length, 2);
  assert.equal(current.dirty, true);
  assert.equal(await run(() => current.discard()), true);
  assert.deepEqual(state(), clean());
  assert.equal(interaction.mode, "graph");
});

test("failed Text Save preserves committed working content, recovery and accepted baseline", async () => {
  await run(() => interaction.switchMode("annotation"));
  await run(() => interaction.editText(text.id));
  await run(() => interaction.updateText("Updated\nexisting text"));
  await run(() => interaction.commitText());
  failSave = true;
  assert.equal(await run(() => current.save()), false);
  assert.equal(current.annotations[0].kind === "text" && current.annotations[0].text, "Updated\nexisting text");
  assert.equal(current.dirty, true);
  failSave = false;
  await run(() => current.discard());
  assert.deepEqual(state(), clean());
});
