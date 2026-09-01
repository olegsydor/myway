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

export interface NodeType {
  id: number
  code: string
  name: string
}

export interface EdgeType {
  id: number
  code: string
  name: string
}

export interface NodeCreate {
  node_type_id: number
  display_name: string
  description: string | null
  properties: Record<string, unknown>
}

export interface NodeRead {
  id: number
  user_id: number
  node_type_id: number
  display_name: string
  description: string | null
  properties: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface NodeUpdate {
  node_type_id?: number
  display_name?: string
  description?: string | null
  properties?: Record<string, unknown>
}

export interface EdgeCreate {
  source_node_id: number
  target_node_id: number
  edge_type_id: number
  description: string | null
  properties: Record<string, unknown>
}

export interface EdgeRead {
  id: number
  user_id: number
  source_node_id: number
  target_node_id: number
  edge_type_id: number
  description: string | null
  properties: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface EdgeUpdate {
  source_node_id?: number
  target_node_id?: number
  edge_type_id?: number
  description?: string | null
  properties?: Record<string, unknown>
}