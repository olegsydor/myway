import assert from "node:assert/strict";
import { test } from "node:test";

import {
  reconcileGroup,
  rectanglesIntersect,
  selectGroupMembers,
  toggleGroupMember,
  translateMembers,
} from "../src/shared/manualGroups.ts";

test("click creates a group and removing its final member ends it", () => {
  const group = toggleGroupMember(null, "a");

  assert.deepEqual([...group!.nodeIds], ["a"]);
  assert.equal(toggleGroupMember(group, "a"), null);
});

test("toggle adds and removes members without mutating the old group", () => {
  const original = { nodeIds: new Set(["a"]) };
  const added = toggleGroupMember(original, "b");
  const removed = toggleGroupMember(added, "a");

  assert.deepEqual([...original.nodeIds], ["a"]);
  assert.deepEqual([...added!.nodeIds], ["a", "b"]);
  assert.deepEqual([...removed!.nodeIds], ["b"]);
});

test("replacement discards previous members including hidden ones", () => {
  const original = { nodeIds: new Set(["a", "hidden"]) };
  const result = selectGroupMembers(original, ["b", "b"], false);

  assert.deepEqual([...result!.nodeIds], ["b"]);
  assert.deepEqual([...original.nodeIds], ["a", "hidden"]);
});

test("additive selection preserves previous members and prevents duplicates", () => {
  const original = { nodeIds: new Set(["a", "hidden"]) };
  const result = selectGroupMembers(original, ["a", "b", "b"], true);

  assert.deepEqual([...result!.nodeIds], ["a", "hidden", "b"]);
});

test("empty replacement clears while empty additive preserves membership", () => {
  const original = { nodeIds: new Set(["a"]) };

  assert.equal(selectGroupMembers(original, [], false), null);
  assert.deepEqual(
    [...selectGroupMembers(original, [], true)!.nodeIds],
    ["a"],
  );
  assert.equal(selectGroupMembers(null, [], true), null);
});

test("partial intersection and touching boundaries count as selection", () => {
  const selection = { left: 10, right: 30, top: 10, bottom: 30 };

  assert.equal(
    rectanglesIntersect(
      { left: 0, right: 15, top: 0, bottom: 15 },
      selection,
    ),
    true,
  );

  assert.equal(
    rectanglesIntersect(
      { left: 30, right: 40, top: 10, bottom: 20 },
      selection,
    ),
    true,
  );

  assert.equal(
    rectanglesIntersect(
      { left: 31, right: 40, top: 10, bottom: 20 },
      selection,
    ),
    false,
  );
});

test("translation moves hidden members and leaves non-members stationary", () => {
  const nodes = [
    { id: "a", position: { x: 10, y: 20 }, hidden: false },
    { id: "b", position: { x: -30, y: 80 }, hidden: true },
    { id: "outside", position: { x: 100, y: 200 }, hidden: false },
  ];

  const result = translateMembers(nodes, new Set(["a", "b"]), 50, -10);

  assert.deepEqual(result[0].position, { x: 60, y: 10 });
  assert.deepEqual(result[1].position, { x: 20, y: 70 });
  assert.equal(result[1].hidden, true);
  assert.equal(result[2], nodes[2]);

  assert.equal(
    result[1].position.x - result[0].position.x,
    nodes[1].position.x - nodes[0].position.x,
  );
  assert.equal(
    result[1].position.y - result[0].position.y,
    nodes[1].position.y - nodes[0].position.y,
  );

  assert.deepEqual(nodes[0].position, { x: 10, y: 20 });
  assert.deepEqual(nodes[1].position, { x: -30, y: 80 });
});

test("repeated 10 and 50 unit translations accumulate", () => {
  const nodes = [{ id: "a", position: { x: 0, y: 0 } }];
  const members = new Set(["a"]);

  const first = translateMembers(nodes, members, 10, 0);
  const second = translateMembers(first, members, 0, -50);

  assert.deepEqual(second[0].position, { x: 10, y: -50 });
});

test("reconciliation removes deleted members without adding new nodes", () => {
  const original = { nodeIds: new Set(["a", "deleted"]) };

  const result = reconcileGroup(
    original,
    new Set(["a", "new-node"]),
  );

  assert.deepEqual([...result!.nodeIds], ["a"]);
  assert.deepEqual([...original.nodeIds], ["a", "deleted"]);
});

test("reconciliation ends a group when every member was deleted", () => {
  assert.equal(
    reconcileGroup({ nodeIds: new Set(["deleted"]) }, new Set(["other"])),
    null,
  );
  assert.equal(reconcileGroup(null, new Set(["other"])), null);
});

test("translation supports a group containing 502 nodes", () => {
  const nodes = Array.from({ length: 502 }, (_, index) => ({
    id: String(index),
    position: { x: index * 13, y: index * -7 },
  }));

  const members = new Set(nodes.map((node) => node.id));
  const result = translateMembers(nodes, members, -125, 75);

  for (let index = 0; index < nodes.length; index += 1) {
    assert.deepEqual(result[index].position, {
      x: nodes[index].position.x - 125,
      y: nodes[index].position.y + 75,
    });
  }

  assert.equal(members.size, 502);
});
