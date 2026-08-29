import type { GraphResponse } from './types'

export interface GraphTopologyMetrics {
  rootsCount: number
  maxInDegree: number
  maxOutDegree: number
  nodesWithTwoIncoming: number
  nodesWithTwoIncomingPercent: number
  nodesWithMoreThanTwoIncoming: number
  declaredMaxDepth: number | null
  declaredCycleEdges: number
}

export function analyzeGraphTopology(
  graph: GraphResponse,
): GraphTopologyMetrics {
  const incomingCount = new Map<number, number>()
  const outgoingCount = new Map<number, number>()

  for (const node of graph.nodes) {
    incomingCount.set(node.id, 0)
    outgoingCount.set(node.id, 0)
  }

  for (const edge of graph.edges) {
    incomingCount.set(
      edge.target,
      (incomingCount.get(edge.target) ?? 0) + 1,
    )

    outgoingCount.set(
      edge.source,
      (outgoingCount.get(edge.source) ?? 0) + 1,
    )
  }

  const incomingValues = [
    ...incomingCount.values(),
  ]

  const outgoingValues = [
    ...outgoingCount.values(),
  ]

  const rootsCount = incomingValues.filter(
    (count) => count === 0,
  ).length

  const nodesWithTwoIncoming =
    incomingValues.filter(
      (count) => count === 2,
    ).length

  const nodesWithMoreThanTwoIncoming =
    incomingValues.filter(
      (count) => count > 2,
    ).length

  const declaredDepths = graph.nodes
    .map((node) => node.attributes.depth)
    .filter(
      (value): value is number =>
        typeof value === 'number' &&
        Number.isFinite(value),
    )

  const declaredCycleEdges = graph.edges.filter(
    (edge) => edge.attributes.cycle === true,
  ).length

  return {
    rootsCount,
    maxInDegree:
      incomingValues.length === 0
        ? 0
        : Math.max(...incomingValues),
    maxOutDegree:
      outgoingValues.length === 0
        ? 0
        : Math.max(...outgoingValues),
    nodesWithTwoIncoming,
    nodesWithTwoIncomingPercent:
      graph.nodes.length === 0
        ? 0
        : (
            nodesWithTwoIncoming /
            graph.nodes.length
          ) * 100,
    nodesWithMoreThanTwoIncoming,
    declaredMaxDepth:
      declaredDepths.length === 0
        ? null
        : Math.max(...declaredDepths),
    declaredCycleEdges,
  }
}
