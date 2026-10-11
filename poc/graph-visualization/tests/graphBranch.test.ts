import assert from "node:assert/strict";
import { test } from "node:test";

import { findBranchNodeIds } from "../src/shared/graphAlgorithms.ts";
import type { GraphResponse } from "../src/shared/types.ts";

function makeGraph(
  nodeIds: number[],
  links: [number, number][],
): GraphResponse {
  return {
    nodes: nodeIds.map((id) => ({
      id,
      type: "person",
      label: String(id),
      description: null,
      attributes: {},
    })),
    edges: links.map(([source, target], index) => ({
      id: index + 1,
      source,
      target,
      type: "knows",
      description: null,
      attributes: {},
    })),
    meta: {
      nodes_count: nodeIds.length,
      edges_count: links.length,
    },
  };
}

function sortedBranch(graph: GraphResponse, anchor: number) {
  return findBranchNodeIds(graph, anchor).sort((a, b) => a - b);
}

test("linear chain includes only anchor and descendants", () => {
  const graph = makeGraph([1, 2, 3], [[1, 2], [2, 3]]);

  assert.deepEqual(sortedBranch(graph, 1), [1, 2, 3]);
  assert.deepEqual(sortedBranch(graph, 2), [2, 3]);
  assert.deepEqual(sortedBranch(graph, 3), [3]);
});

test("branching graph includes both branches", () => {
  const graph = makeGraph(
    [1, 2, 3, 4, 5],
    [[1, 2], [1, 3], [2, 4], [3, 5]],
  );

  assert.deepEqual(sortedBranch(graph, 1), [1, 2, 3, 4, 5]);
});

test("diamond includes shared descendant once", () => {
  const graph = makeGraph(
    [1, 2, 3, 4],
    [[1, 2], [1, 3], [2, 4], [3, 4]],
  );
  const branch = findBranchNodeIds(graph, 1);

  assert.deepEqual([...branch].sort((a, b) => a - b), [1, 2, 3, 4]);
  assert.equal(branch.length, new Set(branch).size);
});

test("shared descendant does not include external parent", () => {
  const graph = makeGraph([1, 2, 3], [[1, 3], [2, 3]]);

  assert.deepEqual(sortedBranch(graph, 1), [1, 3]);
  assert.deepEqual(sortedBranch(graph, 2), [2, 3]);
});

test("unconnected node selects only itself", () => {
  const graph = makeGraph([1, 2, 3], [[1, 2]]);

  assert.deepEqual(findBranchNodeIds(graph, 3), [3]);
});

test("missing anchor returns empty selection", () => {
  assert.deepEqual(findBranchNodeIds(makeGraph([1], []), 99), []);
});

test("large DAG traverses all descendants without duplicates", () => {
  const nodeIds = Array.from({ length: 2000 }, (_, index) => index + 1);
  const links: [number, number][] = [];

  for (let id = 1; id < 2000; id += 1) {
    links.push([id, id + 1]);

    if (id + 2 <= 2000) {
      links.push([id, id + 2]);
    }
  }

  const branch = findBranchNodeIds(makeGraph(nodeIds, links), 1);

  assert.equal(branch.length, 2000);
  assert.equal(new Set(branch).size, 2000);
  assert.deepEqual([...branch].sort((a, b) => a - b), nodeIds);
});

test("defensive traversal terminates on cyclic input", () => {
  const graph = makeGraph(
    [1, 2, 3],
    [[1, 2], [2, 3], [3, 1]],
  );

  assert.deepEqual(sortedBranch(graph, 1), [1, 2, 3]);
});

test("edges with missing endpoints are ignored", () => {
  const graph = makeGraph([1, 2], [[1, 99], [99, 2]]);

  assert.deepEqual(findBranchNodeIds(graph, 1), [1]);
});
