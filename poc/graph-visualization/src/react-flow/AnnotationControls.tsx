import { useEffect, useRef } from "react";
import { ANNOTATION_COLORS } from "./annotationStyles";
import type { AnnotationWorkspace } from "./useAnnotationWorkspace";
import type { AnnotationColor, RectangleAnnotation } from "../shared/annotations";

export function AnnotationControls({ workspace, locked }: { workspace: AnnotationWorkspace; locked: boolean }) {
  const rectangle = workspace.selected?.kind === "rectangle" ? workspace.selected : null;
  const propertiesLocked = locked || workspace.gestureActive || Boolean(workspace.deleteTarget);
  return <div className="annotation-controls">
    <strong>Workspace mode</strong>
    <div className="annotation-button-row" role="group" aria-label="Workspace mode">
      <button type="button" aria-pressed={workspace.mode === "graph"} disabled={locked || Boolean(workspace.deleteTarget)}
        onClick={() => workspace.switchMode("graph")}>Graph</button>
      <button type="button" aria-pressed={workspace.mode === "annotation"} disabled={locked || Boolean(workspace.deleteTarget)}
        onClick={() => workspace.switchMode("annotation")}>Annotation</button>
    </div>
    {workspace.mode === "annotation" && <>
      <div className="annotation-button-row" role="group" aria-label="Annotation tools">
        <button type="button" aria-pressed={workspace.tool === "select"} disabled={locked || Boolean(workspace.deleteTarget)}
          onClick={() => workspace.setActiveTool("select")}>Select</button>
        <button type="button" aria-pressed={workspace.tool === "rectangle"} disabled={locked || Boolean(workspace.deleteTarget)}
          onClick={() => workspace.setActiveTool("rectangle")}>Rectangle</button>
      </div>
      <small>{workspace.tool === "rectangle" ? "Drag to draw a rectangle. Escape cancels." : "Select a rectangle to move, resize or style it. Drag empty canvas to pan."}</small>
      {rectangle && <fieldset disabled={propertiesLocked} className="annotation-properties">
        <legend>Rectangle</legend>
        <label>Color<select aria-label="Rectangle color" value={rectangle.color}
          onChange={(event) => workspace.setRectangleStyle({ color: event.target.value as AnnotationColor })}>
          {Object.keys(ANNOTATION_COLORS).map((color) => <option key={color} value={color}>{color[0].toUpperCase() + color.slice(1)}</option>)}
        </select></label>
        <label>Fill<select aria-label="Rectangle fill" value={rectangle.fill}
          onChange={(event) => workspace.setRectangleStyle({ fill: event.target.value as RectangleAnnotation["fill"] })}>
          {(["none", "light", "medium"] as const).map((fill) => <option key={fill} value={fill}>{fill[0].toUpperCase() + fill.slice(1)}</option>)}
        </select></label>
        <label>Border<select aria-label="Rectangle border" value={rectangle.border}
          onChange={(event) => workspace.setRectangleStyle({ border: event.target.value as RectangleAnnotation["border"] })}>
          {(["thin", "normal", "thick"] as const).map((border) => <option key={border} value={border}>{border[0].toUpperCase() + border.slice(1)}</option>)}
        </select></label>
        <button type="button" onClick={workspace.requestDelete}>Delete rectangle</button>
      </fieldset>}
      {workspace.error && <p className="error" role="alert">{workspace.error}</p>}
    </>}
  </div>;
}

export function AnnotationDeleteDialog({ workspace, locked }: { workspace: AnnotationWorkspace; locked: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(workspace.deleteTarget);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog?.open) { dialog?.showModal(); cancelRef.current?.focus(); }
    else if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={dialogRef} className="layout-dialog" aria-labelledby="annotation-delete-title"
    onCancel={(event) => { event.preventDefault(); if (!locked) workspace.cancelDelete(); }}>
    <h2 id="annotation-delete-title">Delete rectangle</h2>
    <p>Remove this rectangle from the layout? Save layout to keep the change.</p>
    <div className="layout-dialog-actions">
      <button ref={cancelRef} type="button" disabled={locked} onClick={workspace.cancelDelete}>Cancel</button>
      <button type="button" disabled={locked} onClick={workspace.confirmDelete}>Delete</button>
    </div>
  </dialog>;
}
