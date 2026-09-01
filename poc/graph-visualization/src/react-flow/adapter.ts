import {
  MarkerType,
  Position,
  type Edge,
  type Node,
} from '@xyflow/react'

import type { GraphResponse } from '../shared/types'

export type ReactFlowNodeData = {
  originalId: number
  nodeType: string
  label: string
  description: string | null
  attributes: Record<string, unknown>
} & Record<string, unknown>

export type ReactFlowEdgeData = {
  originalId: number
  edgeType: string
  description: string | null
  attributes: Record<string, unknown>
} & Record<string, unknown>

export type ReactFlowNode = Node<ReactFlowNodeData>
export type ReactFlowEdge = Edge<ReactFlowEdgeData>

export interface ReactFlowElements {
  nodes: ReactFlowNode[]
  edges: ReactFlowEdge[]
}

const NODE_COLORS: Record<string, string> = {
  person: '#3b82f6',
  skill: '#10b981',
  place: '#f59e0b',
  event: '#8b5cf6',
  organization: '#475569',
  project: '#06b6d4',
  hobby: '#b45309',
}

export function toReactFlowElements(
  graph: GraphResponse,
): ReactFlowElements {
  const columns = Math.ceil(Math.sqrt(graph.nodes.length))

  const nodes: ReactFlowNode[] = graph.nodes.map(
    (node, index) => ({
      id: `n-${node.id}`,
      type: 'myWay',
      position: {
        x: (index % columns) * 180,
        y: Math.floor(index / columns) * 100,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        originalId: node.id,
        nodeType: node.type,
        label: node.label,
        description: node.description,
        attributes: node.attributes,
      },
      style: {
        width: 140,
        padding: 10,
        color: '#ffffff',
        backgroundColor:
          NODE_COLORS[node.type] ?? '#64748b',
        border: '2px solid #ffffff',
        borderRadius: 8,
      },
    }),
  )

  const edges: ReactFlowEdge[] = graph.edges.map((edge) => ({
    id: `e-${edge.id}`,
    type: 'myWay',
    source: `n-${edge.source}`,
    target: `n-${edge.target}`,
    label: edge.type,
    data: {
      originalId: edge.id,
      edgeType: edge.type,
      description: edge.description,
      attributes: edge.attributes,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
      color: '#94a3b8',
    },
    style: {
      stroke: '#94a3b8',
      strokeWidth: 2,
    },
    labelStyle: {
      fill: '#475467',
      fontSize: 10,
    },
  }))

  return {
    nodes,
    edges,
  }
}
