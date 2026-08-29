import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { DataSet } from 'vis-data'
import {
  Network,
  type Options,
} from 'vis-network'

import {
  toVisElements,
  type VisEdge,
  type VisNode,
} from './adapter'
import type { GraphResponse } from '../shared/types'

interface VisNetworkGraphProps {
  graph: GraphResponse
}

interface VisNetworkMetrics {
  adapterMs: number
  initializationMs: number
  firstRenderMs: number | null
  layoutMs: number | null
}

const NETWORK_OPTIONS: Options = {
  autoResize: true,
  layout: {
    randomSeed: 42,
    improvedLayout: false,
  },
  interaction: {
    dragNodes: true,
    dragView: true,
    hover: false,
    multiselect: false,
    navigationButtons: false,
    selectConnectedEdges: false,
    zoomView: true,
  },
  nodes: {
    shape: 'dot',
  },
  edges: {
    arrows: {
      to: {
        enabled: true,
        scaleFactor: 0.7,
      },
    },
  },
  physics: {
    enabled: false,
  },
}

export function VisNetworkGraph({
  graph: graphData,
}: VisNetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(
    null,
  )

  const networkRef = useRef<Network | null>(null)

  const [selectedElement, setSelectedElement] =
    useState('None')

  const [metrics, setMetrics] =
    useState<VisNetworkMetrics>({
      adapterMs: 0,
      initializationMs: 0,
      firstRenderMs: null,
      layoutMs: null,
    })

  const fitGraph = useCallback(() => {
    networkRef.current?.fit({
      animation: {
        duration: 300,
        easingFunction: 'easeInOutQuad',
      },
    })
  }, [])

  const resetSelection = useCallback(() => {
    networkRef.current?.unselectAll()
    setSelectedElement('None')
  }, [])

  useEffect(() => {
    const container = containerRef.current

    if (container === null) {
      return
    }

    const adapterStartedAt = performance.now()
    const elements = toVisElements(graphData)
    const adapterMs =
      performance.now() - adapterStartedAt

    const firstRenderStartedAt = performance.now()
    const initializationStartedAt =
      performance.now()

    const nodeDataSet = new DataSet<VisNode>(
      elements.nodes,
    )

    const edgeDataSet = new DataSet<VisEdge>(
      elements.edges,
    )

    const network = new Network(
      container,
      {
        nodes: nodeDataSet,
        edges: edgeDataSet,
      },
      NETWORK_OPTIONS,
    )

    networkRef.current = network

    const initializationMs =
      performance.now() - initializationStartedAt

    setSelectedElement('None')

    setMetrics({
      adapterMs,
      initializationMs,
      firstRenderMs: null,
      layoutMs: null,
    })

    network.once('afterDrawing', () => {
      setMetrics((current) => ({
        ...current,
        firstRenderMs:
          performance.now() - firstRenderStartedAt,
      }))
    })

    network.on('selectNode', (params) => {
      const selectedNodeId = String(params.nodes[0])
      const selectedNode =
        nodeDataSet.get(selectedNodeId)

      setSelectedElement(
        selectedNode === null
          ? `Node: ${selectedNodeId}`
          : `Node: ${String(selectedNode.label)}`,
      )
    })

    network.on('selectEdge', (params) => {
      const selectedEdgeId = String(params.edges[0])
      const selectedEdge =
        edgeDataSet.get(selectedEdgeId)

      setSelectedElement(
        selectedEdge === null
          ? `Edge: ${selectedEdgeId}`
          : `Edge: ${String(selectedEdge.label)}`,
      )
    })

    network.on('click', (params) => {
      if (
        params.nodes.length === 0 &&
        params.edges.length === 0
      ) {
        setSelectedElement('None')
      }
    })

    return () => {
      network.destroy()

      if (networkRef.current === network) {
        networkRef.current = null
      }
    }
  }, [graphData])

  return (
    <section className="vis-network-panel">
      <div className="vis-network-toolbar">
        <strong>vis-network 10.1.2</strong>

        <button
          type="button"
          onClick={fitGraph}
        >
          Fit
        </button>

        <button
          type="button"
          onClick={resetSelection}
        >
          Reset selection
        </button>
      </div>

      <div className="vis-network-metrics">
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

      <div
        ref={containerRef}
        className="vis-network-container"
      />
    </section>
  )
}
