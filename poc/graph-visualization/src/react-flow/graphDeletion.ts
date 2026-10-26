import type { GraphResponse } from "../shared/types.ts";

export type DeleteIdentity = { kind: "node" | "edge"; id: number };
export type DeleteTarget = DeleteIdentity & { description: string; blocked: boolean };
export type DeleteState = {
  target: DeleteTarget | null; busy: boolean; deleted: boolean; error: string;
};
export const EMPTY_DELETE_STATE: DeleteState = { target: null, busy: false, deleted: false, error: "" };

export function describeDeletion(graph: GraphResponse, identity: DeleteIdentity): DeleteTarget | null {
  if (identity.kind === "node") {
    const node = graph.nodes.find(node => node.id === identity.id);
    if (!node) return null;
    const blocked = graph.edges.some(edge => edge.source === node.id || edge.target === node.id);
    return { ...identity, blocked, description: blocked
      ? `Node “${node.label}” cannot be deleted because it is connected to one or more edges.`
      : `Delete node “${node.label}”? This cannot be undone.` };
  }
  const edge = graph.edges.find(edge => edge.id === identity.id);
  if (!edge) return null;
  const label = (id: number) => graph.nodes.find(node => node.id === id)?.label ?? `Node #${id}`;
  return { ...identity, blocked: false,
    description: `Delete edge “${edge.type}” from “${label(edge.source)}” to “${label(edge.target)}”? This cannot be undone.` };
}

type SelectionItem = { id: string; selected?: boolean; hidden?: boolean };
export function ordinaryDeleteIdentity(nodes: SelectionItem[], edges: SelectionItem[],
  special: boolean, ordinaryId: string | null): DeleteIdentity | null {
  if (special || !ordinaryId) return null;
  const selected = [...nodes.map(node => ({ ...node, kind: "node" as const })),
    ...edges.map(edge => ({ ...edge, kind: "edge" as const }))].filter(item => item.selected);
  if (selected.length !== 1 || selected[0].hidden || selected[0].id !== ordinaryId) return null;
  const item = selected[0];
  const id = Number(item.id.slice(2));
  return Number.isSafeInteger(id) && id > 0 ? { kind: item.kind, id } : null;
}

interface Dependencies {
  graph: () => GraphResponse;
  available: () => boolean;
  remove: (identity: DeleteIdentity) => Promise<void>;
  refresh: () => Promise<void>;
  onDeleted: (identity: DeleteIdentity) => void;
  onBusy: (busy: boolean, identity: DeleteIdentity) => void;
  onState: (state: DeleteState) => void;
  onMessage: (message: string) => void;
}

// Shared mouse/keyboard CRUD controller. Opening and cancelling never call the API.
export function createGraphDeletionController(deps: Dependencies) {
  let state: DeleteState = EMPTY_DELETE_STATE;
  function update(next: DeleteState) { state = next; deps.onState(state); }
  async function refreshAfterDelete() {
    try {
      await deps.refresh();
      deps.onMessage(`${state.target?.kind === "node" ? "Node" : "Edge"} deleted`);
      update(EMPTY_DELETE_STATE);
    } catch (error) {
      const message = `Deletion succeeded, but graph refresh failed: ${error instanceof Error ? error.message : "Unknown error"}. Retry refreshing the graph.`;
      update({ ...state, busy: false, error: message });
      deps.onMessage(message);
    }
  }
  return {
    open(identity: DeleteIdentity) {
      if (state.target || !deps.available()) return;
      const target = describeDeletion(deps.graph(), identity);
      if (target) update({ target, busy: false, deleted: false, error: "" });
    },
    cancel() { if (!state.busy) update(EMPTY_DELETE_STATE); },
    async confirm() {
      if (!state.target || state.busy || state.deleted || !deps.available()) return;
      const target = describeDeletion(deps.graph(), state.target);
      if (!target) { update({ ...state, error: "This element is no longer in the loaded graph. Close and refresh the graph." }); return; }
      if (target.blocked) { update({ target, busy: false, deleted: false, error: "" }); return; }
      update({ target, busy: true, deleted: false, error: "" });
      deps.onBusy(true, target);
      try {
        await deps.remove(target);
        update({ ...state, deleted: true });
        deps.onDeleted(target);
        await refreshAfterDelete();
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to delete ${target.kind}`;
        update({ ...state, busy: false, error: message });
        deps.onMessage(message);
      } finally { deps.onBusy(false, target); }
    },
    async retryRefresh() {
      if (!state.target || !state.deleted || state.busy || !deps.available()) return;
      const target = state.target;
      update({ ...state, busy: true, error: "" });
      deps.onBusy(true, target);
      try { await refreshAfterDelete(); }
      finally { deps.onBusy(false, target); }
    },
  };
}
