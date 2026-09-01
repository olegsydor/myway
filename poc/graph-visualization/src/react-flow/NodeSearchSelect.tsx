import { useMemo, useState } from 'react'

import type { GraphNode } from '../shared/types'

interface NodeSearchSelectProps {
  nodes: GraphNode[]
  value: string
  placeholder: string
  disabled?: boolean
  onChange: (value: string) => void
}

export function NodeSearchSelect({
  nodes,
  value,
  placeholder,
  disabled = false,
  onChange,
}: NodeSearchSelectProps) {
  const [query, setQuery] = useState('')

  const sortedNodes = useMemo(
    () =>
      [...nodes].sort((left, right) =>
        left.label.localeCompare(right.label),
      ),
    [nodes],
  )

  const filteredNodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return sortedNodes
    }

    return sortedNodes.filter((node) =>
      node.label.toLowerCase().includes(normalizedQuery),
    )
  }, [query, sortedNodes])

  const selectedNode =
    nodes.find((node) => String(node.id) === value) ?? null

  return (
    <div className="node-search-select">
      <input
        type="text"
        placeholder={placeholder}
        value={query || selectedNode?.label || ''}
        onChange={(event) => {
          setQuery(event.target.value)
          onChange('')
        }}
        disabled={disabled}
      />

      {query && (
        <div className="node-search-select__options">
          {filteredNodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => {
                onChange(String(node.id))
                setQuery('')
              }}
              disabled={disabled}
            >
              {node.label}
            </button>
          ))}

          {filteredNodes.length === 0 && (
            <div className="node-search-select__empty">
              No matching nodes
            </div>
          )}
        </div>
      )}
    </div>
  )
}
