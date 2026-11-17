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
      onFocusCapture={handleMouseEnter}
    >
      <Handle
        type="target"
        position={Position.Left}
      />

      {/* Retain the old one-line label/type metrics without displaying them.
          The two-line title overlays that space, preserving node/handle geometry. */}
      <div className="my-way-node__metrics" aria-hidden="true">
        <strong className="my-way-node__label-metric">&nbsp;</strong>
        <div className="my-way-node__type">&nbsp;</div>
      </div>

      <strong className="my-way-node__label" aria-label={`${data.label} (${data.nodeType})`}>
        {data.label}
      </strong>

        <div
          className={`my-way-node__tooltip my-way-node__tooltip--${tooltipSide}`}
        >
          <div className="my-way-node__tooltip-title">{data.label}</div>
          <div className="my-way-node__tooltip-type">{data.nodeType}</div>
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

      <Handle
        type="source"
        position={Position.Right}
      />
    </div>
  )
}
