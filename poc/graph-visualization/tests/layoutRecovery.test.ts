import assert from "node:assert/strict";
import test from "node:test";

import {
  checkRecoveryCompatibility,
  createRecoveryRecord,
  nodeFingerprint,
  positionFingerprint,
} from "../src/react-flow/layoutRecovery.ts";

const base = [
  { node_id: 1, x: 10, y: 20 },
  { node_id: 2, x: 30, y: 40 },
];

const nodes = [
  { data: { originalId: 1 }, position: { x: 11, y: 21 } },
  { data: { originalId: 2 }, position: { x: 31, y: 41 } },
];

function record() {
  return createRecoveryRecord(
    "test-user:test-graph",
    7,
    nodes,
    base,
    "2026-10-23T12:00:00.000Z",
  );
}

test("creates a recovery record", () => {
  const recovery = record();

  assert.equal(recovery.version, 1);
  assert.equal(recovery.layoutId, 7);
  assert.equal(recovery.positions.length, 2);

  assert.equal(
    checkRecoveryCompatibility(
      recovery,
      "test-user:test-graph",
      7,
      [1, 2],
      base,
    ),
    "compatible",
  );
});

test("fingerprints do not depend on node order", () => {
  assert.equal(
    positionFingerprint(base),
    positionFingerprint([...base].reverse()),
  );

  assert.equal(
    nodeFingerprint([1, 2]),
    nodeFingerprint([2, 1]),
  );
});

test("rejects recovery from another scope", () => {
  assert.equal(
    checkRecoveryCompatibility(
      record(),
      "another-user:test-graph",
      7,
      [1, 2],
      base,
    ),
    "wrong-scope",
  );
});

test("rejects recovery from another layout", () => {
  assert.equal(
    checkRecoveryCompatibility(
      record(),
      "test-user:test-graph",
      8,
      [1, 2],
      base,
    ),
    "wrong-layout",
  );
});

test("detects changes in graph nodes", () => {
  assert.equal(
    checkRecoveryCompatibility(
      record(),
      "test-user:test-graph",
      7,
      [1, 2, 3],
      base,
    ),
    "changed-nodes",
  );
});

test("detects changes in saved server positions", () => {
  assert.equal(
    checkRecoveryCompatibility(
      record(),
      "test-user:test-graph",
      7,
      [1, 2],
      [
        { node_id: 1, x: 100, y: 20 },
        { node_id: 2, x: 30, y: 40 },
      ],
    ),
    "changed-base",
  );
});

test("rejects invalid coordinates", () => {
  const invalid = {
    ...record(),
    positions: [
      { node_id: 1, x: Infinity, y: 20 },
    ],
  };

  assert.equal(
    checkRecoveryCompatibility(
      invalid,
      "test-user:test-graph",
      7,
      [1, 2],
      base,
    ),
    "invalid",
  );
});

test("rejects duplicate node IDs", () => {
  assert.throws(() => nodeFingerprint([1, 1]));
  assert.throws(() => positionFingerprint([base[0], base[0]]));
});

test("rejects unsupported recovery versions", () => {
  assert.equal(
    checkRecoveryCompatibility(
      { ...record(), version: 2 },
      "test-user:test-graph",
      7,
      [1, 2],
      base,
    ),
    "invalid",
  );
});
