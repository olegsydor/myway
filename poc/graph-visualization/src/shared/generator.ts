import type { GraphEdge, GraphNode, GraphResponse } from './types'

interface BaseBenchmarkPreset {
  label: string
  nodes: number
  edges: number
}

interface RandomBenchmarkPreset
  extends BaseBenchmarkPreset {
  topology?: 'random'
}

interface RealisticBenchmarkPreset
  extends BaseBenchmarkPreset {
  topology: 'realistic'
  rootsCount: number
  maxPathNodes: number
}

export type BenchmarkPreset =
  | RandomBenchmarkPreset
  | RealisticBenchmarkPreset

export const BENCHMARK_PRESETS: BenchmarkPreset[] = [
  {
    label: '100 Nodes / 100 Edges — realistic',
    nodes: 100,
    edges: 100,
    topology: 'realistic',
    rootsCount: 2,
    maxPathNodes: 20,
  },
  {
    label: '500 Nodes / 510 Edges — realistic',
    nodes: 500,
    edges: 510,
    topology: 'realistic',
    rootsCount: 4,
    maxPathNodes: 20,
  },
  {
    label: '1,000 Nodes / 1,020 Edges — realistic',
    nodes: 1_000,
    edges: 1_020,
    topology: 'realistic',
    rootsCount: 5,
    maxPathNodes: 20,
  },
  {
    label: '2,000 Nodes / 2,040 Edges — realistic',
    nodes: 2_000,
    edges: 2_040,
    topology: 'realistic',
    rootsCount: 6,
    maxPathNodes: 20,
  },
  {
    label: '5,000 Nodes / 5,100 Edges — realistic stress',
    nodes: 5_000,
    edges: 5_100,
    topology: 'realistic',
    rootsCount: 8,
    maxPathNodes: 20,
  },

  // Existing random/shallow/stress presets remain below.
  {
    label: '100 Nodes / 120 Edges — sparse',
    nodes: 100,
    edges: 120,
  },
  {
    label: '500 Nodes / 600 Edges — sparse',
    nodes: 500,
    edges: 600,
  },
  {
    label: '1,000 Nodes / 1,200 Edges — sparse',
    nodes: 1_000,
    edges: 1_200,
  },
  {
    label: '5,000 Nodes / 6,000 Edges — sparse',
    nodes: 5_000,
    edges: 6_000,
  },
  {
    label: '100 Nodes / 300 Edges — stress',
    nodes: 100,
    edges: 300,
  },
  {
    label: '500 Nodes / 1,500 Edges — stress',
    nodes: 500,
    edges: 1_500,
  },
  {
    label: '1,000 Nodes / 5,000 Edges — stress',
    nodes: 1_000,
    edges: 5_000,
  },
  {
    label: '5,000 Nodes / 20,000 Edges — stress',
    nodes: 5_000,
    edges: 20_000,
  },
]

const NODE_TYPES = ['person', 'skill', 'place', 'event']
const EDGE_TYPES = ['knows', 'has_skill', 'visited', 'participated_in']

const DEFAULT_SEED = 20_260_825

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5

    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)

    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

export function generateGraph(
  nodesCount: number,
  edgesCount: number,
  seed = DEFAULT_SEED,
): GraphResponse {
  if (!Number.isInteger(nodesCount) || nodesCount < 1) {
    throw new Error('nodesCount must be a positive integer')
  }

  if (!Number.isInteger(edgesCount) || edgesCount < 0) {
    throw new Error('edgesCount must be a non-negative integer')
  }

  const maximumEdges = nodesCount * (nodesCount - 1)

  if (edgesCount > maximumEdges) {
    throw new Error(
      `Cannot generate ${edgesCount} unique non-self edges for ${nodesCount} nodes`,
    )
  }

  const random = createSeededRandom(seed)

  const nodes: GraphNode[] = Array.from(
    { length: nodesCount },
    (_, index) => {
      const id = index + 1
      const type = NODE_TYPES[index % NODE_TYPES.length]

      return {
        id,
        type,
        label: `${type} ${id}`,
        description: `Generated benchmark node ${id}`,
        attributes: {
          benchmark: true,
          index: id,
        },
      }
    },
  )

  const edges: GraphEdge[] = []
  const existingPairs = new Set<string>()

  function addEdge(source: number, target: number): boolean {
    if (source === target) {
      return false
    }

    const pairKey = `${source}:${target}`

    if (existingPairs.has(pairKey)) {
      return false
    }

    existingPairs.add(pairKey)

    const id = edges.length + 1
    const type = EDGE_TYPES[(id - 1) % EDGE_TYPES.length]

    edges.push({
      id,
      type,
      source,
      target,
      description: `Generated ${type} edge ${id}`,
      attributes: {
        benchmark: true,
      },
    })

    return true
  }

  // Create a connected backbone first.
  for (
    let target = 2;
    target <= nodesCount && edges.length < edgesCount;
    target += 1
  ) {
    const source = 1 + Math.floor(random() * (target - 1))
    addEdge(source, target)
  }

  // Add the remaining directed edges deterministically.
  while (edges.length < edgesCount) {
    const source = 1 + Math.floor(random() * nodesCount)
    const target = 1 + Math.floor(random() * nodesCount)

    addEdge(source, target)
  }

  return {
    nodes,
    edges,
    meta: {
      nodes_count: nodes.length,
      edges_count: edges.length,
    },
  }
}
