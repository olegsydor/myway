import assert from "node:assert/strict";
import test from "node:test";
import { annotationFingerprint } from "../src/shared/annotations.ts";
import { checkRecoveryCompatibility, createRecoveryRecord, type LegacyLayoutRecoveryRecord } from "../src/react-flow/layoutRecovery.ts";
import { checkStartupRecovery } from "../src/react-flow/layoutRecoveryStartup.ts";
import { rectangle, text } from "./annotationFixtures.ts";

const scope = "v2:user";
const base = [{ node_id: 1, x: 10, y: 20 }];
const nodes = [{ data: { originalId: 1 }, position: { x: 30, y: 40 } }];
const timestamp = "2026-10-27T10:00:00.000Z";
const record = () => createRecoveryRecord(scope, 7, nodes, base, timestamp, [rectangle, text], [text]);
const legacy = (): LegacyLayoutRecoveryRecord => ({ version: 1, scope, layoutId: 7, savedAt: timestamp,
  baseFingerprint: JSON.stringify([[1, 10, 20]]), nodeFingerprint: "[1]", positions: [{ node_id: 1, x: 30, y: 40 }] });
const check = (candidate: unknown) => checkRecoveryCompatibility(candidate, scope, 7, [1], base, [text]);

test("v2 contains complete detached snapshots and saved annotation baseline", () => {
  const candidate = record();
  assert.equal(candidate.version, 2);
  assert.deepEqual(candidate.annotations, [rectangle, text]);
  assert.equal(candidate.baseAnnotationFingerprint, annotationFingerprint([text]));
  assert.equal(candidate.annotationFingerprint, annotationFingerprint([rectangle, text]));
  assert.equal(check(candidate), "compatible");
  candidate.annotations[0].x = 50;
  assert.equal(rectangle.x, -12.123456789);
  assert.equal(check(candidate), "invalid");
});

for (const annotations of [
  undefined, null, {}, [null], new Array(1), [rectangle, rectangle],
  [{ ...rectangle, x: NaN }], [{ ...text, text: " " }], [{ ...text, node_id: 1 }],
]) {
  test(`rejects whole v2 draft with malformed annotations ${String(annotations).slice(0, 20)}`, () => {
    assert.equal(check({ ...record(), annotations }), "invalid");
  });
}

test("rejects reordered, edited or truncated annotations when fingerprint is inconsistent", () => {
  for (const annotations of [[text, rectangle], [rectangle], [{ ...rectangle, width: 90 }, text]]) {
    assert.equal(check({ ...record(), annotations }), "invalid");
  }
  assert.equal(check({ ...record(), baseAnnotationFingerprint: "broken" }), "changed-annotations");
  assert.equal(checkRecoveryCompatibility(record(), scope, 7, [1], base, []), "changed-annotations");
  assert.equal(checkRecoveryCompatibility(record(), scope, 7, [1], base, [{ ...text, size: "large" }]), "changed-annotations");
});

test("v1 is offered as v2 only with empty server annotations and matching node/position checks", async () => {
  const old = legacy();
  const result = await checkStartupRecovery(async () => old, scope, 7, [1], base, []);
  assert.equal(result.status, "available");
  if (result.status !== "available") throw new Error("No offer");
  assert.equal(result.record.version, 2);
  assert.deepEqual(result.record.annotations, []);
  assert.equal(result.record.baseAnnotationFingerprint, "[]");
  assert.equal(result.record.annotationFingerprint, "[]");
  assert.equal(old.version, 1);
  assert.equal(checkRecoveryCompatibility(result.record, scope, 7, [1], base, []), "compatible");
  assert.equal(check(old), "changed-annotations");
  assert.equal(checkRecoveryCompatibility(old, scope, 7, [2], base, []), "changed-nodes");
  assert.equal(checkRecoveryCompatibility(old, scope, 7, [1], [{ node_id: 1, x: 11, y: 20 }], []), "changed-base");
  assert.equal(checkRecoveryCompatibility({ ...old, annotations: [] }, scope, 7, [1], base, []), "invalid");
});

test("startup never offers partial coordinates from a malformed v2 draft", async () => {
  const result = await checkStartupRecovery(async () => ({ ...record(), annotations: [] }), scope, 7, [1], base, [text]);
  assert.deepEqual(result, { status: "incompatible", reason: "invalid" });
  assert.equal(check({ ...record(), positions: [null] }), "invalid");
  assert.equal(check({ ...record(), positions: new Array(1) }), "invalid");
  assert.equal(check({ ...record(), positions: [{ node_id: 1, x: "30", y: 40 }] }), "invalid");
});
