import assert from "node:assert/strict";
import test from "node:test";

import { LayoutRecoveryQueue } from "../src/react-flow/layoutRecoveryQueue.ts";

function deferred() {
  let resolve!: () => void;

  const promise = new Promise<void>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

test("serializes operations for the same key", async () => {
  const queue = new LayoutRecoveryQueue();
  const gate = deferred();
  const events: string[] = [];

  const first = queue.enqueue("layout-1", async () => {
    events.push("write-start");
    await gate.promise;
    events.push("write-end");
  });

  const second = queue.enqueue("layout-1", async () => {
    events.push("delete");
  });

  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(events, ["write-start"]);

  gate.resolve();

  await Promise.all([first, second]);

  assert.deepEqual(events, [
    "write-start",
    "write-end",
    "delete",
  ]);
});

test("continues after a failed operation", async () => {
  const queue = new LayoutRecoveryQueue();
  const events: string[] = [];

  const failed = queue.enqueue("layout-1", async () => {
    events.push("failed");
    throw new Error("Write failed");
  });

  const next = queue.enqueue("layout-1", async () => {
    events.push("next");
  });

  await assert.rejects(failed, /Write failed/);
  await next;

  assert.deepEqual(events, ["failed", "next"]);
});

test("different keys are independent", async () => {
  const queue = new LayoutRecoveryQueue();
  const gate = deferred();
  const events: string[] = [];

  const first = queue.enqueue("layout-1", async () => {
    await gate.promise;
    events.push("first");
  });

  const second = queue.enqueue("layout-2", async () => {
    events.push("second");
  });

  await second;

  assert.deepEqual(events, ["second"]);

  gate.resolve();
  await first;

  assert.deepEqual(events, ["second", "first"]);
});
