import { MultiDirectedGraph } from 'graphology'

import type { GraphResponse } from '../shared/types'

export type SigmaNodeAttributes = {
  originalId: number
  nodeType: string
  label: string
  description: string | null
  attributes: Record<string, unknown>
  x: number
  y: number
  size: number
  color: string
  hidden?: boolean
}

export type SigmaEdgeAttributes = {
  originalId: number
  edgeType: string
  label: string
  description: string | null
  attributes: Record<string, unknown>
  size: number
  color: string
  hidden?: boolean
}

export type SigmaGraph = MultiDirectedGraph<
  SigmaNodeAttributes,
  SigmaEdgeAttributes
>

const NODE_COLORS: Record<string, string> = {
  person: '#3b82f6',
  skill: '#10b981',
  place: '#f59e0b',
  event: '#8b5cf6',
}

export function toSigmaGraph(
  graphData: GraphResponse,
): SigmaGraph {
  const graph = new MultiDirectedGraph<
    SigmaNodeAttributes,
    SigmaEdgeAttributes
  >({
    allowSelfLoops: true,
  })

  const columns = Math.ceil(
    Math.sqrt(graphData.nodes.length),
  )

  graphData.nodes.forEach((node, index) => {
    graph.addNode(`n-${node.id}`, {
      originalId: node.id,
      nodeType: node.type,
      label: node.label,
      description: node.description,
      attributes: node.attributes,
      x: index % columns,
      y: Math.floor(index / columns),
      size: 8,
      color: NODE_COLORS[node.type] ?? '#64748b',
    })
  })

  for (const edge of graphData.edges) {
    graph.addDirectedEdgeWithKey(
      `e-${edge.id}`,
      `n-${edge.source}`,
      `n-${edge.target}`,
      {
        originalId: edge.id,
        edgeType: edge.type,
        label: edge.type,
        description: edge.description,
        attributes: edge.attributes,
        size: 2,
        color: '#94a3b8',
      },
    )
  }

  return graph
}
