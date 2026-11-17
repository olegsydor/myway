import { GRAPH_APPEARANCE, NODE_APPEARANCE, FALLBACK_NODE_APPEARANCE } from './graphAppearance.ts'
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
        color: GRAPH_APPEARANCE.text,
        backgroundColor: (NODE_APPEARANCE[node.type] ?? FALLBACK_NODE_APPEARANCE).surface,
        backgroundImage: `linear-gradient(to right, ${(NODE_APPEARANCE[node.type] ?? FALLBACK_NODE_APPEARANCE).marker} 3px, transparent 3px)`,
        border: `2px solid ${GRAPH_APPEARANCE.border}`,
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
      width: GRAPH_APPEARANCE.markerSize,
      height: GRAPH_APPEARANCE.markerSize,
      color: GRAPH_APPEARANCE.edge,
    },
    style: {
      stroke: GRAPH_APPEARANCE.edge,
      strokeWidth: GRAPH_APPEARANCE.edgeWidth,
    },
    labelStyle: {
      fill: GRAPH_APPEARANCE.text,
      fontSize: 10,
    },
  }))

  return {
    nodes,
    edges,
  }
}
