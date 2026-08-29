import type {
  GraphEdge,
  GraphNode,
  GraphResponse,
} from './types'

const NODE_TYPES = [
  'person',
  'skill',
  'place',
  'event',
]

const EDGE_TYPES = [
  'knows',
  'has_skill',
  'visited',
  'participated_in',
]

const DEFAULT_SEED = 20_260_828
const MAX_SECOND_INCOMING_RATIO = 0.03

export interface RealisticGraphOptions {
  rootsCount: number
  maxPathNodes: number
}

function createSeededRandom(
  seed: number,
): () => number {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5

    let value = state

    value = Math.imul(
      value ^ (value >>> 15),
      value | 1,
    )

    value ^=
      value +
      Math.imul(
        value ^ (value >>> 7),
        value | 61,
      )

    return (
      ((value ^ (value >>> 14)) >>> 0) /
      4_294_967_296
    )
  }
}

export function generateRealisticGraph(
  nodesCount: number,
  edgesCount: number,
  options: RealisticGraphOptions,
  seed = DEFAULT_SEED,
): GraphResponse {
  const {
    rootsCount,
    maxPathNodes,
  } = options

  if (!Number.isInteger(nodesCount) || nodesCount < 1) {
    throw new Error(
      'nodesCount must be a positive integer',
    )
  }

  if (
    !Number.isInteger(rootsCount) ||
    rootsCount < 1 ||
    rootsCount > Math.min(10, nodesCount)
  ) {
    throw new Error(
      'rootsCount must be between 1 and min(10, nodesCount)',
    )
  }

  if (
    !Number.isInteger(maxPathNodes) ||
    maxPathNodes < 1 ||
    maxPathNodes > 20
  ) {
    throw new Error(
      'maxPathNodes must be between 1 and 20',
    )
  }

  const primaryEdgesCount =
    nodesCount - rootsCount

  const maximumSecondIncomingNodes = Math.floor(
    nodesCount * MAX_SECOND_INCOMING_RATIO,
  )

  const maximumEdgesCount =
    primaryEdgesCount +
    maximumSecondIncomingNodes

  if (
    edgesCount < primaryEdgesCount ||
    edgesCount > maximumEdgesCount
  ) {
    throw new Error(
      [
        `Realistic graph with ${nodesCount} nodes`,
        `and ${rootsCount} roots must contain`,
        `between ${primaryEdgesCount}`,
        `and ${maximumEdgesCount} edges`,
      ].join(' '),
    )
  }

  const random = createSeededRandom(seed)

  const edges: GraphEdge[] = []
  const existingPairs = new Set<string>()
  const incomingCount = new Array<number>(
    nodesCount + 1,
  ).fill(0)

  const depth = new Array<number>(
    nodesCount + 1,
  ).fill(0)

  function addEdge(
    source: number,
    target: number,
    cycle: boolean,
  ): boolean {
    if (
      source === target ||
      target <= rootsCount ||
      incomingCount[target] >= 2
    ) {
      return false
    }

    const pairKey = `${source}:${target}`

    if (existingPairs.has(pairKey)) {
      return false
    }

    existingPairs.add(pairKey)
    incomingCount[target] += 1

    const id = edges.length + 1
    const type =
      EDGE_TYPES[(id - 1) % EDGE_TYPES.length]

    edges.push({
      id,
      type,
      source,
      target,
      description: `Generated ${type} edge ${id}`,
      attributes: {
        benchmark: true,
        topology: 'realistic',
        cycle,
      },
    })

    return true
  }

  const rootIds = Array.from(
    { length: rootsCount },
    (_, index) => index + 1,
  )

  const createdNodeIds = [...rootIds]
  const sourcePool = [...rootIds]

  /*
   * Create one guaranteed long chain:
   *
   * root → node → node → ... → node
   */
  const actualPathNodes = Math.min(
    maxPathNodes,
    nodesCount - rootsCount + 1,
  )

  const chainNodeIds = [rootIds[0]]

  for (
    let pathIndex = 1;
    pathIndex < actualPathNodes;
    pathIndex += 1
  ) {
    const target = rootsCount + pathIndex
    const source =
      chainNodeIds[chainNodeIds.length - 1]

    addEdge(source, target, false)

    depth[target] = pathIndex
    chainNodeIds.push(target)
    createdNodeIds.push(target)

    if (pathIndex < maxPathNodes - 1) {
      sourcePool.push(target)
    }
  }

  /*
   * Roots and several Nodes from the long chain act
   * as hubs. They receive a higher probability of
   * being selected as parents.
   */
  const hubIds = [
    ...rootIds,
    chainNodeIds[3],
    chainNodeIds[7],
    chainNodeIds[12],
  ].filter(
    (nodeId): nodeId is number =>
      nodeId !== undefined,
  )

  const firstUncreatedNodeId =
    rootsCount + actualPathNodes

  for (
    let target = firstUncreatedNodeId;
    target <= nodesCount;
    target += 1
  ) {
    const usableHubs = hubIds.filter(
      (nodeId) =>
        depth[nodeId] < maxPathNodes - 1,
    )

    const useHub =
      usableHubs.length > 0 &&
      random() < 0.45

    const candidates = useHub
      ? usableHubs
      : sourcePool

    const source =
      candidates[
        Math.floor(random() * candidates.length)
      ]

    addEdge(source, target, false)

    depth[target] = depth[source] + 1
    createdNodeIds.push(target)

    if (depth[target] < maxPathNodes - 1) {
      sourcePool.push(target)
    }
  }

  const additionalEdgesCount =
    edgesCount - primaryEdgesCount

  /*
   * A very small part of the additional-edge budget
   * creates deterministic two-node cycles inside the
   * guaranteed chain.
   */
  const desiredCycleEdges =
    additionalEdgesCount === 0
      ? 0
      : Math.max(
          1,
          Math.floor(nodesCount / 1_000),
        )

  const cycleEdgesCount = Math.min(
    desiredCycleEdges,
    additionalEdgesCount,
    Math.max(0, chainNodeIds.length - 2),
  )

  for (
    let index = 0;
    index < cycleEdgesCount;
    index += 1
  ) {
    const target = chainNodeIds[index + 1]
    const source = chainNodeIds[index + 2]

    addEdge(source, target, true)
  }

  /*
   * Add the remaining second incoming Edges.
   * They always go from a lower depth to a higher
   * depth, so they create merges without introducing
   * additional cycles.
   */
  const eligibleTargets = createdNodeIds.filter(
    (nodeId) =>
      nodeId > rootsCount &&
      incomingCount[nodeId] === 1,
  )

  while (
    edges.length < edgesCount &&
    eligibleTargets.length > 0
  ) {
    const targetIndex = Math.floor(
      random() * eligibleTargets.length,
    )

    const target = eligibleTargets[targetIndex]

    const possibleSources = sourcePool.filter(
      (source) =>
        depth[source] < depth[target] &&
        !existingPairs.has(`${source}:${target}`),
    )

    if (possibleSources.length === 0) {
      eligibleTargets.splice(targetIndex, 1)
      continue
    }

    const hubSources = possibleSources.filter(
      (source) => hubIds.includes(source),
    )

    const candidates =
      hubSources.length > 0 && random() < 0.45
        ? hubSources
        : possibleSources

    const source =
      candidates[
        Math.floor(random() * candidates.length)
      ]

    addEdge(source, target, false)
    eligibleTargets.splice(targetIndex, 1)
  }

  if (edges.length !== edgesCount) {
    throw new Error(
      `Generated ${edges.length} of ${edgesCount} requested edges`,
    )
  }

  const nodes: GraphNode[] = Array.from(
    { length: nodesCount },
    (_, index) => {
      const id = index + 1
      const type =
        NODE_TYPES[index % NODE_TYPES.length]

      return {
        id,
        type,
        label: `${type} ${id}`,
        description:
          `Generated realistic benchmark node ${id}`,
        attributes: {
          benchmark: true,
          topology: 'realistic',
          depth: depth[id],
          root: id <= rootsCount,
        },
      }
    },
  )

  return {
    nodes,
    edges,
    meta: {
      nodes_count: nodes.length,
      edges_count: edges.length,
    },
  }
}
