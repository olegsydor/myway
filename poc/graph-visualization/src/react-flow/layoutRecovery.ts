import {
  positionSnapshot,
  type LayoutPosition,
  type PositionedNode,
} from "../shared/persistentLayouts.ts";

export interface LayoutRecoveryRecord {
  version: 1;
  scope: string;
  layoutId: number | null;
  savedAt: string;
  baseFingerprint: string;
  nodeFingerprint: string;
  positions: LayoutPosition[];
}

export type RecoveryCompatibility =
  | "compatible"
  | "invalid"
  | "wrong-scope"
  | "wrong-layout"
  | "changed-nodes"
  | "changed-base";

function validPositions(
  positions: readonly LayoutPosition[],
): boolean {
  const ids = new Set<number>();

  for (const { node_id, x, y } of positions) {
    if (
      !Number.isSafeInteger(node_id) ||
      node_id <= 0 ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      ids.has(node_id)
    ) {
      return false;
    }

    ids.add(node_id);
  }

  return true;
}

function sortedPositions(
  positions: readonly LayoutPosition[],
): LayoutPosition[] {
  if (!validPositions(positions)) {
    throw new Error("Invalid recovery positions");
  }

  return [...positions].sort((a, b) => a.node_id - b.node_id);
}

export function positionFingerprint(
  positions: readonly LayoutPosition[],
): string {
  return JSON.stringify(
    sortedPositions(positions).map(({ node_id, x, y }) => [
      node_id,
      x,
      y,
    ]),
  );
}

export function nodeFingerprint(
  nodeIds: readonly number[],
): string {
  const ids = new Set(nodeIds);

  if (
    ids.size !== nodeIds.length ||
    nodeIds.some(
      (id) => !Number.isSafeInteger(id) || id <= 0,
    )
  ) {
    throw new Error("Invalid recovery node IDs");
  }

  return JSON.stringify([...ids].sort((a, b) => a - b));
}

export function createRecoveryRecord(
  scope: string,
  layoutId: number | null,
  nodes: readonly PositionedNode[],
  basePositions: readonly LayoutPosition[],
  savedAt = new Date().toISOString(),
): LayoutRecoveryRecord {
  if (!scope.trim()) {
    throw new Error("Recovery scope is required");
  }

  if (
    layoutId !== null &&
    (!Number.isSafeInteger(layoutId) || layoutId <= 0)
  ) {
    throw new Error("Invalid recovery layout ID");
  }

  if (
    !Number.isFinite(Date.parse(savedAt)) ||
    !/^\d{4}-\d{2}-\d{2}T/.test(savedAt)
  ) {
    throw new Error("Invalid recovery timestamp");
  }

  const positions = positionSnapshot(nodes);

  return {
    version: 1,
    scope,
    layoutId,
    savedAt,
    baseFingerprint: positionFingerprint(basePositions),
    nodeFingerprint: nodeFingerprint(
      positions.map((position) => position.node_id),
    ),
    positions,
  };
}

export function checkRecoveryCompatibility(
  candidate: unknown,
  scope: string,
  layoutId: number | null,
  nodeIds: readonly number[],
  basePositions: readonly LayoutPosition[],
): RecoveryCompatibility {
  if (
    typeof candidate !== "object" ||
    candidate === null
  ) {
    return "invalid";
  }

  const record = candidate as Partial<LayoutRecoveryRecord>;

  if (
    record.version !== 1 ||
    typeof record.scope !== "string" ||
    typeof record.savedAt !== "string" ||
    !Number.isFinite(Date.parse(record.savedAt)) ||
    !Array.isArray(record.positions) ||
    !record.positions.every(
      (p): p is LayoutPosition =>
        typeof p === "object" &&
        p !== null &&
        typeof p.node_id === "number" &&
        typeof p.x === "number" &&
        typeof p.y === "number",
    ) ||
    !validPositions(record.positions) ||
    typeof record.baseFingerprint !== "string" ||
    typeof record.nodeFingerprint !== "string" ||
    !(
      record.layoutId === null ||
      (
        Number.isSafeInteger(record.layoutId) &&
        (record.layoutId as number) > 0
      )
    )
  ) {
    return "invalid";
  }

  if (record.scope !== scope) {
    return "wrong-scope";
  }

  if (record.layoutId !== layoutId) {
    return "wrong-layout";
  }

  try {
    const expectedNodes = nodeFingerprint(nodeIds);

    if (
      record.nodeFingerprint !== expectedNodes ||
      nodeFingerprint(
        record.positions.map((position) => position.node_id),
      ) !== expectedNodes
    ) {
      return "changed-nodes";
    }

    if (
      record.baseFingerprint !==
      positionFingerprint(basePositions)
    ) {
      return "changed-base";
    }
  } catch {
    return "invalid";
  }

  return "compatible";
}
