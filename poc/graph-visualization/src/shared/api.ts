
import type {
  EdgeType,
  GraphResponse,
  NodeType,
  NodeCreate,
  NodeRead,
  NodeUpdate,
  EdgeCreate,
  EdgeRead,
  EdgeUpdate,
} from './types'

const GRAPH_ENDPOINT = '/api/graph'
const NODE_TYPES_ENDPOINT = '/api/node-types'
const EDGE_TYPES_ENDPOINT = '/api/edge-types'
const NODES_ENDPOINT = '/api/nodes'
const EDGES_ENDPOINT = '/api/edges'

export async function fetchGraph(
  signal?: AbortSignal,
): Promise<GraphResponse> {
  const response = await fetch(GRAPH_ENDPOINT, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(
      `GET /graph failed: ${response.status} ${response.statusText}`,
    )
  }

  return (await response.json()) as GraphResponse
}

export async function fetchNodeTypes(
  signal?: AbortSignal,
): Promise<NodeType[]> {
  const response = await fetch(NODE_TYPES_ENDPOINT, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(
      `GET /node-types failed: ${response.status} ${response.statusText}`,
    )
  }

  return (await response.json()) as NodeType[]
}


export async function fetchEdgeTypes(
  signal?: AbortSignal,
): Promise<EdgeType[]> {
  const response = await fetch(EDGE_TYPES_ENDPOINT, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(
      `GET /edge-types failed: ${response.status} ${response.statusText}`,
    )
  }

  return (await response.json()) as EdgeType[]
}

export async function createNode(
  data: NodeCreate,
): Promise<NodeRead> {
  const response = await fetch(NODES_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    throw new Error(
      `POST /nodes failed: ${response.status} ${response.statusText}`,
    )
  }

  return (await response.json()) as NodeRead
}

export async function updateNode(
  nodeId: number,
  data: NodeUpdate,
): Promise<NodeRead> {
  const response = await fetch(
    `${NODES_ENDPOINT}/${nodeId}`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    },
  )

  if (!response.ok) {
    throw new Error(
      `PATCH /nodes/${nodeId} failed: ${response.status} ${response.statusText}`,
    )
  }

  return (await response.json()) as NodeRead
}

export async function createEdge(
  data: EdgeCreate,
): Promise<EdgeRead> {
  const response = await fetch(EDGES_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

if (!response.ok) {
  const errorData = await response.json().catch(() => null)

  throw new Error(
    errorData?.detail ??
      `POST /edges failed: ${response.status} ${response.statusText}`,
  )
}

  return (await response.json()) as EdgeRead
}

export async function updateEdge(
  edgeId: number,
  data: EdgeUpdate,
): Promise<EdgeRead> {
  const response = await fetch(
    `${EDGES_ENDPOINT}/${edgeId}`,
    {
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    },
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => null)

    throw new Error(
      errorData?.detail ??
        `PATCH /edges/${edgeId} failed: ${response.status} ${response.statusText}`,
    )
  }

  return (await response.json()) as EdgeRead
}

export async function deleteEdge(
  edgeId: number,
): Promise<void> {
  const response = await fetch(
    `${EDGES_ENDPOINT}/${edgeId}`,
    {
      method: 'DELETE',
    },
  )

  if (!response.ok) {
    throw new Error(
      `DELETE /edges/${edgeId} failed: ${response.status} ${response.statusText}`,
    )
  }
}


export async function deleteNode(
  nodeId: number,
): Promise<void> {
  const response = await fetch(
    `${NODES_ENDPOINT}/${nodeId}`,
    {
      method: 'DELETE',
    },
  )

  if (!response.ok) {
    let message =
      `DELETE /nodes/${nodeId} failed: ` +
      `${response.status} ${response.statusText}`

    try {
      const body = (await response.json()) as {
        detail?: string
      }

      if (body.detail) {
        message = body.detail
      }
    } catch {
      // Keep the generic HTTP error message.
    }

    throw new Error(message)
  }
}