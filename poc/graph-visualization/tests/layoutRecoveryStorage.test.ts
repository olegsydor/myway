
import assert from "node:assert/strict";
import test from "node:test";
import { indexedDB } from "fake-indexeddb";

import {
  readLayoutRecovery,
  writeLayoutRecovery,
  deleteLayoutRecovery,
} from "../src/react-flow/layoutRecoveryStorage.ts";

import type { LayoutRecoveryRecord } from "../src/react-flow/layoutRecovery.ts";

const originalIndexedDB = globalThis.indexedDB;
globalThis.indexedDB = indexedDB;

function makeRecord(
  scope = "test-user:test-graph",
  layoutId: number | null = 7,
): LayoutRecoveryRecord {
  return {
    version: 1,
    scope,
    layoutId,
    savedAt: "2026-10-23T12:00:00.000Z",
    baseFingerprint: "base",
    nodeFingerprint: "[1]",
    positions: [{ node_id: 1, x: 10, y: 20 }],
  };
}

test("writes and reads recovery", async () => {
  const record = makeRecord();

  await writeLayoutRecovery(record);

  assert.deepEqual(
    await readLayoutRecovery(record.scope, record.layoutId),
    record,
  );
});

test("overwrites recovery for the same key", async () => {
  const first = makeRecord();
  const second = {
    ...first,
    positions: [{ node_id: 1, x: 100, y: 200 }],
  };

  await writeLayoutRecovery(first);
  await writeLayoutRecovery(second);

  assert.deepEqual(
    await readLayoutRecovery(first.scope, first.layoutId),
    second,
  );
});

test("isolates recovery by scope and layout ID", async () => {
  const first = makeRecord("user-a:graph", 7);
  const second = makeRecord("user-b:graph", 7);
  const third = makeRecord("user-a:graph", 8);

  await writeLayoutRecovery(first);
  await writeLayoutRecovery(second);
  await writeLayoutRecovery(third);

  assert.deepEqual(await readLayoutRecovery(first.scope, 7), first);
  assert.deepEqual(await readLayoutRecovery(second.scope, 7), second);
  assert.deepEqual(await readLayoutRecovery(third.scope, 8), third);
});

test("deletes recovery without affecting other layouts", async () => {
  const first = makeRecord("delete-test", 7);
  const second = makeRecord("delete-test", 8);

  await writeLayoutRecovery(first);
  await writeLayoutRecovery(second);

  await deleteLayoutRecovery(first.scope, first.layoutId);

  assert.equal(await readLayoutRecovery(first.scope, 7), null);
  assert.deepEqual(await readLayoutRecovery(second.scope, 8), second);
});

test("supports null layout ID", async () => {
  const record = makeRecord("unsaved-graph", null);

  await writeLayoutRecovery(record);

  assert.deepEqual(
    await readLayoutRecovery(record.scope, null),
    record,
  );
});

test("rejects invalid recovery keys", async () => {
  await assert.rejects(
    readLayoutRecovery("", 7),
    /scope/i,
  );

  await assert.rejects(
    deleteLayoutRecovery("test", -1),
    /layout ID/i,
  );
});

test.after(() => {
  if (originalIndexedDB === undefined) {
    Reflect.deleteProperty(globalThis, "indexedDB");
  } else {
    globalThis.indexedDB = originalIndexedDB;
  }
});
