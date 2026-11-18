import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement, useLayoutEffect } from "react";
import { create } from "react-test-renderer";
import { useLayoutViewport } from "../src/react-flow/useLayoutViewport.ts";
import { readViewport, writeViewport, removeViewport, viewportKey } from "../src/react-flow/workspacePreferences.ts";
import type { ReactFlowInstance } from "@xyflow/react";
import type { ReactFlowNode, ReactFlowEdge } from "../src/react-flow/adapter.ts";

const scope = "myway:user:1";
const a = { x: -120, y: 310, zoom: 0.72 };
const b = { x: 800, y: -40, zoom: 2 };

test("viewport validation, scope isolation and storage failures", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
  const at = "2026-11-12T12:00:00.000Z";
  writeViewport(scope, 7, a, storage, at);
  assert.deepEqual(readViewport(scope, 7, storage), a);
  assert.equal(readViewport("myway:user:2", 7, storage), null);
  const key = viewportKey(scope, 7)!;
  const valid = JSON.parse(values.get(key)!);
  for (const patch of [{ version: 2 }, { scope: "other" }, { layoutId: 8 }, { x: null },
    { y: "3" }, { zoom: 0.049 }, { zoom: 4.01 }, { savedAt: "bad" }, { savedAt: "2026-11-12" }]) {
    values.set(key, JSON.stringify({ ...valid, ...patch }));
    assert.equal(readViewport(scope, 7, storage), null);
  }
  for (const raw of ["{", "null", "[]", "42"]) {
    values.set(key, raw); assert.equal(readViewport(scope, 7, storage), null);
  }
  for (const zoom of [0.05, 4]) {
    writeViewport(scope, 7, { ...a, zoom }, storage, at);
    assert.equal(readViewport(scope, 7, storage)?.zoom, zoom);
  }
  removeViewport(scope, 7, storage);
  writeViewport(scope, 7, { ...a, x: Infinity }, storage);
  assert.equal(readViewport(scope, 7, storage), null);
  assert.equal(viewportKey(null, 7), null);
  assert.equal(viewportKey(scope, -1), null);
  const fail = () => { throw new Error("storage denied"); };
  const broken = { getItem: fail, setItem: fail, removeItem: fail };
  assert.equal(readViewport(scope, 7, broken), null);
  writeViewport(scope, 7, a, broken); removeViewport(scope, 7, broken);
});

test("rendered coordinator restores, fits, preserves new identity, and rejects outgoing callbacks", async () => {
  const originals = { window: globalThis.window, requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame };
  const values = new Map<string, string>();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, window: { localStorage: {
    getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k) } } });
  let frames: (() => void)[] = [];
  globalThis.requestAnimationFrame = (fn) => { frames.push(() => fn(0)); return frames.length; };
  globalThis.cancelAnimationFrame = () => {};
  let viewport = { ...b };
  let fits = 0;
  let nodeCount = 1;
  const instance = { current: { getViewport: () => viewport, getNodes: () => Array(nodeCount).fill({}),
    setViewport: async (v: typeof a) => { viewport = v; return true; },
    fitView: async () => { fits++; viewport = { x: 0, y: 0, zoom: 1 }; return true; },
  } as unknown as ReactFlowInstance<ReactFlowNode, ReactFlowEdge> };
  let options = { scope, id: 1 as number | null, startupReady: false, flowReady: true,
    transition: { generation: 0, preserve: false }, instance };
  let camera!: ReturnType<typeof useLayoutViewport>;
  function Harness() { const value = useLayoutViewport(options); useLayoutEffect(() => { camera = value; }); return null; }
  let root!: ReturnType<typeof create>;
  async function render() { await act(async () => { if (root) root.update(createElement(Harness)); else root = create(createElement(Harness)); }); }
  async function flush() { for (let i = 0; i < 3; i++) await act(async () => { const pending = frames; frames = []; pending.forEach(fn => fn()); }); }
  try {
    writeViewport(scope, 1, a);
    await render(); await flush();
    assert.equal(camera.ready, false); assert.equal(fits, 0);
    options = { ...options, startupReady: true };
    await render(); await flush();
    assert.equal(camera.ready, true); assert.deepEqual(viewport, a); assert.equal(fits, 0);
    const outgoing = camera.moved;
    camera.moved(null, b);
    assert.deepEqual(readViewport(scope, 1), b);
    options = { ...options, id: 2, transition: { generation: 1, preserve: false } };
    await render(); assert.equal(camera.ready, false);
    outgoing(null, a); assert.equal(readViewport(scope, 2), null);
    await flush(); assert.equal(fits, 1); assert.deepEqual(readViewport(scope, 2), viewport);
    outgoing(null, a); assert.deepEqual(readViewport(scope, 2), viewport);
    viewport = { ...b };
    options = { ...options, id: 3, transition: { generation: 2, preserve: true } };
    await render(); await flush();
    assert.equal(fits, 1); assert.deepEqual(viewport, b); assert.deepEqual(readViewport(scope, 3), b);
    await camera.fit({ padding: 0.1 });
    assert.deepEqual(readViewport(scope, 3), { x: 0, y: 0, zoom: 1 });
    await render(); await flush(); assert.equal(fits, 2);
    // New accounts have zero nodes: React Flow's queued fitView must not stall camera readiness.
    nodeCount = 0;
    options = { ...options, id: null, transition: { generation: 3, preserve: false } };
    await render(); await flush();
    assert.equal(camera.ready, true); assert.equal(fits, 2);
    assert.deepEqual(viewport, { x: 0, y: 0, zoom: 1 });
    await camera.fit({ padding: .1 }); assert.equal(fits, 2);
  } finally { await act(async () => root?.unmount()); Object.assign(globalThis, originals); }
});
