import { findDirectedPath } from '../shared/graphAlgorithms'
import { useEffect, useRef, useState } from 'react'
import cytoscape, { type Core } from 'cytoscape'
import dagre from 'cytoscape-dagre'

import { toCytoscapeElements } from './adapter'
import type { GraphResponse } from '../shared/types'

cytoscape.use(dagre)

interface CytoscapeGraphProps {
  graph: GraphResponse
}

interface CytoscapeMetrics {
  adapterMs: number
  initializationMs: number
  layoutMs: number | null
}

type LayoutName =
  | 'grid'
  | 'circle'
  | 'cose'
  | 'dagre'

const NODE_COLORS: Record<string, string> = {
  person: '#3b82f6',
  skill: '#10b981',
  place: '#f59e0b',
  event: '#8b5cf6',
}

export function CytoscapeGraph({
  graph,
}: CytoscapeGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cytoscapeRef = useRef<Core | null>(null)

  const [selectedElement, setSelectedElement] = useState('None')
  const [metrics, setMetrics] = useState<CytoscapeMetrics>({
    adapterMs: 0,
    initializationMs: 0,
    layoutMs: null,
  })

  const [nodeSearch, setNodeSearch] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  const [selectedNodeType, setSelectedNodeType] = useState('all')

  const [pathStart, setPathStart] = useState('')
  const [pathEnd, setPathEnd] = useState('')

  const nodeTypes = [
    ...new Set(graph.nodes.map((node) => node.type)),
  ].sort()


  function handleNodeTypeFilter(nodeType: string) {
  const cy = cytoscapeRef.current

  if (!cy) {
    return
  }

  setSelectedNodeType(nodeType)

  cy.batch(() => {
    cy.elements().removeStyle('display')
    cy.elements().removeClass('dimmed highlighted')
    cy.elements().unselect()

    if (nodeType !== 'all') {
      const matchingNodes = cy.nodes().filter(
        (node) => node.data('type') === nodeType,
      )

      const hiddenNodes = cy.nodes().not(matchingNodes)
      hiddenNodes.style('display', 'none')

      cy.edges()
        .filter(
          (edge) =>
            edge.source().hidden() ||
            edge.target().hidden(),
        )
        .style('display', 'none')
    }
  })

  const visibleElements = cy
    .elements()
    .filter((element) => element.visible())

  if (visibleElements.length > 0) {
    cy.fit(visibleElements, 30)
  }

  setSelectedElement('None')
  setActionMessage(
    nodeType === 'all'
      ? 'Showing all Node types'
      : `Showing only type: ${nodeType}`,
  )
}

  function handleHighlightPath() {
  const cy = cytoscapeRef.current
  const startValue = pathStart.trim()
  const endValue = pathEnd.trim()

  if (!cy || !startValue || !endValue) {
    setActionMessage('Enter both path Node IDs')
    return
  }

  const startNodeId = Number(startValue)
  const endNodeId = Number(endValue)

  if (
    !Number.isInteger(startNodeId) ||
    !Number.isInteger(endNodeId)
  ) {
    setActionMessage('Path Node IDs must be integers')
    return
  }

  const path = findDirectedPath(
    graph,
    startNodeId,
    endNodeId,
  )

  if (!path) {
    setSelectedNodeType('all')

    cy.batch(() => {
      cy.elements().removeStyle('display')
      cy.elements().unselect()
      cy.elements().removeClass(
        'dimmed highlighted',
      )
    })

    setSelectedElement('None')

    setActionMessage(
      `No directed path from ${startNodeId} to ${endNodeId}`,
    )

    return
  }

  setSelectedNodeType('all')

  cy.batch(() => {
    cy.elements().removeStyle('display')
    cy.elements().unselect()
    cy.elements().removeClass('dimmed highlighted')
    cy.elements().addClass('dimmed')

    for (const nodeId of path.nodeIds) {
      cy.getElementById(`n-${nodeId}`)
        .removeClass('dimmed')
        .addClass('highlighted')
    }

    for (const edgeId of path.edgeIds) {
      cy.getElementById(`e-${edgeId}`)
        .removeClass('dimmed')
        .addClass('highlighted')
    }
  })

  const highlightedElements = cy.elements('.highlighted')

  if (highlightedElements.length > 0) {
    cy.fit(highlightedElements, 50)
  }

  setSelectedElement(
    `Path: ${startNodeId} → ${endNodeId}`,
  )

  setActionMessage(
    `Directed path found: ${path.nodeIds.length} Nodes / ${path.edgeIds.length} Edges`,
  )
}

  function handleFindNode() {
  const cy = cytoscapeRef.current
  const searchValue = nodeSearch.trim()

  if (!cy || !searchValue) {
    setActionMessage('Enter a Node ID or label')
    return
  }

  const normalizedSearch = searchValue.toLowerCase()

  const matchingNode = graph.nodes.find(
    (node) =>
      String(node.id) === searchValue ||
      node.label.toLowerCase().includes(normalizedSearch),
  )

  if (!matchingNode) {
    setActionMessage(`Node not found: ${searchValue}`)
    return
  }

  const cytoscapeNode = cy.getElementById(`n-${matchingNode.id}`)

  setSelectedNodeType('all')
  cy.elements().removeStyle('display')

  cy.batch(() => {
    cy.elements().removeClass('dimmed highlighted')
    cy.elements().unselect()
  })

  cytoscapeNode.select()

  cy.animate(
    {
      center: {
        eles: cytoscapeNode,
      },
      zoom: 1.5,
    },
    {
      duration: 300,
    },
  )

  setActionMessage(
    `Found Node ${matchingNode.id}: ${matchingNode.label}`,
  )
}

  function resetHighlighting() {
    const cy = cytoscapeRef.current

    if (!cy) {
      return
    }

    cy.batch(() => {
      cy.elements().removeClass('dimmed highlighted')
      cy.elements().unselect()
    })

    setSelectedElement('None')
    setActionMessage('')
  }

function runLayout(layoutName: LayoutName) {
  const cy = cytoscapeRef.current

  if (!cy) {
    return
  }

  const layoutStartedAt = performance.now()

  const dagreOptions: dagre.DagreLayoutOptions = {
    name: 'dagre',
    rankDir: 'LR',
    nodeSep: 40,
    edgeSep: 20,
    rankSep: 100,
    fit: true,
    padding: 30,
    animate: false,
  }

  const layout =
    layoutName === 'dagre'
      ? cy.layout(dagreOptions)
      : cy.layout({
          name: layoutName,
          fit: true,
          padding: 30,
          animate:
            layoutName !== 'cose' ||
            graph.nodes.length <= 500,
        })

  layout.on('layoutstop', () => {
    setMetrics((current) => ({
      ...current,
      layoutMs:
        performance.now() - layoutStartedAt,
    }))
  })

  layout.run()
}

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const adapterStartedAt = performance.now()
    const elements = toCytoscapeElements(graph)
    const adapterMs = performance.now() - adapterStartedAt

    const initializationStartedAt = performance.now()

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      layout: {
        name: 'preset',
      },
      minZoom: 0.05,
      maxZoom: 4,
      wheelSensitivity: 0.2,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#64748b',
            'border-color': '#ffffff',
            'border-width': 2,
            color: '#172033',
            label: 'data(label)',
            'font-size': 11,
            'min-zoomed-font-size': 8,
            'text-margin-y': -10,
            'text-outline-color': '#ffffff',
            'text-outline-width': 3,
            width: 28,
            height: 28,
          },
        },
        ...Object.entries(NODE_COLORS).map(([type, color]) => ({
          selector: `node[type = "${type}"]`,
          style: {
            'background-color': color,
          },
        })),
        {
          selector: 'edge',
          style: {
            color: '#475467',
            label: 'data(label)',
            'font-size': 9,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'min-zoomed-font-size': 8,
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px',
            width: 2,
          },
        },
        {
          selector: ':selected',
          style: {
            'border-color': '#ef4444',
            'border-width': 4,
          },
        },
        {
          selector: '.dimmed',
          style: {
            opacity: 0.12,
          },
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-color': '#ef4444',
            'border-width': 4,
            opacity: 1,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            'line-color': '#ef4444',
            'target-arrow-color': '#ef4444',
            opacity: 1,
            width: 4,
          },
        },
      ],
    })

    cytoscapeRef.current = cy

    setMetrics({
      adapterMs,
      initializationMs: performance.now() - initializationStartedAt,
      layoutMs: null,
    })

    cy.on('select', 'node', (event) => {
      const selectedNode = event.target
      const neighbourhood = selectedNode.closedNeighborhood()

      cy.batch(() => {
        cy.elements().removeClass('dimmed highlighted')
        cy.elements().addClass('dimmed')
        neighbourhood.removeClass('dimmed').addClass('highlighted')
      })

      setSelectedElement(
        `Node: ${String(selectedNode.data('label'))}`,
      )
    })

    cy.on('select', 'edge', (event) => {
      const selectedEdge = event.target
      const connectedElements = selectedEdge
        .connectedNodes()
        .union(selectedEdge)

      cy.batch(() => {
        cy.elements().removeClass('dimmed highlighted')
        cy.elements().addClass('dimmed')
        connectedElements
          .removeClass('dimmed')
          .addClass('highlighted')
      })

      setSelectedElement(
        `Edge: ${String(selectedEdge.data('label'))}`,
      )
    })

    cy.on('tap', (event) => {
      if (event.target === cy) {
        cy.batch(() => {
          cy.elements().removeClass('dimmed highlighted')
          cy.elements().unselect()
        })

        setSelectedElement('None')
      }
    })

    const initialLayoutStartedAt = performance.now()
    const initialLayout = cy.layout({
      name: 'grid',
      fit: true,
      padding: 30,
      animate: false,
    })

    initialLayout.on('layoutstop', () => {
      setMetrics((current) => ({
        ...current,
        layoutMs: performance.now() - initialLayoutStartedAt,
      }))
    })

    initialLayout.run()

    return () => {
      cy.destroy()
      cytoscapeRef.current = null
    }
  }, [graph])

  return (
    <section className="cytoscape-panel">
      <div className="cytoscape-toolbar">
        <strong>Cytoscape.js 3.34.2</strong>

        <button type="button" onClick={() => runLayout('grid')}>
          Grid
        </button>

        <button type="button" onClick={() => runLayout('circle')}>
          Circle
        </button>

        <button type="button" onClick={() => runLayout('cose')}>
          COSE
        </button>

        <button
          type="button"
          onClick={() => runLayout('dagre')}
        >
          Dagre
        </button>

        <button
          type="button"
          onClick={() => cytoscapeRef.current?.fit(undefined, 30)}
        >
          Fit
        </button>

        <button type="button" onClick={resetHighlighting}>
          Reset selection
        </button>
      </div>

      <div className="cytoscape-product-controls">
      < div className="cytoscape-control-group">
        <label htmlFor="cytoscape-node-search">
          Find Node
        </label>

        <input
          id="cytoscape-node-search"
          type="search"
          value={nodeSearch}
          placeholder="ID or label"
          onChange={(event) => setNodeSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              handleFindNode()
            }
          }}
        />

        <button type="button" onClick={handleFindNode}>
          Find
        </button>
      </div>

      <div className="cytoscape-control-group">
  <label htmlFor="cytoscape-node-type">
    Node type
  </label>

  <select
    id="cytoscape-node-type"
    value={selectedNodeType}
    onChange={(event) => {
      handleNodeTypeFilter(event.target.value)
    }}
  >
    <option value="all">All types</option>

    {nodeTypes.map((nodeType) => (
      <option key={nodeType} value={nodeType}>
        {nodeType}
      </option>
    ))}
  </select>
</div>

<div className="cytoscape-control-group">
  <label htmlFor="cytoscape-path-start">
    Path start ID
  </label>

  <input
    id="cytoscape-path-start"
    type="number"
    value={pathStart}
    onChange={(event) => setPathStart(event.target.value)}
  />

  <label htmlFor="cytoscape-path-end">
    Path end ID
  </label>

  <input
    id="cytoscape-path-end"
    type="number"
    value={pathEnd}
    onChange={(event) => setPathEnd(event.target.value)}
  />

  <button type="button" onClick={handleHighlightPath}>
    Find path
  </button>
</div>

      {actionMessage && (
        <span className="cytoscape-action-message">
          {actionMessage}
        </span>
      )}
    </div>



      <div className="cytoscape-metrics">
        <span>Adapter: {metrics.adapterMs.toFixed(2)} ms</span>
        <span>
          Initialization: {metrics.initializationMs.toFixed(2)} ms
        </span>
        <span>
          Layout:{' '}
          {metrics.layoutMs === null
            ? '—'
            : `${metrics.layoutMs.toFixed(2)} ms`}
        </span>
        <span>Selected: {selectedElement}</span>
      </div>

      <div
        ref={containerRef}
        className="cytoscape-container"
      />
    </section>
  )
}
