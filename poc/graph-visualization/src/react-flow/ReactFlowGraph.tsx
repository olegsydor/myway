import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type EdgeMouseHandler,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react'
import { Graph, layout as dagreLayout } from '@dagrejs/dagre'

import {
  findDirectedPath,
} from '../shared/graphAlgorithms'

import '@xyflow/react/dist/style.css'

import {
  toReactFlowElements,
  type ReactFlowEdge,
  type ReactFlowNode,
} from './adapter'
import type { GraphResponse } from '../shared/types'

interface ReactFlowGraphProps {
  graph: GraphResponse
}

const NODE_WIDTH = 160
const NODE_HEIGHT = 60

interface ReactFlowMetrics {
  adapterMs: number
  initializationMs: number
  firstRenderMs: number | null
  layoutMs: number | null
}

export function ReactFlowGraph({
  graph: graphData,
}: ReactFlowGraphProps) {
  const instanceRef = useRef<ReactFlowInstance<
    ReactFlowNode,
    ReactFlowEdge
  > | null>(null)

  const [nodes, setNodes, onNodesChange] =
    useNodesState<ReactFlowNode>([])

  const [edges, setEdges, onEdgesChange] =
    useEdgesState<ReactFlowEdge>([])

  const [selectedElement, setSelectedElement] =
    useState('None')

  const [metrics, setMetrics] =
    useState<ReactFlowMetrics>({
      adapterMs: 0,
      initializationMs: 0,
      firstRenderMs: null,
      layoutMs: null,
    })

  const [nodeSearch, setNodeSearch] = useState('')
  const [selectedNodeType, setSelectedNodeType] =
    useState('all')

  const [pathStart, setPathStart] = useState('')
  const [pathEnd, setPathEnd] = useState('')
  const [actionMessage, setActionMessage] =
    useState('')

  const nodeTypes = [
    ...new Set(
      graphData.nodes.map((node) => node.type),
    ),
  ].sort()

  const resetHighlighting = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        selected: false,
        style: {
          ...node.style,
          opacity: 1,
          border: '2px solid #ffffff',
        },
      })),
    )

    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({
        ...edge,
        selected: false,
        style: {
          ...edge.style,
          opacity: 1,
          stroke: '#94a3b8',
          strokeWidth: 2,
        },
        markerEnd:
          typeof edge.markerEnd === 'object'
            ? {
                ...edge.markerEnd,
                color: '#94a3b8',
              }
            : edge.markerEnd,
      })),
    )

    setSelectedElement('None')
    setActionMessage('')
  }, [setEdges, setNodes])

  function fitNodeIds(nodeIds: Set<string>) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const instance = instanceRef.current

      if (!instance) {
        return
      }

      const matchingNodes = instance
        .getNodes()
        .filter((node) => nodeIds.has(node.id))

      if (matchingNodes.length > 0) {
        void instance.fitView({
          nodes: matchingNodes,
          padding: 0.2,
          duration: 300,
        })
      }
    })
  })
}

function restoreAllElements() {
  setNodes((currentNodes) =>
    currentNodes.map((node) => ({
      ...node,
      hidden: false,
      selected: false,
      style: {
        ...node.style,
        opacity: 1,
        border: '2px solid #ffffff',
      },
    })),
  )

  setEdges((currentEdges) =>
    currentEdges.map((edge) => ({
      ...edge,
      hidden: false,
      selected: false,
      style: {
        ...edge.style,
        opacity: 1,
        stroke: '#94a3b8',
        strokeWidth: 2,
      },
      markerEnd:
        typeof edge.markerEnd === 'object'
          ? {
              ...edge.markerEnd,
              color: '#94a3b8',
            }
          : edge.markerEnd,
    })),
  )

  setSelectedElement('None')
}

  const handleNodeClick: NodeMouseHandler<
    ReactFlowNode
  > = useCallback(
    (_event, selectedNode) => {
      const connectedEdgeIds = new Set(
        graphData.edges
          .filter(
            (edge) =>
              `n-${edge.source}` === selectedNode.id ||
              `n-${edge.target}` === selectedNode.id,
          )
          .map((edge) => `e-${edge.id}`),
      )

      const neighbourNodeIds = new Set<string>([
        selectedNode.id,
      ])

      for (const edge of graphData.edges) {
        if (`n-${edge.source}` === selectedNode.id) {
          neighbourNodeIds.add(`n-${edge.target}`)
        }

        if (`n-${edge.target}` === selectedNode.id) {
          neighbourNodeIds.add(`n-${edge.source}`)
        }
      }

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const highlighted = neighbourNodeIds.has(
            node.id,
          )

          return {
            ...node,
            selected: node.id === selectedNode.id,
            style: {
              ...node.style,
              opacity: highlighted ? 1 : 0.12,
              border: highlighted
                ? '3px solid #ef4444'
                : '2px solid #ffffff',
            },
          }
        }),
      )

      setEdges((currentEdges) =>
        currentEdges.map((edge) => {
          const highlighted = connectedEdgeIds.has(
            edge.id,
          )

          return {
            ...edge,
            selected: false,
            style: {
              ...edge.style,
              opacity: highlighted ? 1 : 0.1,
              stroke: highlighted
                ? '#ef4444'
                : '#cbd5e1',
              strokeWidth: highlighted ? 4 : 1,
            },
            markerEnd:
              typeof edge.markerEnd === 'object'
                ? {
                    ...edge.markerEnd,
                    color: highlighted
                      ? '#ef4444'
                      : '#cbd5e1',
                  }
                : edge.markerEnd,
          }
        }),
      )

      setSelectedElement(
        `Node: ${String(selectedNode.data.label)}`,
      )
    },
    [graphData.edges, setEdges, setNodes],
  )

  const handleEdgeClick: EdgeMouseHandler<
    ReactFlowEdge
  > = useCallback(
    (_event, selectedEdge) => {
      const connectedNodeIds = new Set([
        selectedEdge.source,
        selectedEdge.target,
      ])

      setNodes((currentNodes) =>
        currentNodes.map((node) => {
          const highlighted = connectedNodeIds.has(
            node.id,
          )

          return {
            ...node,
            selected: false,
            style: {
              ...node.style,
              opacity: highlighted ? 1 : 0.12,
              border: highlighted
                ? '3px solid #ef4444'
                : '2px solid #ffffff',
            },
          }
        }),
      )

      setEdges((currentEdges) =>
        currentEdges.map((edge) => {
          const highlighted =
            edge.id === selectedEdge.id

          return {
            ...edge,
            selected: highlighted,
            style: {
              ...edge.style,
              opacity: highlighted ? 1 : 0.1,
              stroke: highlighted
                ? '#ef4444'
                : '#cbd5e1',
              strokeWidth: highlighted ? 4 : 1,
            },
            markerEnd:
              typeof edge.markerEnd === 'object'
                ? {
                    ...edge.markerEnd,
                    color: highlighted
                      ? '#ef4444'
                      : '#cbd5e1',
                  }
                : edge.markerEnd,
          }
        }),
      )

      setSelectedElement(
        `Edge: ${String(selectedEdge.label)}`,
      )
    },
    [setEdges, setNodes],
  )

  function handleFindNode() {
  const searchValue = nodeSearch.trim()

  if (!searchValue) {
    setActionMessage('Enter a Node ID or label')
    return
  }

  const normalizedSearch =
    searchValue.toLowerCase()

  const matchingNode = graphData.nodes.find(
    (node) =>
      String(node.id) === searchValue ||
      node.label
        .toLowerCase()
        .includes(normalizedSearch),
  )

  if (!matchingNode) {
    setActionMessage(
      `Node not found: ${searchValue}`,
    )
    return
  }

  const flowNodeId = `n-${matchingNode.id}`

  setSelectedNodeType('all')

  setNodes((currentNodes) =>
    currentNodes.map((node) => ({
      ...node,
      hidden: false,
      selected: node.id === flowNodeId,
      style: {
        ...node.style,
        opacity: 1,
        border:
          node.id === flowNodeId
            ? '3px solid #ef4444'
            : '2px solid #ffffff',
      },
    })),
  )

  setEdges((currentEdges) =>
    currentEdges.map((edge) => ({
      ...edge,
      hidden: false,
      selected: false,
      style: {
        ...edge.style,
        opacity: 1,
        stroke: '#94a3b8',
        strokeWidth: 2,
      },
      markerEnd:
        typeof edge.markerEnd === 'object'
          ? {
              ...edge.markerEnd,
              color: '#94a3b8',
            }
          : edge.markerEnd,
    })),
  )

  setSelectedElement(
    `Node: ${matchingNode.label}`,
  )

  setActionMessage(
    `Found Node ${matchingNode.id}: ${matchingNode.label}`,
  )

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const instance = instanceRef.current
      const flowNode = instance?.getNode(flowNodeId)

      if (!instance || !flowNode) {
        return
      }

      void instance.setCenter(
        flowNode.position.x + NODE_WIDTH / 2,
        flowNode.position.y + NODE_HEIGHT / 2,
        {
          zoom: 1.5,
          duration: 300,
        },
      )
    })
  })
}

function handleNodeTypeFilter(nodeType: string) {
  setSelectedNodeType(nodeType)

  const visibleNodeIds = new Set(
    graphData.nodes
      .filter(
        (node) =>
          nodeType === 'all' ||
          node.type === nodeType,
      )
      .map((node) => `n-${node.id}`),
  )

  setNodes((currentNodes) =>
    currentNodes.map((node) => ({
      ...node,
      hidden: !visibleNodeIds.has(node.id),
      selected: false,
      style: {
        ...node.style,
        opacity: 1,
        border: '2px solid #ffffff',
      },
    })),
  )

  setEdges((currentEdges) =>
    currentEdges.map((edge) => {
      const visible =
        visibleNodeIds.has(edge.source) &&
        visibleNodeIds.has(edge.target)

      return {
        ...edge,
        hidden: !visible,
        selected: false,
        style: {
          ...edge.style,
          opacity: 1,
          stroke: '#94a3b8',
          strokeWidth: 2,
        },
        markerEnd:
          typeof edge.markerEnd === 'object'
            ? {
                ...edge.markerEnd,
                color: '#94a3b8',
              }
            : edge.markerEnd,
      }
    }),
  )

  setSelectedElement('None')

  setActionMessage(
    nodeType === 'all'
      ? 'Showing all Node types'
      : `Showing only type: ${nodeType}`,
  )

  fitNodeIds(visibleNodeIds)
}

function handleHighlightPath() {
  const startValue = pathStart.trim()
  const endValue = pathEnd.trim()

  if (!startValue || !endValue) {
    setActionMessage('Enter both path Node IDs')
    return
  }

  const startNodeId = Number(startValue)
  const endNodeId = Number(endValue)

  if (
    !Number.isInteger(startNodeId) ||
    !Number.isInteger(endNodeId)
  ) {
    setActionMessage(
      'Path Node IDs must be integers',
    )
    return
  }

  const path = findDirectedPath(
    graphData,
    startNodeId,
    endNodeId,
  )

  setSelectedNodeType('all')

  if (!path) {
    /*
     * A failed valid search must clear the previous
     * path so stale highlighting is not misleading.
     */
    restoreAllElements()

    setActionMessage(
      `No directed path from ${startNodeId} to ${endNodeId}`,
    )

    return
  }

  const pathNodeIds = new Set(
    path.nodeIds.map((nodeId) => `n-${nodeId}`),
  )

  const pathEdgeIds = new Set(
    path.edgeIds.map((edgeId) => `e-${edgeId}`),
  )

  setNodes((currentNodes) =>
    currentNodes.map((node) => {
      const highlighted = pathNodeIds.has(node.id)

      return {
        ...node,
        hidden: false,
        selected: false,
        style: {
          ...node.style,
          opacity: highlighted ? 1 : 0.08,
          border: highlighted
            ? '3px solid #ef4444'
            : '2px solid #ffffff',
        },
      }
    }),
  )

  setEdges((currentEdges) =>
    currentEdges.map((edge) => {
      const highlighted = pathEdgeIds.has(edge.id)

      return {
        ...edge,
        hidden: false,
        selected: false,
        style: {
          ...edge.style,
          opacity: highlighted ? 1 : 0.06,
          stroke: highlighted
            ? '#ef4444'
            : '#cbd5e1',
          strokeWidth: highlighted ? 4 : 1,
        },
        markerEnd:
          typeof edge.markerEnd === 'object'
            ? {
                ...edge.markerEnd,
                color: highlighted
                  ? '#ef4444'
                  : '#cbd5e1',
              }
            : edge.markerEnd,
      }
    }),
  )

  setSelectedElement(
    `Path: ${startNodeId} → ${endNodeId}`,
  )

  setActionMessage(
    `Directed path found: ${path.nodeIds.length} Nodes / ${path.edgeIds.length} Edges`,
  )

  fitNodeIds(pathNodeIds)
}

  const runLayout = useCallback(
  (layoutName: 'grid' | 'circle' | 'dagre') => {
    const layoutStartedAt = performance.now()

    let positionedNodes: ReactFlowNode[]

    if (layoutName === 'grid') {
      const columns = Math.ceil(
        Math.sqrt(nodes.length),
      )

      positionedNodes = nodes.map((node, index) => ({
        ...node,
        position: {
          x: (index % columns) * 200,
          y: Math.floor(index / columns) * 100,
        },
      }))
    } else if (layoutName === 'circle') {
      const nodeCount = Math.max(nodes.length, 1)
      const radius = Math.max(250, nodeCount * 25)

      positionedNodes = nodes.map((node, index) => {
        const angle =
          (2 * Math.PI * index) / nodeCount

        return {
          ...node,
          position: {
            x: radius * Math.cos(angle),
            y: radius * Math.sin(angle),
          },
        }
      })
    } else {
      const dagreGraph = new Graph({
        multigraph: true,
      })

      dagreGraph.setGraph({
        rankdir: 'LR',
        nodesep: 60,
        ranksep: 100,
        marginx: 30,
        marginy: 30,
      })

      dagreGraph.setDefaultEdgeLabel(() => ({}))

      for (const node of nodes) {
        dagreGraph.setNode(node.id, {
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        })
      }

      for (const edge of edges) {
        dagreGraph.setEdge(
          edge.source,
          edge.target,
          {},
          edge.id,
        )
      }

      dagreLayout(dagreGraph)

      positionedNodes = nodes.map((node) => {
        const dagreNode = dagreGraph.node(node.id)

        return {
          ...node,
          position: {
            x:
              (dagreNode.x ?? 0) -
              NODE_WIDTH / 2,
            y:
              (dagreNode.y ?? 0) -
              NODE_HEIGHT / 2,
          },
        }
      })
    }

    setNodes(positionedNodes)

    setMetrics((current) => ({
      ...current,
      layoutMs:
        performance.now() - layoutStartedAt,
    }))

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void instanceRef.current?.fitView({
          padding: 0.1,
          duration: 300,
        })
      })
    })
  },
  [edges, nodes, setNodes],
)

  useEffect(() => {
    const adapterStartedAt = performance.now()
    const elements = toReactFlowElements(graphData)
    const adapterMs = performance.now() - adapterStartedAt

    const initializationStartedAt = performance.now()
    const renderStartedAt = performance.now()

    setNodes(elements.nodes)
    setEdges(elements.edges)
    setSelectedElement('None')

    setMetrics({
      adapterMs,
      initializationMs:
        performance.now() - initializationStartedAt,
      firstRenderMs: null,
      layoutMs: null,
    })

    const firstFrame = requestAnimationFrame(() => {
      const secondFrame = requestAnimationFrame(() => {
        setMetrics((current) => ({
          ...current,
          firstRenderMs:
            performance.now() - renderStartedAt,
        }))
      })

      return () => cancelAnimationFrame(secondFrame)
    })

    return () => {
      cancelAnimationFrame(firstFrame)
    }
  }, [graphData, setEdges, setNodes])

  return (
    <section className="react-flow-panel">
      <div className="react-flow-toolbar">
        <strong>
          React Flow 12.11.5
        </strong>

        <button
          type="button"
          onClick={() => runLayout('grid')}
        >
          Grid
        </button>

        <button
          type="button"
          onClick={() => runLayout('circle')}
        >
          Circle
        </button>

        <button
          type="button"
          onClick={() => runLayout('dagre')}
        >
          Dagre
        </button>

        <button
          type="button"
          onClick={() => {
            void instanceRef.current?.fitView({
              padding: 0.1,
              duration: 300,
            })
          }}
        >
          Fit
        </button>

        <button
          type="button"
          onClick={resetHighlighting}
        >
          Reset selection
        </button>
      </div>

      <div className="react-flow-product-controls">
        <div className="react-flow-control-group">
          <label htmlFor="react-flow-node-search">
            Find Node
          </label>

          <input
            id="react-flow-node-search"
            type="search"
            value={nodeSearch}
            placeholder="ID or label"
            onChange={(event) => {
              setNodeSearch(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleFindNode()
              }
            }}
          />

          <button
            type="button"
            onClick={handleFindNode}
          >
            Find
          </button>
        </div>

        <div className="react-flow-control-group">
          <label htmlFor="react-flow-node-type">
            Node type
          </label>

          <select
            id="react-flow-node-type"
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

        <div className="react-flow-control-group">
          <label htmlFor="react-flow-path-start">
            Path start ID
          </label>

          <input
            id="react-flow-path-start"
            type="number"
            value={pathStart}
            onChange={(event) => {
              setPathStart(event.target.value)
            }}
          />

          <label htmlFor="react-flow-path-end">
            Path end ID
          </label>

          <input
            id="react-flow-path-end"
            type="number"
            value={pathEnd}
            onChange={(event) => {
              setPathEnd(event.target.value)
            }}
          />

          <button
            type="button"
            onClick={handleHighlightPath}
          >
            Find path
          </button>
        </div>

        {actionMessage && (
          <span className="react-flow-action-message">
            {actionMessage}
          </span>
        )}
      </div>

      <div className="react-flow-metrics">
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

      <div className="react-flow-container">
        <ReactFlow<ReactFlowNode, ReactFlowEdge>
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={resetHighlighting}
          onInit={(instance) => {
            instanceRef.current = instance
          }}
          fitView
          fitViewOptions={{ padding: 0.1 }}
          minZoom={0.05}
          maxZoom={4}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          onlyRenderVisibleElements
          elevateEdgesOnSelect
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </section>
  )
}
