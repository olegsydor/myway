import { useEffect, useRef, useState, type FormEvent } from "react";
import type { usePersistentLayout } from "./usePersistentLayout";

type LayoutController = ReturnType<typeof usePersistentLayout>;
type LayoutDialog = { kind: "new" | "rename" | "delete" } | { kind: "switch"; id: number; name: string };

export function LayoutControls({ layout, onRefreshGraph }: {
  layout: LayoutController;
  onRefreshGraph: () => Promise<void>;
}) {
  const [dialog, setDialog] = useState<LayoutDialog | null>(null);
  const [name, setName] = useState("");
  const [validation, setValidation] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = dialogRef.current;
    if (dialog && !element?.open) {
      element?.showModal();
      if (dialog.kind === "new" || dialog.kind === "rename") {
        nameRef.current?.focus();
        nameRef.current?.select();
      }
    } else if (!dialog && element?.open) element.close();
  }, [dialog]);

  function open(next: LayoutDialog) {
    layout.clearError();
    setValidation("");
    setName(next.kind === "rename" ? layout.active?.name ?? "" : "");
    setDialog(next);
  }

  async function submitName(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) {
      setValidation("Enter a layout name between 1 and 100 characters.");
      return;
    }
    const succeeded = dialog?.kind === "new" ? await layout.saveAsNew(trimmed) : await layout.rename(trimmed);
    if (succeeded) setDialog(null);
  }

  async function finishSwitch(choice: "save" | "discard") {
    if (dialog?.kind !== "switch") return;
    if (await layout.switchTo(dialog.id, choice)) setDialog(null);
  }

  const status = layout.phase === "loading" ? "Loading layout…" :
    layout.phase === "load-error" ? "Layout could not be loaded" :
    layout.phase === "saving" ? "Saving layout…" :
    layout.phase === "switching" ? "Opening layout…" :
    layout.phase === "managing" ? "Updating layout…" :
    layout.dirty ? "Unsaved changes" : "Saved";

  return (
    <div className="react-flow-persistent-layout" aria-label="Saved layout">
      <strong>Saved layout</strong>
      <label>
        Layout
        <select aria-label="Active layout" value={layout.active?.id ?? ""} disabled={layout.blocked}
          onChange={(event) => {
            const id = Number(event.target.value);
            const target = layout.layouts.find((item) => item.id === id);
            if (!target || target.id === layout.active?.id) return;
            if (layout.dirty) open({ kind: "switch", id, name: target.name });
            else void layout.switchTo(id, "discard");
          }}>
          {!layout.active && <option value="">Unsaved initial layout</option>}
          {layout.layouts.map((item) => <option key={item.id} value={item.id}>
            {item.name}{item.is_default ? " (default)" : ""}
          </option>)}
        </select>
      </label>
      <span role="status" aria-live="polite">{status}</span>
      {layout.error && <p className="error" role="alert">{layout.error}</p>}
      {layout.notice && <p>{layout.notice}</p>}
      {layout.phase === "load-error" ? (
        <button type="button" onClick={layout.retry}>Retry loading layout</button>
      ) : <>
        <button type="button" onClick={() => void layout.save()} disabled={layout.blocked || !layout.dirty}>
          {layout.phase === "saving" ? "Saving…" : "Save layout"}
        </button>
        <button type="button" onClick={layout.discard} disabled={!layout.canDiscard}>Discard changes</button>
        <button type="button" onClick={() => open({ kind: "new" })} disabled={layout.blocked}>Save as new layout</button>
        <details>
          <summary>Manage layout</summary>
          <div className="layout-management-actions">
            <button type="button" onClick={() => open({ kind: "rename" })} disabled={layout.blocked || !layout.active}>Rename</button>
            <button type="button" onClick={() => void layout.setDefault()}
              disabled={layout.blocked || !layout.active || layout.active.is_default}>Set as default</button>
            <button type="button" onClick={() => open({ kind: "delete" })}
              disabled={layout.blocked || !layout.canDelete}>Delete layout</button>
            {layout.active?.is_default && <small>Choose another default before deleting this layout.</small>}
          </div>
        </details>
        {layout.error && <button type="button" disabled={layout.blocked}
          onClick={() => void onRefreshGraph()}>Refresh graph</button>}
      </>}

      <dialog ref={dialogRef} className="layout-dialog" aria-labelledby="layout-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!layout.locked) setDialog(null);
        }}>
        <h2 id="layout-dialog-title">
          {dialog?.kind === "new" ? "Save as new layout" : dialog?.kind === "rename" ? "Rename layout" :
            dialog?.kind === "delete" ? "Delete layout" : "Unsaved changes"}
        </h2>
        {dialog && (dialog.kind === "new" || dialog.kind === "rename") ? (
          <form onSubmit={(event) => void submitName(event)}>
            <label htmlFor="layout-name">Layout name</label>
            <input ref={nameRef} id="layout-name" value={name} maxLength={100} required disabled={layout.blocked}
              onChange={(event) => { setName(event.target.value); setValidation(""); }} />
            {dialog.kind === "new" && <p>The current arrangement will be saved as a new layout. The previous saved layout stays unchanged.</p>}
            {validation && <p className="error" role="alert">{validation}</p>}
            {layout.error && <p className="error" role="alert">{layout.error}</p>}
            <div className="layout-dialog-actions">
              <button type="submit" disabled={layout.blocked}>{layout.locked ? "Saving…" : dialog.kind === "new" ? "Create layout" : "Rename"}</button>
              <button type="button" disabled={layout.locked} onClick={() => setDialog(null)}>Cancel</button>
            </div>
          </form>
        ) : dialog?.kind === "switch" ? <>
          <p>Open “{dialog.name}”? {layout.dirty ? "The current layout has unsaved changes." : "The current layout is saved."}</p>
          {layout.error && <p className="error" role="alert">{layout.error}</p>}
          <div className="layout-dialog-actions">
            <button type="button" disabled={layout.blocked || !layout.dirty} onClick={() => void finishSwitch("save")}>Save and switch</button>
            <button type="button" disabled={layout.blocked} onClick={() => void finishSwitch("discard")}>{layout.dirty ? "Discard and switch" : "Open layout"}</button>
            <button type="button" disabled={layout.locked} onClick={() => setDialog(null)}>Cancel</button>
          </div>
        </> : dialog?.kind === "delete" ? <>
          <p>Delete “{layout.active?.name}”? Its saved arrangement will be removed. Graph nodes and edges will remain.</p>
          {layout.dirty && <p>Unsaved changes to this arrangement will also be discarded. Use Save as new layout first if you want to keep them.</p>}
          <p>The default layout will open after deletion.</p>
          {layout.error && <p className="error" role="alert">{layout.error}</p>}
          <div className="layout-dialog-actions">
            <button type="button" disabled={layout.blocked} onClick={() => {
              void layout.deleteActive().then((success) => { if (success) setDialog(null); });
            }}>{layout.dirty ? "Delete and discard changes" : "Delete layout"}</button>
            <button type="button" disabled={layout.locked} onClick={() => setDialog(null)}>Cancel</button>
          </div>
        </> : null}
      </dialog>
    </div>
  );
}
