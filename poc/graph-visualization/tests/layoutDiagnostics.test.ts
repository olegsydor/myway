import assert from "node:assert/strict";
import test from "node:test";
import {
  LayoutDiagnostics,
  layoutDiagnosticsEnabled,
} from "../src/react-flow/layoutDiagnostics";

test("keeps only the newest events in chronological order", () => {
  const diagnostics = new LayoutDiagnostics(3);
  for (let n = 0; n < 5; n++) {
    diagnostics.record({ kind: "movement", atMs: n, movedCount: n });
  }
  assert.deepEqual(diagnostics.events().map((event) => event.atMs), [2, 3, 4]);
  const report = diagnostics.report();
  assert.equal(report.totalEvents, 5);
  assert.equal(report.droppedEvents, 2);
  assert.equal(report.events.length, 3);
});

test("does not retain caller-owned nested arrays or maps", () => {
  const reasons = ["dragging"];
  const changeTypes = { position: 1 };
  const diagnostics = new LayoutDiagnostics(2);
  diagnostics.record({ kind: "layout-blocked", atMs: 1, reasons, changeTypes });
  reasons.push("graph-busy");
  changeTypes.position = 9;
  assert.deepEqual(diagnostics.events()[0].reasons, ["dragging"]);
  assert.deepEqual(diagnostics.events()[0].changeTypes, { position: 1 });
  diagnostics.events()[0].reasons?.push("other");
  assert.deepEqual(diagnostics.events()[0].reasons, ["dragging"]);
});

test("clear resets counters and events", () => {
  const diagnostics = new LayoutDiagnostics(1);
  diagnostics.record({ kind: "graph-render", atMs: 1 });
  diagnostics.record({ kind: "graph-render", atMs: 2 });
  diagnostics.clear();
  assert.equal(diagnostics.report().totalEvents, 0);
  assert.equal(diagnostics.report().droppedEvents, 0);
  assert.deepEqual(diagnostics.events(), []);
});

test("validates the capacity", () => {
  assert.throws(() => new LayoutDiagnostics(0));
  assert.throws(() => new LayoutDiagnostics(10001));
  assert.throws(() => new LayoutDiagnostics(1.5));
});

test("debugging is opt-in", () => {
  assert.equal(layoutDiagnosticsEnabled("?layoutDebug=1"), true);
  assert.equal(layoutDiagnosticsEnabled("?layoutDebug=0"), false);
  assert.equal(layoutDiagnosticsEnabled(""), false);
});

test("aggregated statistics survive ring buffer overflow", () => {
  const diagnostics = new LayoutDiagnostics(2);

  for (const durationMs of [1, 2, 3, 4]) {
    diagnostics.record({
      kind: "movement",
      atMs: durationMs,
      durationMs,
      nodeCount: 503,
    });
  }

  assert.equal(diagnostics.events().length, 2);
  assert.equal(diagnostics.report().droppedEvents, 2);

  assert.deepEqual(diagnostics.stats().movement, {
    count: 4,
    timedCount: 4,
    totalDurationMs: 10,
    averageDurationMs: 2.5,
    maxDurationMs: 4,
  });

  assert.deepEqual(
    diagnostics.report().statistics.movement,
    diagnostics.stats().movement,
  );

  diagnostics.clear();

  assert.deepEqual(diagnostics.stats(), {});
  assert.equal(diagnostics.report().totalEvents, 0);
});
