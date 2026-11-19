
import assert from "node:assert/strict";
import test from "node:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";

import {
  readLayoutRecovery,
  writeLayoutRecovery,
  deleteLayoutRecovery,
  deleteWorkspaceRecovery,
} from "../src/react-flow/layoutRecoveryStorage.ts";

import type { LayoutRecoveryRecord } from "../src/react-flow/layoutRecovery.ts";

const originalKeyRange = globalThis.IDBKeyRange;
const originalIndexedDB = globalThis.indexedDB;
globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;

function makeRecord(
  scope = "test-user:test-graph",
  layoutId: number | null = 7,
): LayoutRecoveryRecord {
  return {
    version: 2,
    annotations: [],
    annotationFingerprint: "[]",
    baseAnnotationFingerprint: "[]",
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
  if (originalKeyRange === undefined) {
    Reflect.deleteProperty(globalThis, "IDBKeyRange");
  } else {
    globalThis.IDBKeyRange = originalKeyRange;
  }
});


test("workspace replacement clears all recovery keys for the account only", async () => {
  const scope = "myway:user:2";
  const other = makeRecord("myway:user:20");
  await Promise.all([
    writeLayoutRecovery(makeRecord(scope, null)),
    writeLayoutRecovery(makeRecord(scope, 7)),
    writeLayoutRecovery(makeRecord(scope, 8)),
    writeLayoutRecovery(other),
  ]);

  await deleteWorkspaceRecovery(scope);
  await deleteWorkspaceRecovery(scope);

  for (const id of [null, 7, 8]) assert.equal(await readLayoutRecovery(scope, id), null);
  assert.deepEqual(await readLayoutRecovery(other.scope, other.layoutId), other);
});
