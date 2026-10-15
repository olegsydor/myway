export interface ManualGroup {
  nodeIds: Set<string>;
}

interface PositionedNode {
  id: string;
  position: { x: number; y: number };
}

interface RectangleBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function groupFromIds(nodeIds: Set<string>): ManualGroup | null {
  return nodeIds.size > 0 ? { nodeIds } : null;
}

export function toggleGroupMember(
  group: ManualGroup | null,
  nodeId: string,
): ManualGroup | null {
  const nodeIds = new Set(group?.nodeIds);

  if (nodeIds.has(nodeId)) {
    nodeIds.delete(nodeId);
  } else {
    nodeIds.add(nodeId);
  }

  return groupFromIds(nodeIds);
}

export function selectGroupMembers(
  group: ManualGroup | null,
  capturedIds: Iterable<string>,
  additive: boolean,
): ManualGroup | null {
  const nodeIds = new Set(additive ? group?.nodeIds : []);

  for (const id of capturedIds) {
    nodeIds.add(id);
  }

  return groupFromIds(nodeIds);
}

export function reconcileGroup(
  group: ManualGroup | null,
  existingIds: ReadonlySet<string>,
): ManualGroup | null {
  if (!group) {
    return null;
  }

  return groupFromIds(
    new Set([...group.nodeIds].filter((id) => existingIds.has(id))),
  );
}

export function rectanglesIntersect(
  first: RectangleBounds,
  second: RectangleBounds,
): boolean {
  return (
    first.left <= second.right &&
    first.right >= second.left &&
    first.top <= second.bottom &&
    first.bottom >= second.top
  );
}

export function translateMembers<T extends PositionedNode>(
  nodes: T[],
  memberIds: ReadonlySet<string>,
  dx: number,
  dy: number,
): T[] {
  return nodes.map((node) =>
    memberIds.has(node.id)
      ? {
          ...node,
          position: {
            x: node.position.x + dx,
            y: node.position.y + dy,
          },
        }
      : node,
  );
}
