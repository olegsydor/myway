export interface GraphNode {
  id: number
  type: string
  label: string
  description: string | null
  attributes: Record<string, unknown>
}

export interface GraphEdge {
  id: number
  type: string
  source: number
  target: number
  description: string | null
  attributes: Record<string, unknown>
}

export interface GraphMeta {
  nodes_count: number
  edges_count: number
}

export interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  meta: GraphMeta
}
