import type { GraphEdge, GraphResponse } from './types'

export interface GraphPath {
  nodeIds: number[]
  edgeIds: number[]
}

interface PreviousStep {
  nodeId: number
  edgeId: number
}

export function findDirectedPath(
  graph: GraphResponse,
  startNodeId: number,
  endNodeId: number,
): GraphPath | null {
  const existingNodeIds = new Set(
    graph.nodes.map((node) => node.id),
  )

  if (
    !existingNodeIds.has(startNodeId) ||
    !existingNodeIds.has(endNodeId)
  ) {
    return null
  }

  if (startNodeId === endNodeId) {
    return {
      nodeIds: [startNodeId],
      edgeIds: [],
    }
  }

  const outgoingEdges = new Map<number, GraphEdge[]>()

  for (const edge of graph.edges) {
    const edges = outgoingEdges.get(edge.source) ?? []
    edges.push(edge)
    outgoingEdges.set(edge.source, edges)
  }

  const queue: number[] = [startNodeId]
  const visited = new Set<number>([startNodeId])
  const previous = new Map<number, PreviousStep>()

  let queueIndex = 0

  while (queueIndex < queue.length) {
    const currentNodeId = queue[queueIndex]
    queueIndex += 1

    for (const edge of outgoingEdges.get(currentNodeId) ?? []) {
      if (visited.has(edge.target)) {
        continue
      }

      visited.add(edge.target)
      previous.set(edge.target, {
        nodeId: currentNodeId,
        edgeId: edge.id,
      })

      if (edge.target === endNodeId) {
        return reconstructPath(
          previous,
          startNodeId,
          endNodeId,
        )
      }

      queue.push(edge.target)
    }
  }

  return null
}

function reconstructPath(
  previous: Map<number, PreviousStep>,
  startNodeId: number,
  endNodeId: number,
): GraphPath {
  const nodeIds: number[] = [endNodeId]
  const edgeIds: number[] = []

  let currentNodeId = endNodeId

  while (currentNodeId !== startNodeId) {
    const step = previous.get(currentNodeId)

    if (!step) {
      throw new Error('Cannot reconstruct graph path')
    }

    edgeIds.push(step.edgeId)
    currentNodeId = step.nodeId
    nodeIds.push(currentNodeId)
  }

  nodeIds.reverse()
  edgeIds.reverse()

  return {
    nodeIds,
    edgeIds,
  }
}

export interface GraphAncestorSubgraph {
  nodeIds: number[]
  edgeIds: number[]
  rootNodeIds: number[]
}

export function findPathsToStart(
  graph: GraphResponse,
  selectedNodeId: number,
): GraphAncestorSubgraph | null {
  const existingNodeIds = new Set(
    graph.nodes.map((node) => node.id),
  )

  if (!existingNodeIds.has(selectedNodeId)) {
    return null
  }

  const incomingEdges = new Map<number, GraphEdge[]>()

  for (const edge of graph.edges) {
    const endpointsExist =
      existingNodeIds.has(edge.source) &&
      existingNodeIds.has(edge.target)

    const isSelfLoop = edge.source === edge.target

    if (!endpointsExist || isSelfLoop) {
      continue
    }

    const edges = incomingEdges.get(edge.target) ?? []
    edges.push(edge)
    incomingEdges.set(edge.target, edges)
  }

  const nodeIds = new Set<number>([selectedNodeId])
  const edgeIds = new Set<number>()
  const rootNodeIds = new Set<number>()

  const queue: number[] = [selectedNodeId]
  let queueIndex = 0

  while (queueIndex < queue.length) {
    const currentNodeId = queue[queueIndex]
    queueIndex += 1

    const currentIncomingEdges =
      incomingEdges.get(currentNodeId) ?? []

    if (currentIncomingEdges.length === 0) {
      rootNodeIds.add(currentNodeId)
      continue
    }

    for (const edge of currentIncomingEdges) {
      edgeIds.add(edge.id)

      if (nodeIds.has(edge.source)) {
        continue
      }

      nodeIds.add(edge.source)
      queue.push(edge.source)
    }
  }

  return {
    nodeIds: [...nodeIds].sort((left, right) => left - right),
    edgeIds: [...edgeIds].sort((left, right) => left - right),
    rootNodeIds: [...rootNodeIds].sort((left, right) => left - right),
  }
}

export function findUnconnectedNodeIds(
  graph: GraphResponse,
): number[] {
  const connectedNodeIds = new Set<number>();

  for (const edge of graph.edges) {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  }

  return graph.nodes
    .filter((node) => !connectedNodeIds.has(node.id))
    .map((node) => node.id)
    .sort((left, right) => left - right);
}

export function findBranchNodeIds(
  graph: GraphResponse,
  selectedNodeId: number,
): number[] {
  const existingNodeIds = new Set(
    graph.nodes.map((node) => node.id),
  );

  if (!existingNodeIds.has(selectedNodeId)) {
    return [];
  }

  const outgoing = new Map<number, number[]>();

  for (const edge of graph.edges) {
    if (
      !existingNodeIds.has(edge.source) ||
      !existingNodeIds.has(edge.target)
    ) {
      continue;
    }

    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }

  const visited = new Set<number>([selectedNodeId]);
  const queue = [selectedNodeId];

  for (let index = 0; index < queue.length; index += 1) {
    for (const target of outgoing.get(queue[index]) ?? []) {
      if (visited.has(target)) {
        continue;
      }

      visited.add(target);
      queue.push(target);
    }
  }

  return queue;
}
