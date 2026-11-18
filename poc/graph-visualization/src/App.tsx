import { AccountButton } from "./auth/AuthContext"
import { AuthGate } from "./auth/AuthGate"
import { ApplicationShell } from "./shell/ApplicationShell"
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

function WorkspaceApp() {
  const [graph, setGraph] = useState<GraphResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refreshGraph() {
    const graphData = await fetchGraph()
    setGraph(graphData)
  }

  useEffect(() => {
    const controller = new AbortController()
    async function loadInitialGraph() {
      try {
        setIsLoading(true)
        setError(null)

        const graphData = await fetchGraph(controller.signal)
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
    return () => controller.abort()
  }, [])

  if (graph) return <Suspense fallback={<ApplicationShell bar={<><strong>My Way</strong><AccountButton /></>}><p>Loading graph…</p></ApplicationShell>}>
    <ReactFlowGraph graph={graph} onGraphChanged={refreshGraph} recoveryScope={layoutRecoveryScope(graph.user_id)} />
  </Suspense>

  return (
    <ApplicationShell bar={<><strong>My Way</strong><AccountButton /></>}>
      {error && <p className="error">{error}</p>}

      {isLoading && !graph && <p>Loading graph…</p>}

      {!isLoading && !graph && !error && (
        <p>No graph data available.</p>
      )}
    </ApplicationShell>
  )
}

function App() {
  return <AuthGate>{(user, generation) => <WorkspaceApp key={`${user.id}:${generation}`} />}</AuthGate>
}

export default App