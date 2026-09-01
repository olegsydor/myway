import { useRef, useState } from 'react'
import {
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react'

import type { ReactFlowNode } from './adapter'

import './MyWayNode.css'


export function MyWayNode({
  data,
}: NodeProps<ReactFlowNode>) {
  const attributes = Object.entries(data.attributes)

  const hasDetails =
    Boolean(data.description) ||
    attributes.length > 0

  const nodeRef = useRef<HTMLDivElement>(null)
const [tooltipSide, setTooltipSide] = useState<'left' | 'right'>('right')

function handleMouseEnter() {
  const nodeElement = nodeRef.current

  if (!nodeElement) {
    return
  }

  const nodeRect = nodeElement.getBoundingClientRect()
  const container = nodeElement.closest('.react-flow-container')

  if (!container) {
    return
  }

  const containerRect = container.getBoundingClientRect()

  setTooltipSide(
    containerRect.right - nodeRect.right < 340
      ? 'left'
      : 'right',
  )
}

  return (
    <div
      ref={nodeRef}
      className="my-way-node"
      onMouseEnter={handleMouseEnter}
    >
      <Handle
        type="target"
        position={Position.Left}
      />

      <strong className="my-way-node__label">
        {data.label}
      </strong>

      <div className="my-way-node__type">
        {data.nodeType}
      </div>

      {hasDetails && (
        <div
          className={`my-way-node__tooltip my-way-node__tooltip--${tooltipSide}`}
        >
          {data.description && (
            <div className="my-way-node__description">
              {data.description}
            </div>
          )}

          {attributes.length > 0 && (
            <div className="my-way-node__attributes">
              {attributes.map(([key, value]) => (
                <div key={key}>
                  <strong>{key}:</strong>{' '}
                  {String(value)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
      />
    </div>
  )
}
