import { lazy, Suspense, useEffect, useState } from 'react'

import './App.css'
import { fetchGraph } from './shared/api'
import type { GraphResponse } from './shared/types'
import { layoutRecoveryScope } from './react-flow/layoutRecoveryScope'

const ReactFlowGraph = lazy(() =>
  import('./react-flow/ReactFlowGraph').then((module) => ({
    default: module.ReactFlowGraph,
  })),
)

function App() {
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refreshGraph() {
    const graphData = await fetchGraph()
    setGraph(graphData)
  }

  useEffect(() => {
    async function loadInitialGraph() {
      try {
        setIsLoading(true)
        setError(null)

        const graphData = await fetchGraph()
        setGraph(graphData)
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

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>My Way</h1>
          <p>Personal graph</p>
        </div>
      </header>

      <main className="app__content">
        {error && <p className="error">{error}</p>}

        {isLoading && !graph && <p>Loading graph…</p>}

        {!isLoading && !graph && !error && (
          <p>No graph data available.</p>
        )}

        {graph && (
          <Suspense fallback={<p>Loading graph…</p>}>
            <ReactFlowGraph
              graph={graph}
              onGraphChanged={refreshGraph}
              recoveryScope={layoutRecoveryScope(graph.user_id)}
            />
          </Suspense>
        )}
      </main>
    </div>
  )
}

export default App