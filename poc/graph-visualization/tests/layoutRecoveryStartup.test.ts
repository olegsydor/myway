
import assert from "node:assert/strict";
import test from "node:test";

import { createRecoveryRecord } from "../src/react-flow/layoutRecovery.ts";
import { checkStartupRecovery } from "../src/react-flow/layoutRecoveryStartup.ts";

const nodes = [
  {
    data: { originalId: 1 },
    position: { x: 100, y: 200 },
  },
  {
    data: { originalId: 2 },
    position: { x: 300, y: 400 },
  },
];

const basePositions = [
  { node_id: 1, x: 10, y: 20 },
  { node_id: 2, x: 30, y: 40 },
];

const scope = "myway:user:123";
const layoutId = 7;
const nodeIds = [1, 2];

test("returns none when no recovery exists", async () => {
  const result = await checkStartupRecovery(
    async () => null,
    scope,
    layoutId,
    nodeIds,
    basePositions,
  );

  assert.deepEqual(result, { status: "none" });
});

test("returns compatible recovery without applying it", async () => {
  const record = createRecoveryRecord(
    scope,
    layoutId,
    nodes,
    basePositions,
  );

  const result = await checkStartupRecovery(
    async () => record,
    scope,
    layoutId,
    nodeIds,
    basePositions,
  );

  assert.deepEqual(result, {
    status: "available",
    record,
  });
});

test("rejects recovery belonging to another user", async () => {
  const record = createRecoveryRecord(
    "myway:user:456",
    layoutId,
    nodes,
    basePositions,
  );

  const result = await checkStartupRecovery(
    async () => record,
    scope,
    layoutId,
    nodeIds,
    basePositions,
  );

  assert.equal(result.status, "incompatible");
});

test("rejects recovery for an older server snapshot", async () => {
  const record = createRecoveryRecord(
    scope,
    layoutId,
    nodes,
    basePositions,
  );

  const changedBase = [
    { node_id: 1, x: 999, y: 20 },
    { node_id: 2, x: 30, y: 40 },
  ];

  const result = await checkStartupRecovery(
    async () => record,
    scope,
    layoutId,
    nodeIds,
    changedBase,
  );

  assert.equal(result.status, "incompatible");
});

test("rejects recovery with a different node set", async () => {
  const record = createRecoveryRecord(
    scope,
    layoutId,
    nodes,
    basePositions,
  );

  const result = await checkStartupRecovery(
    async () => record,
    scope,
    layoutId,
    [1, 2, 3],
    basePositions,
  );

  assert.equal(result.status, "incompatible");
});

test("handles IndexedDB errors without throwing", async () => {
  const result = await checkStartupRecovery(
    async () => {
      throw new Error("IndexedDB unavailable");
    },
    scope,
    layoutId,
    nodeIds,
    basePositions,
  );

  assert.equal(result.status, "unavailable");
});
