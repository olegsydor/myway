import { useSearchResultNavigation } from './useSearchResultNavigation.ts'
import { useMemo, useState } from 'react'

import type { GraphNode } from '../shared/types'

interface NodeSearchSelectProps {
  nodes: GraphNode[]
  value: string
  placeholder: string
  inputId?: string
  disabled?: boolean
  onChange: (value: string) => void
}

export function NodeSearchSelect({
  nodes,
  value,
  placeholder,
  inputId,
  disabled = false,
  onChange,
}: NodeSearchSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

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

  const { input: searchInput, buttons: resultButtons, inputKey, resultKey } = useSearchResultNavigation({ open: open && Boolean(query), count: query ? filteredNodes.length : 0,
    disabled, onOpen: () => { if (query) setOpen(true); }, onClose: () => setOpen(false) })

  const selectedNode =
    nodes.find((node) => String(node.id) === value) ?? null

  return (
    <div className="node-search-select">
      <input
        ref={searchInput}
        id={inputId}
        onKeyDown={inputKey}
        type="text"
        aria-label={placeholder}
        placeholder={placeholder}
        value={query || selectedNode?.label || ''}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(Boolean(event.target.value))
          onChange('')
        }}
        disabled={disabled}
      />

      {query && open && (
        <div className="node-search-select__options">
          {filteredNodes.map((node, index) => (
            <button
              key={node.id}
              ref={element => { resultButtons.current[index] = element }}
              onKeyDown={event => resultKey(event, index)}
              type="button"
              onClick={() => {
                onChange(String(node.id))
                setQuery('')
                setOpen(false)
                searchInput.current?.focus()
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
