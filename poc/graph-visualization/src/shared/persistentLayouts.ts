export interface LayoutPosition {
  node_id: number;
  x: number;
  y: number;
}

export interface SavedLayout {
  id: number;
  name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface LayoutDetail extends SavedLayout {
  positions: LayoutPosition[];
}

export interface PositionedNode {
  data: { originalId: number };
  position: { x: number; y: number };
}

export function positionSnapshot(nodes: readonly PositionedNode[]): LayoutPosition[] {
  const seen = new Set<number>();
  return nodes.map(({ data, position }) => {
    if (!Number.isSafeInteger(data.originalId) || data.originalId <= 0 ||
        seen.has(data.originalId) || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new Error("The graph contains invalid or duplicate node coordinates");
    }
    seen.add(data.originalId);
    return { node_id: data.originalId, x: position.x, y: position.y };
  });
}

export function graphNodesReady(nodes: readonly PositionedNode[], nodeIds: readonly number[]): boolean {
  const actual = new Set(nodes.map((node) => node.data.originalId));
  return nodes.length === nodeIds.length && actual.size === nodeIds.length &&
    nodeIds.every((id) => actual.has(id));
}

export function layoutIsDirty(nodes: readonly PositionedNode[], saved: readonly LayoutPosition[] | null): boolean {
  if (saved === null) return true;
  const byId = new Map(saved.map((position) => [position.node_id, position]));
  // Deleted nodes are intentionally ignored: PostgreSQL cascades their rows.
  return nodes.some(({ data, position }) => {
    const previous = byId.get(data.originalId);
    return !previous || Math.abs(position.x - previous.x) > 1e-6 ||
      Math.abs(position.y - previous.y) > 1e-6;
  });
}

export function restoreLayoutPositions<T extends PositionedNode>(
  nodes: readonly T[], saved: readonly LayoutPosition[], fallback: readonly PositionedNode[],
): T[] {
  const fallbackById = new Map(fallback.map((node) => [node.data.originalId, node.position]));
  const savedById = new Map(saved.map((position) => [position.node_id, { x: position.x, y: position.y }]));
  return nodes.map((node) => ({
    ...node,
    position: { ...(savedById.get(node.data.originalId) ??
      fallbackById.get(node.data.originalId) ?? node.position) },
  }));
}
