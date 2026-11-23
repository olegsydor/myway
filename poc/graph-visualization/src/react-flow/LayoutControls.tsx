import { focusDeleteDialogAction } from "./deleteDialogKeyboard";
import type { Command } from "./workspaceCommands";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { layoutMenu, layoutStatus, type LayoutController, type LayoutDialog } from "./layoutMenu";
import type { MenuItem } from "../shell/menuModel";

export function LayoutControls({ layout, saveCommand, children }: {
  layout: LayoutController;
  saveCommand: Command;
  children: (surface: { items: MenuItem[]; status: string; dialogOpen: boolean }) => ReactNode;
}) {
  const [dialog, setDialog] = useState<LayoutDialog | null>(null);
  const [name, setName] = useState("");
  const [validation, setValidation] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const element = dialogRef.current;
    if (dialog && !element?.open) {
      element?.showModal();
      if (dialog.kind === "new" || dialog.kind === "rename") {
        nameRef.current?.focus();
        nameRef.current?.select();
      } else if (dialog.kind === "delete") {
        cancelDeleteRef.current?.focus();
      }
    } else if (!dialog && element?.open) {
      element.close();
      returnFocus?.focus();
    }
  }, [dialog, returnFocus]);

  function open(next: LayoutDialog) {
    if (layout.blocked || layout.isLocked()) return;
    setReturnFocus(document.querySelector<HTMLElement>('[data-application-menu="layout"]'));
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

  return <>
    {children({ items: layoutMenu(layout, saveCommand, open), status: layoutStatus(layout), dialogOpen: Boolean(dialog) })}
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
            {dialog.kind === "new" && layout.layoutCreationBlocked && <p>{layout.layoutCreationBlocked}</p>}
            {validation && <p className="error" role="alert">{validation}</p>}
            {layout.error && <p className="error" role="alert">{layout.error}</p>}
            <div className="layout-dialog-actions">
              <button className="mw-action-primary" type="submit" disabled={layout.blocked || (dialog.kind === "new" && Boolean(layout.layoutCreationBlocked))}>{layout.locked ? "Saving…" : dialog.kind === "new" ? "Create layout" : "Rename"}</button>
              <button type="button" disabled={layout.locked} onClick={() => setDialog(null)}>Cancel</button>
            </div>
          </form>
        ) : dialog?.kind === "switch" ? <>
          <p>Open “{dialog.name}”? {layout.dirty ? "The current layout has unsaved changes." : "The current layout is saved."}</p>
          {layout.error && <p className="error" role="alert">{layout.error}</p>}
          <div className="layout-dialog-actions">
            <button className="mw-action-primary" type="button" disabled={layout.blocked || !layout.dirty || layout.initialSaveBlocked} onClick={() => void finishSwitch("save")}>Save and switch</button>
            <button type="button" disabled={layout.blocked} onClick={() => void finishSwitch("discard")}>{layout.dirty ? "Discard and switch" : "Open layout"}</button>
            <button type="button" disabled={layout.locked} onClick={() => setDialog(null)}>Cancel</button>
          </div>
        </> : dialog?.kind === "delete" ? <>
          <p>Delete “{layout.active?.name}”? Its saved arrangement will be removed. Graph nodes and edges will remain.</p>
          {layout.dirty && <p>Unsaved changes to this arrangement will also be discarded. Use Save as new layout first if you want to keep them.</p>}
          <p>The default layout will open after deletion.</p>
          {layout.error && <p className="error" role="alert">{layout.error}</p>}
          <div className="layout-dialog-actions layout-delete-actions" onKeyDown={event =>
            focusDeleteDialogAction(event, layout.blocked || layout.locked, cancelDeleteRef.current, confirmDeleteRef.current)}>
            <button ref={cancelDeleteRef} type="button" disabled={layout.locked} onClick={() => setDialog(null)}>Cancel</button>
            <button ref={confirmDeleteRef} className="mw-action-danger" type="button" disabled={layout.blocked} onClick={() => {
              void layout.deleteActive().then((success) => { if (success) setDialog(null); });
            }}>{layout.dirty ? "Delete and discard changes" : "Delete layout"}</button>
          </div>
        </> : null}
      </dialog>
  </>;
}

/** Errors and recovery actions remain visible outside the compact menu surface. */
export function LayoutMessages({ layout, onRefreshGraph }: {
  layout: LayoutController; onRefreshGraph: () => Promise<void>;
}) {
  if (!layout.error && !layout.notice && layout.phase !== "load-error") return null;
  return <div className="layout-messages">
    {layout.error && <p className="error" role="alert">{layout.error}</p>}
    {layout.notice && <p role="status">{layout.notice}</p>}
    {layout.phase === "load-error" && <button type="button" onClick={layout.retry}>Retry loading layout</button>}
    {layout.error && layout.phase !== "load-error" && <button type="button" disabled={layout.blocked}
      onClick={() => void onRefreshGraph()}>Refresh graph</button>}
  </div>;
}
