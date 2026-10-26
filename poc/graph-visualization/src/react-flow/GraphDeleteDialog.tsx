import { useEffect, useRef } from "react";
import type { DeleteState } from "./graphDeletion";

export function GraphDeleteDialog({ state, onCancel, onConfirm, onRetry }: {
  state: DeleteState; onCancel: () => void; onConfirm: () => void; onRetry: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(state.target);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog?.open) {
      dialog?.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog?.open) dialog.close();
  }, [open]);
  const informational = state.target?.blocked || state.deleted;
  return <dialog ref={dialogRef} className="layout-dialog graph-delete-dialog"
    aria-labelledby="graph-delete-title" aria-describedby="graph-delete-description"
    onCancel={event => { event.preventDefault(); if (!state.busy) onCancel(); }}>
    <h2 id="graph-delete-title">{state.deleted ? "Element deleted" : state.target?.blocked
      ? "Node cannot be deleted" : state.target?.kind === "node" ? "Delete node" : "Delete edge"}</h2>
    <p id="graph-delete-description">{state.deleted
      ? "The server has deleted this element. The loaded graph needs to be refreshed."
      : state.target?.description}</p>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    <div className="layout-dialog-actions">
      <button ref={cancelRef} type="button" disabled={state.busy} onClick={onCancel}>
        {informational ? "Close" : "Cancel"}
      </button>
      {!informational && <button className="graph-delete-confirm" type="button"
        disabled={state.busy} onClick={onConfirm}>{state.busy ? "Deleting…" : "Delete"}</button>}
      {state.deleted && <button type="button" disabled={state.busy} onClick={onRetry}>
        {state.busy ? "Refreshing…" : "Retry refresh"}
      </button>}
    </div>
  </dialog>;
}
