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
