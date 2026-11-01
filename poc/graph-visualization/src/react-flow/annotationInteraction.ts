import { RECTANGLE_MIN_SIZE, normalizeRectangle, type RectangleAnnotation, type TextAnnotation } from "../shared/annotations.ts";
import type { CSSProperties } from "react";

export type WorkspaceMode = "graph" | "annotation";
export type AnnotationTool = "select" | "rectangle" | "text";
export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export interface Point { x: number; y: number }
export interface RectangleGesture {
  kind: "draw" | "move" | "resize";
  start: Point;
  original: RectangleAnnotation;
  handle?: ResizeHandle;
}

export function rectanglePreview(gesture: RectangleGesture, point: Point): RectangleAnnotation | null {
  const { original, start, kind, handle } = gesture;
  if (![point.x, point.y, start.x, start.y].every(Number.isFinite)) return null;
  const dx = point.x - start.x, dy = point.y - start.y;
  let geometry = { x: original.x, y: original.y, width: original.width, height: original.height };
  if (kind === "draw") {
    geometry = { x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(dx), height: Math.abs(dy) };
  } else if (kind === "move") {
    geometry.x += dx;
    geometry.y += dy;
  } else if (handle) {
    const right = original.x + original.width, bottom = original.y + original.height;
    if (handle.includes("w")) {
      geometry.x = Math.min(original.x + dx, right - RECTANGLE_MIN_SIZE);
      geometry.width = right - geometry.x;
    } else if (handle.includes("e")) geometry.width = Math.max(RECTANGLE_MIN_SIZE, original.width + dx);
    if (handle.includes("n")) {
      geometry.y = Math.min(original.y + dy, bottom - RECTANGLE_MIN_SIZE);
      geometry.height = bottom - geometry.y;
    } else if (handle.includes("s")) geometry.height = Math.max(RECTANGLE_MIN_SIZE, original.height + dy);
  }
  if (kind === "resize") {
    geometry.width = Math.max(RECTANGLE_MIN_SIZE, geometry.width);
    geometry.height = Math.max(RECTANGLE_MIN_SIZE, geometry.height);
  }
  if (!Object.values(geometry).every(Number.isFinite)) return null;
  return { ...original, ...geometry };
}

export function finishRectangle(gesture: RectangleGesture, point: Point): RectangleAnnotation | null {
  const preview = rectanglePreview(gesture, point);
  if (!preview) return null;
  if (gesture.kind === "draw" && !normalizeRectangle(gesture.start, point)) return null;
  return preview;
}

/** Deliberately preserves hidden flags and all graph/filter data. */
export function clearNodeHighlights<T extends { selected?: boolean; style?: CSSProperties }>(nodes: T[]): T[] {
  return nodes.map((node) => ({ ...node, selected: false,
    style: { ...node.style, opacity: 1, border: "2px solid #ffffff" } }));
}
export function clearEdgeHighlights<T extends { selected?: boolean; style?: CSSProperties; markerEnd?: unknown }>(edges: T[]): T[] {
  return edges.map((edge) => ({ ...edge, selected: false,
    style: { ...edge.style, opacity: 1, stroke: "#94a3b8", strokeWidth: 2 },
    markerEnd: typeof edge.markerEnd === "object" && edge.markerEnd !== null
      ? { ...edge.markerEnd, color: "#94a3b8" } : edge.markerEnd,
  }));
}

export function textMovePreview(original: TextAnnotation, start: Point, point: Point): TextAnnotation | null {
  const x = original.x + (point.x - start.x), y = original.y + (point.y - start.y);
  return [x, y, start.x, start.y, point.x, point.y].every(Number.isFinite) ? { ...original, x, y } : null;
}
