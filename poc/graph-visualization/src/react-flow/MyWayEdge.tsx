import { useState } from 'react'

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  type EdgeProps,
} from '@xyflow/react'

import type { ReactFlowEdge } from './adapter'

import './MyWayEdge.css'

export function MyWayEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  label,
  labelStyle,
  data,
}: EdgeProps<ReactFlowEdge>) {
  const [isHovered, setIsHovered] = useState(false)

  const ARROW_OFFSET = 10

  let adjustedTargetX = targetX
  let adjustedTargetY = targetY

  if (targetPosition === Position.Left) {
    adjustedTargetX -= ARROW_OFFSET
  } else if (targetPosition === Position.Right) {
    adjustedTargetX += ARROW_OFFSET
  } else if (targetPosition === Position.Top) {
    adjustedTargetY -= ARROW_OFFSET
  } else if (targetPosition === Position.Bottom) {
    adjustedTargetY += ARROW_OFFSET
  }

  const [
    edgePath,
    labelX,
    labelY,
  ] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX: adjustedTargetX,
    targetY: adjustedTargetY,
    targetPosition,
  })

  const attributes = Object.entries(
    data?.attributes ?? {},
  )

  const hasDetails =
    Boolean(data?.description) ||
    attributes.length > 0

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
        label={label}
        labelStyle={labelStyle}
      />

      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="my-way-edge__interaction"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />

      {hasDetails && isHovered && (
        <EdgeLabelRenderer>
          <div
            className="my-way-edge__tooltip nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {data?.description && (
              <div className="my-way-edge__description">
                {data.description}
              </div>
            )}

            {attributes.length > 0 && (
              <div className="my-way-edge__attributes">
                {attributes.map(([key, value]) => (
                  <div key={key}>
                    <strong>{key}:</strong>{' '}
                    {String(value)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
