import { useEffect, useRef, useState } from 'react'
import Sigma from 'sigma'
import { EdgeArrowProgram } from 'sigma/rendering'

import { toSigmaGraph } from './adapter'
import type { GraphResponse } from '../shared/types'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { fitViewportToNodes } from '@sigma/utils'
import { findDirectedPath } from '../shared/graphAlgorithms'

interface SigmaGraphProps {
  graph: GraphResponse
}

interface SigmaMetrics {
  adapterMs: number
  initializationMs: number
  firstRenderMs: number | null
  layoutMs: number | null
}

type SigmaLayoutName = 'grid' | 'circle' | 'forceAtlas2'
type SigmaHighlightMode = 'selection' | 'path' | null

export function SigmaGraph({
  graph: graphData,
}: SigmaGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<Sigma | null>(null)

  const highlightedNodesRef = useRef<Set<string>>(new Set())
  const highlightedEdgesRef = useRef<Set<string>>(new Set())

  const highlightModeRef = useRef<SigmaHighlightMode>(null)

  const [selectedElement, setSelectedElement] = useState('None')
  const [metrics, setMetrics] = useState<SigmaMetrics>({
    adapterMs: 0,
    initializationMs: 0,
    firstRenderMs: null,
    layoutMs: null,
  })
  const [nodeSearch, setNodeSearch] = useState('')
  const [selectedNodeType, setSelectedNodeType] =
  useState('all')

  const nodeTypes = [
  ...new Set(graphData.nodes.map((node) => node.type)),
].sort()
  const [actionMessage, setActionMessage] = useState('')
  const [pathStart, setPathStart] = useState('')
  const [pathEnd, setPathEnd] = useState('')

  function handleNodeTypeFilter(nodeType: string) {
  const renderer = rendererRef.current

  highlightModeRef.current = null
  if (!renderer) {
    return
  }

  const graph = renderer.getGraph()
  const hiddenNodes = new Set<string>()


  graph.updateEachNodeAttributes(
    (node, attributes) => {
      const hidden =
        nodeType !== 'all' &&
        attributes.nodeType !== nodeType

      if (hidden) {
        hiddenNodes.add(node)
      }

      return {
        ...attributes,
        hidden,
      }
    },
  )

  graph.updateEachEdgeAttributes(
    (_edge, attributes, source, target) => ({
      ...attributes,
      hidden:
        hiddenNodes.has(source) ||
        hiddenNodes.has(target),
    }),
  )

  highlightedNodesRef.current = new Set()
  highlightedEdgesRef.current = new Set()

  setSelectedNodeType(nodeType)
  setSelectedElement('None')

  setActionMessage(
    nodeType === 'all'
      ? 'Showing all Node types'
      : `Showing only type: ${nodeType}`,
  )

  renderer.setCustomBBox(null)
  renderer.refresh()
  renderer.getCamera().animatedReset({ duration: 300 })
}

  function handleHighlightPath() {
  const renderer = rendererRef.current
  const startValue = pathStart.trim()
  const endValue = pathEnd.trim()

  if (!renderer || !startValue || !endValue) {
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
    graphData,
    startNodeId,
    endNodeId,
  )

  if (!path) {
    setActionMessage(
      `No directed path from ${startNodeId} to ${endNodeId}`,
    )
    return
  }

  const graph = renderer.getGraph()

  graph.updateEachNodeAttributes(
    (_node, attributes) => ({
      ...attributes,
      hidden: false,
    }),
  )

  graph.updateEachEdgeAttributes(
    (_edge, attributes) => ({
      ...attributes,
      hidden: false,
    }),
  )

  const pathNodeKeys = path.nodeIds.map(
    (nodeId) => `n-${nodeId}`,
  )

  const pathEdgeKeys = path.edgeIds.map(
    (edgeId) => `e-${edgeId}`,
  )

  highlightedNodesRef.current = new Set(pathNodeKeys)
  highlightedEdgesRef.current = new Set(pathEdgeKeys)

  setSelectedNodeType('all')
  setSelectedElement(
    `Path: ${startNodeId} → ${endNodeId}`,
  )

  setActionMessage(
    `Directed path found: ${path.nodeIds.length} Nodes / ${path.edgeIds.length} Edges`,
  )

  highlightModeRef.current = 'path'
  renderer.refresh()

  void fitViewportToNodes(
    renderer,
    pathNodeKeys,
    {
      animate: true,
    },
  )
}

  function handleFindNode() {
  const renderer = rendererRef.current
  const searchValue = nodeSearch.trim()

  if (!renderer || !searchValue) {
    setActionMessage('Enter a Node ID or label')
    return
  }

  const normalizedSearch = searchValue.toLowerCase()

  const matchingNode = graphData.nodes.find(
    (node) =>
      String(node.id) === searchValue ||
      node.label.toLowerCase().includes(normalizedSearch),
  )

  if (!matchingNode) {
    setActionMessage(`Node not found: ${searchValue}`)
    return
  }

  const graph = renderer.getGraph()

  graph.updateEachNodeAttributes(
  (_node, attributes) => ({
    ...attributes,
    hidden: false,
  }),
)

graph.updateEachEdgeAttributes(
  (_edge, attributes) => ({
    ...attributes,
    hidden: false,
  }),
)

setSelectedNodeType('all')

  const nodeKey = `n-${matchingNode.id}`

  highlightedNodesRef.current = new Set([
    nodeKey,
    ...graph.neighbors(nodeKey),
  ])

  highlightedEdgesRef.current = new Set(
    graph.edges(nodeKey),
  )

  highlightModeRef.current = 'selection'
  renderer.refresh()

  void fitViewportToNodes(
    renderer,
    [...highlightedNodesRef.current],
    {
      animate: true,
    },
  )

  setSelectedElement(
    `Node: ${matchingNode.label}`,
  )

  setActionMessage(
    `Found Node ${matchingNode.id}: ${matchingNode.label}`,
  )
}

  function resetHighlighting() {
    highlightedNodesRef.current = new Set()
    highlightedEdgesRef.current = new Set()

    highlightModeRef.current = null
    rendererRef.current?.refresh()
    setSelectedElement('None')
    setActionMessage('')
  }

  function resetView() {
    rendererRef.current
      ?.getCamera()
      .animatedReset({ duration: 300 })
  }

  function runLayout(layoutName: SigmaLayoutName) {
  const renderer = rendererRef.current

  if (!renderer) {
    return
  }

  const graph = renderer.getGraph()
  const layoutStartedAt = performance.now()

  setMetrics((current) => ({
    ...current,
    layoutMs: null,
  }))

  renderer.once('afterRender', () => {
    setMetrics((current) => ({
      ...current,
      layoutMs: performance.now() - layoutStartedAt,
    }))
  })

  if (layoutName === 'grid') {
    const columns = Math.ceil(Math.sqrt(graph.order))
    let index = 0

    graph.updateEachNodeAttributes(
      (_node, attributes) => {
        const currentIndex = index
        index += 1

        return {
          ...attributes,
          x: currentIndex % columns,
          y: Math.floor(currentIndex / columns),
        }
      },
    )
  }

  if (layoutName === 'circle') {
    const nodeCount = Math.max(graph.order, 1)
    const radius = Math.max(nodeCount / (2 * Math.PI), 1)
    let index = 0

    graph.updateEachNodeAttributes(
      (_node, attributes) => {
        const angle =
          (2 * Math.PI * index) / nodeCount

        index += 1

        return {
          ...attributes,
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle),
        }
      },
    )
  }

  if (layoutName === 'forceAtlas2') {
    forceAtlas2.assign(graph, {
      iterations: 100,
      settings: forceAtlas2.inferSettings(graph),
    })
  }

  renderer.setCustomBBox(null)
  renderer.refresh()

  renderer
    .getCamera()
    .animatedReset({ duration: 300 })
}

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const adapterStartedAt = performance.now()
    const graph = toSigmaGraph(graphData)
    const adapterMs = performance.now() - adapterStartedAt

    const initializationStartedAt = performance.now()

    const renderer = new Sigma(graph, container, {
      defaultEdgeType: 'arrow',
      edgeProgramClasses: {
        arrow: EdgeArrowProgram,
      },
      renderEdgeLabels: true,
      enableEdgeEvents: true,
      minCameraRatio: 0.05,
      maxCameraRatio: 10,
      zIndex: true,

      nodeReducer: (node, attributes) => {
        const highlightedNodes = highlightedNodesRef.current
        const highlightedEdges = highlightedEdgesRef.current
        const hasHighlighting =
          highlightedNodes.size > 0 ||
          highlightedEdges.size > 0

        if (!hasHighlighting) {
          return attributes
        }

        if (
          highlightModeRef.current === 'path' &&
          !highlightedNodes.has(node)
        ) {
          return {
            ...attributes,
            hidden: true,
            label: '',
          }
        }

        if (highlightedNodes.has(node)) {
          return {
            ...attributes,
            color: '#ef4444',
            size: attributes.size * 1.5,
            forceLabel: true,
            zIndex: 1,
          }
        }

        return {
          ...attributes,
          color: '#d1d5db',
          label: '',
          zIndex: 0,
        }
      },

      edgeReducer: (edge, attributes) => {
        const highlightedNodes = highlightedNodesRef.current
        const highlightedEdges = highlightedEdgesRef.current
        const hasHighlighting =
          highlightedNodes.size > 0 ||
          highlightedEdges.size > 0

        if (!hasHighlighting) {
          return attributes
        }

        if (
          highlightModeRef.current === 'path' &&
          !highlightedEdges.has(edge)
        ) {
          return {
            ...attributes,
            hidden: true,
            label: '',
          }
        }

        if (highlightedEdges.has(edge)) {
          return {
            ...attributes,
            color: '#ef4444',
            size: Math.max(attributes.size * 2, 3),
            forceLabel: true,
            zIndex: 1,
          }
        }

        return {
          ...attributes,
          color: '#e2e8f0',
          label: '',
          zIndex: 0,
        }
      },
    })

    rendererRef.current = renderer

    setMetrics({
      adapterMs,
      initializationMs:
        performance.now() - initializationStartedAt,
      firstRenderMs: null,
      layoutMs: null,
    })

    const firstRenderStartedAt = performance.now()

    renderer.once('afterRender', () => {
      setMetrics((current) => ({
        ...current,
        firstRenderMs:
          performance.now() - firstRenderStartedAt,
      }))
    })

    renderer.refresh()

    renderer.on('clickNode', ({ node }) => {
      highlightedNodesRef.current = new Set([
        node,
        ...graph.neighbors(node),
      ])

      highlightedEdgesRef.current = new Set(
        graph.edges(node),
      )

      highlightModeRef.current = 'selection'
      renderer.refresh()

      setSelectedElement(
        `Node: ${String(graph.getNodeAttribute(node, 'label'))}`,
      )
    })

    renderer.on('clickEdge', ({ edge }) => {
      const [source, target] = graph.extremities(edge)

      highlightedNodesRef.current = new Set([
        source,
        target,
      ])

      highlightedEdgesRef.current = new Set([edge])

      highlightModeRef.current = 'selection'
      renderer.refresh()

      setSelectedElement(
        `Edge: ${String(graph.getEdgeAttribute(edge, 'label'))}`,
      )
    })

    renderer.on('clickStage', () => {
      highlightedNodesRef.current = new Set()
      highlightedEdgesRef.current = new Set()

      highlightModeRef.current = null
      renderer.refresh()
      setSelectedElement('None')
    })

    let draggedNode: string | null = null
    let isDragging = false

    renderer.on('downNode', ({ node, event }) => {
      draggedNode = node
      isDragging = true

      event.preventSigmaDefault()
      renderer.getCamera().disable()
    })

    renderer
      .getMouseCaptor()
      .on('mousemovebody', (event) => {
        if (!isDragging || !draggedNode) {
          return
        }

        const position = renderer.viewportToGraph(event)

        graph.mergeNodeAttributes(draggedNode, {
          x: position.x,
          y: position.y,
        })
      })

    renderer.getMouseCaptor().on('mouseup', () => {
      draggedNode = null
      isDragging = false
      renderer.getCamera().enable()
    })

    renderer.getMouseCaptor().on('mousedown', () => {
      if (!renderer.getCustomBBox()) {
        renderer.setCustomBBox(renderer.getBBox())
      }
    })

    return () => {
      renderer.kill()
      rendererRef.current = null
      highlightedNodesRef.current = new Set()
      highlightedEdgesRef.current = new Set()
      highlightModeRef.current = null
    }
  }, [graphData])

  return (
    <section className="sigma-panel">
      <div className="sigma-toolbar">
        <strong>
          Sigma.js 3.0.3 + Graphology 0.26.0
        </strong>

        <button type="button" onClick={() => runLayout('grid')}>
          Grid
        </button>

        <button type="button" onClick={() => runLayout('circle')}>
          Circle
        </button>

        <button
          type="button"
          onClick={() => runLayout('forceAtlas2')}
        >
          ForceAtlas2
        </button>

        <button type="button" onClick={resetView}>
          Reset view
        </button>

        <button type="button" onClick={resetHighlighting}>
          Reset selection
        </button>
      </div>

      <div className="sigma-product-controls">
  <div className="sigma-control-group">
    <label htmlFor="sigma-node-search">
      Find Node
    </label>

    <input
      id="sigma-node-search"
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

  <div className="sigma-control-group">
  <label htmlFor="sigma-node-type">
    Node type
  </label>

  <select
    id="sigma-node-type"
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

<div className="sigma-control-group">
  <label htmlFor="sigma-path-start">
    Path start ID
  </label>

  <input
    id="sigma-path-start"
    type="number"
    value={pathStart}
    onChange={(event) => setPathStart(event.target.value)}
  />

  <label htmlFor="sigma-path-end">
    Path end ID
  </label>

  <input
    id="sigma-path-end"
    type="number"
    value={pathEnd}
    onChange={(event) => setPathEnd(event.target.value)}
  />

  <button type="button" onClick={handleHighlightPath}>
    Find path
  </button>
</div>

  {actionMessage && (
    <span className="sigma-action-message">
      {actionMessage}
    </span>
  )}
</div>

      <div className="sigma-metrics">
        <span>
          Adapter: {metrics.adapterMs.toFixed(2)} ms
        </span>

        <span>
          Initialization:{' '}
          {metrics.initializationMs.toFixed(2)} ms
        </span>

        <span>
          First render:{' '}
          {metrics.firstRenderMs === null
            ? '—'
            : `${metrics.firstRenderMs.toFixed(2)} ms`}
        </span>

        <span>
          Layout:{' '}
          {metrics.layoutMs === null
            ? '—'
            : `${metrics.layoutMs.toFixed(2)} ms`}
        </span>

        <span>Selected: {selectedElement}</span>
      </div>

      <div ref={containerRef} className="sigma-container" />
    </section>
  )
}
