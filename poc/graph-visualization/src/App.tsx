import { lazy, Suspense, useEffect, useMemo, useState } from 'react'

import './App.css'
import { fetchGraph } from './shared/api'

import {
  BENCHMARK_PRESETS,
  generateGraph,
} from './shared/generator'

import {
  generateRealisticGraph,
} from './shared/realisticGenerator'

import type { GraphResponse } from './shared/types'

import {
  analyzeGraphTopology,
} from './shared/graphAnalysis'

const CytoscapeGraph = lazy(() =>
  import('./cytoscape/CytoscapeGraph').then((module) => ({
    default: module.CytoscapeGraph,
  })),
)

const SigmaGraph = lazy(() =>
  import('./sigma/SigmaGraph').then((module) => ({
    default: module.SigmaGraph,
  })),
)

const ReactFlowGraph = lazy(() =>
  import('./react-flow/ReactFlowGraph').then((module) => ({
    default: module.ReactFlowGraph,
  })),
)

const VisNetworkGraph = lazy(() =>
  import('./vis-network/VisNetworkGraph').then((module) => ({
    default: module.VisNetworkGraph,
  })),
)

type GraphCandidate =
  | 'cytoscape'
  | 'sigma'
  | 'react-flow'
  | 'vis-network'

function App() {
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0)
  const [preparationMs, setPreparationMs] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidate, setCandidate] =
    useState<GraphCandidate>('cytoscape')

  const topologyMetrics = useMemo(
  () =>
    graph === null
      ? null
      : analyzeGraphTopology(graph),
  [graph],
)

  async function handleLoadGraph() {
    setIsLoading(true)
    setError(null)

    const startedAt = performance.now()

    try {
      await refreshGraph()
      setPreparationMs(performance.now() - startedAt)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unknown error while loading graph',
      )
    } finally {
      setIsLoading(false)
    }
  }

  async function refreshGraph() {
    const graphData = await fetchGraph()

    setGraph(graphData)
    setSource('GET /graph')
  }

  useEffect(() => {
    async function loadInitialGraph() {
      try {
        setIsLoading(true)
        setError(null)

        const graphData = await fetchGraph()

        setGraph(graphData)
        setSource('GET /graph')
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load graph',
        )
      } finally {
        setIsLoading(false)
      }
    }

    void loadInitialGraph()
  }, [])

  function handleGenerateGraph() {
    setError(null)

    const preset = BENCHMARK_PRESETS[selectedPresetIndex]
    const startedAt = performance.now()
    const graphData =
      preset.topology === 'realistic'
        ? generateRealisticGraph(
            preset.nodes,
            preset.edges,
            {
              rootsCount: preset.rootsCount,
              maxPathNodes: preset.maxPathNodes,
            },
          )
        : generateGraph(
            preset.nodes,
            preset.edges,
          )

    setGraph(graphData)
    setSource(preset.label)
    setPreparationMs(performance.now() - startedAt)
  }



  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>My Way graph visualization PoC</h1>
          <p>Shared API and benchmark data layer</p>
        </div>

        <div className="app__actions">

          <div className="benchmark-control">
            <label htmlFor="graph-candidate">
              Candidate
            </label>

            <select
              id="graph-candidate"
              value={candidate}
              onChange={(event) => {
                setCandidate(event.target.value as GraphCandidate)
              }}
            >
              <option value="cytoscape">Cytoscape.js</option>
              <option value="sigma">Sigma.js + Graphology</option>
              <option value="react-flow">React Flow</option>
              <option value="vis-network">vis-network</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleLoadGraph}
            disabled={isLoading}
          >
            {isLoading ? 'Loading…' : 'Load GET /graph'}
          </button>

          <div className="benchmark-control">
            <label htmlFor="benchmark-preset">Benchmark graph</label>

            <select
              id="benchmark-preset"
              value={selectedPresetIndex}
              onChange={(event) => {
                setSelectedPresetIndex(Number(event.target.value))
              }}
            >
              {BENCHMARK_PRESETS.map((preset, index) => (
                <option key={preset.label} value={index}>
                  {preset.label}
                </option>
              ))}
            </select>

            <button type="button" onClick={handleGenerateGraph}>
              Generate
            </button>
          </div>
        </div>
      </header>

      <main className="app__content">
        {error && <p className="error">{error}</p>}

        {!graph && !error && (
          <p>Load the API graph or generate a benchmark graph.</p>
        )}

        {graph && (
          <>
            <section className="summary">
              <div>
                <strong>{graph.meta.nodes_count}</strong>
                <span>Nodes</span>
              </div>

              <div>
                <strong>{graph.meta.edges_count}</strong>
                <span>Edges</span>
              </div>

              <div>
                <strong>
                  {preparationMs === null
                    ? '—'
                    : preparationMs.toFixed(2)}
                </strong>
                <span>Data preparation, ms</span>
              </div>
            </section>

            {topologyMetrics !== null && (
              <section className="summary">
                <div>
                  <strong>
                    {topologyMetrics.rootsCount}
                  </strong>
                  <span>Roots</span>
                </div>

                <div>
                  <strong>
                    {topologyMetrics.maxInDegree}
                  </strong>
                  <span>Max in-degree</span>
                </div>

                <div>
                  <strong>
                    {topologyMetrics.nodesWithTwoIncoming}
                    {' '}
                    (
                    {topologyMetrics
                      .nodesWithTwoIncomingPercent
                      .toFixed(2)}
                    %)
                  </strong>
                  <span>Nodes with 2 incoming</span>
                </div>

                <div>
                  <strong>
                    {
                      topologyMetrics
                        .nodesWithMoreThanTwoIncoming
                    }
                  </strong>
                  <span>Nodes with more than 2 incoming</span>
                </div>

                <div>
                  <strong>
                    {topologyMetrics.maxOutDegree}
                  </strong>
                  <span>Max out-degree</span>
                </div>

                <div>
                  <strong>
                    {topologyMetrics.declaredMaxDepth === null
                      ? '—'
                      : `${
                          topologyMetrics.declaredMaxDepth
                        } Edges / ${
                          topologyMetrics.declaredMaxDepth + 1
                        } Nodes`}
                  </strong>
                  <span>Declared maximum depth</span>
                </div>

                <div>
                  <strong>
                    {topologyMetrics.declaredCycleEdges}
                  </strong>
                  <span>Declared cycle Edges</span>
                </div>
              </section>
            )}

            <p className="source-details">
              Source: <strong>{source}</strong>
            </p>

            <Suspense fallback={<p>Loading graph renderer…</p>}>
              {candidate === 'cytoscape' && (
                <CytoscapeGraph graph={graph} />
              )}

              {candidate === 'sigma' && (
                <SigmaGraph graph={graph} />
              )}

              {candidate === 'react-flow' && (
                <ReactFlowGraph
                  graph={graph}
                  onGraphChanged={refreshGraph}
                />
              )}

              {candidate === 'vis-network' && (
                <VisNetworkGraph graph={graph} />
              )}
            </Suspense>

            <section>
              <h2>Data preview</h2>

              <pre>
                {JSON.stringify(
                  {
                    nodes: graph.nodes.slice(0, 3),
                    edges: graph.edges.slice(0, 3),
                    meta: graph.meta,
                  },
                  null,
                  2,
                )}
              </pre>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

export default App
