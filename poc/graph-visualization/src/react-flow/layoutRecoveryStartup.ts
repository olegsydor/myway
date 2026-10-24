
import {
  checkRecoveryCompatibility,
  type LayoutRecoveryRecord,
} from "./layoutRecovery.ts";

import type { LayoutPosition } from "../shared/persistentLayouts";

export type StartupRecoveryResult =
  | { status: "none" }
  | { status: "available"; record: LayoutRecoveryRecord }
  | { status: "incompatible"; reason: string }
  | { status: "unavailable"; error: unknown };

export async function checkStartupRecovery(
  read: () => Promise<unknown | null>,
  scope: string,
  layoutId: number | null,
  nodeIds: readonly number[],
  basePositions: readonly LayoutPosition[],
): Promise<StartupRecoveryResult> {
  let candidate: unknown;

  try {
    candidate = await read();
  } catch (error) {
    return { status: "unavailable", error };
  }

  if (candidate === null) {
    return { status: "none" };
  }

  const compatibility = checkRecoveryCompatibility(
    candidate,
    scope,
    layoutId,
    nodeIds,
    basePositions,
  );

  if (compatibility !== "compatible") {
    return {
      status: "incompatible",
      reason: compatibility,
    };
  }

  return {
    status: "available",
    record: candidate as LayoutRecoveryRecord,
  };
}
