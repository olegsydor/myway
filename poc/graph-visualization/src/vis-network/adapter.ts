import type {
  Edge as NetworkEdge,
  Node as NetworkNode,
} from 'vis-network'

import type { GraphResponse } from '../shared/types'

export interface VisNode extends NetworkNode {
  id: string
  originalId: number
  nodeType: string
  description: string | null
  attributes: Record<string, unknown>
}

export interface VisEdge extends NetworkEdge {
  id: string
  from: string
  to: string
  originalId: number
  edgeType: string
  description: string | null
  attributes: Record<string, unknown>
}

export interface VisElements {
  nodes: VisNode[]
  edges: VisEdge[]
}

const NODE_COLORS: Record<string, string> = {
  person: '#2563eb',
  event: '#dc2626',
  skill: '#16a34a',
  place: '#9333ea',
}

const DEFAULT_NODE_COLOR = '#475569'

export function toVisElements(
  graph: GraphResponse,
): VisElements {
  const nodes: VisNode[] = graph.nodes.map((node) => {
    const background =
      NODE_COLORS[node.type] ?? DEFAULT_NODE_COLOR

    return {
      id: `n-${node.id}`,
      originalId: node.id,
      nodeType: node.type,
      label: node.label,
      description: node.description,
      attributes: node.attributes,
      title:
        node.description ??
        `${node.type} #${node.id}`,
      shape: 'dot',
      size: 18,
      borderWidth: 2,
      color: {
        background,
        border: '#ffffff',
        highlight: {
          background,
          border: '#ef4444',
        },
        hover: {
          background,
          border: '#f59e0b',
        },
      },
      font: {
        color: '#e2e8f0',
        size: 14,
        face: 'system-ui',
        strokeWidth: 3,
        strokeColor: '#0f172a',
      },
    }
  })

  const edges: VisEdge[] = graph.edges.map((edge) => ({
    id: `e-${edge.id}`,
    originalId: edge.id,
    edgeType: edge.type,
    from: `n-${edge.source}`,
    to: `n-${edge.target}`,
    label: edge.type,
    description: edge.description,
    attributes: edge.attributes,
    title:
      edge.description ??
      `${edge.type} #${edge.id}`,
    arrows: {
      to: {
        enabled: true,
        scaleFactor: 0.7,
      },
    },
    color: {
      color: '#94a3b8',
      highlight: '#ef4444',
      hover: '#f59e0b',
      opacity: 0.85,
    },
    width: 2,
    selectionWidth: 4,
    hoverWidth: 3,
    font: {
      color: '#cbd5e1',
      size: 11,
      face: 'system-ui',
      strokeWidth: 3,
      strokeColor: '#0f172a',
      align: 'middle',
    },
    smooth: {
      enabled: true,
      type: 'continuous',
      roundness: 0.2,
    },
  }))

  return {
    nodes,
    edges,
  }
}
