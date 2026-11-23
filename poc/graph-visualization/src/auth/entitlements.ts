import { createContext, useContext } from "react";
import { ApiError, request } from "./http.ts";

export interface Entitlements {
  plan: "free" | "pro";
  source: "default" | "early_tester" | "manual";
  starts_at: string | null;
  expires_at: string | null;
  limits: { nodes: number | null; annotations_per_layout: number | null; layouts: number };
  usage: { nodes: number; layouts: number };
}

export interface PlanViolation {
  resource: "nodes" | "annotations_per_layout" | "layouts";
  limit: number;
  attempted: number;
  layout_name?: string;
}

export async function fetchEntitlements(signal: AbortSignal): Promise<Entitlements> {
  const response = await request("/api/auth/entitlements", { signal });
  return response.json();
}

export const EntitlementContext = createContext<{
  plan: Entitlements | null;
  refresh: () => void;
}>({ plan: null, refresh: () => {} });

export function useEntitlements() {
  return useContext(EntitlementContext);
}

export function nodeLimitMessage(limit: number) {
  return `Your Free plan allows ${limit} nodes. Delete a node to make room for another.`;
}

export function layoutLimitMessage(limit: number) {
  return `Your plan allows ${limit} layouts. Delete layouts until fewer than ${limit} remain to create another.`;
}

export function formatPlanViolation(violation: PlanViolation, file = false): string {
  if (violation.resource === "layouts") {
    return file
      ? `This file contains ${violation.attempted} layouts. Your current plan allows ${violation.limit}.`
      : layoutLimitMessage(violation.limit);
  }
  if (violation.resource === "nodes") {
    return file
      ? `This file contains ${violation.attempted} nodes. Your Free plan allows ${violation.limit}.`
      : nodeLimitMessage(violation.limit);
  }
  const layout = violation.layout_name ? `Layout “${violation.layout_name}”` : "This layout";
  return `${layout} contains ${violation.attempted} annotations. Your Free plan allows ${violation.limit} here.`;
}

export function planLimitMessage(error: unknown, file = false): string | undefined {
  if (!(error instanceof ApiError) || error.code !== "plan_limit_exceeded") return;
  return formatPlanViolation(error.detail as PlanViolation, file);
}
