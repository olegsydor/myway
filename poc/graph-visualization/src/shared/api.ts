import type { GraphResponse } from './types'

const GRAPH_ENDPOINT = '/api/graph'

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
