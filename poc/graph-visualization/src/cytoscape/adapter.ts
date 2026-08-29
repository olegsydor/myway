import type { ElementDefinition } from 'cytoscape'

import type { GraphResponse } from '../shared/types'

export function toCytoscapeElements(
  graph: GraphResponse,
): ElementDefinition[] {
  const nodes: ElementDefinition[] = graph.nodes.map((node) => ({
    group: 'nodes',
    data: {
      id: `n-${node.id}`,
      originalId: node.id,
      type: node.type,
      label: node.label,
      description: node.description,
      attributes: node.attributes,
    },
  }))

  const edges: ElementDefinition[] = graph.edges.map((edge) => ({
    group: 'edges',
    data: {
      id: `e-${edge.id}`,
      originalId: edge.id,
      type: edge.type,
      label: edge.type,
      source: `n-${edge.source}`,
      target: `n-${edge.target}`,
      description: edge.description,
      attributes: edge.attributes,
    },
  }))

  return [...nodes, ...edges]
}
