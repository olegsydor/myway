import { useEffect, useRef } from "react";
import { ANNOTATION_COLORS } from "./annotationStyles";
import type { AnnotationWorkspace } from "./useAnnotationWorkspace";
import type { AnnotationColor, RectangleAnnotation, TextAnnotation } from "../shared/annotations";

export function AnnotationControls({ workspace, locked }: { workspace: AnnotationWorkspace; locked: boolean }) {
  const rectangle = workspace.selected?.kind === "rectangle" ? workspace.selected : null;
  const text = workspace.selected?.kind === "text" ? workspace.selected : null;
  const propertiesLocked = locked || Boolean(workspace.editor) || workspace.gestureActive || Boolean(workspace.deleteTarget);
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
        <button type="button" aria-pressed={workspace.tool === "text"} disabled={locked || Boolean(workspace.deleteTarget)}
          onClick={() => workspace.setActiveTool("text")}>Text</button>
      </div>
      <small>{workspace.editor ? "Enter adds a line break. Click outside to finish; Escape cancels." : workspace.tool === "rectangle"
        ? "Drag to draw a rectangle. Escape cancels." : workspace.tool === "text" ? "Click to place text. Escape cancels."
        : "Select an annotation to move or style it. Double-click text to edit. Drag empty canvas to pan."}</small>
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
      {text && <fieldset disabled={propertiesLocked} className="annotation-properties">
        <legend>Text</legend>
        <label>Color<select aria-label="Text color" value={text.color}
          onChange={(event) => workspace.setTextStyle({ color: event.target.value as AnnotationColor })}>
          {Object.keys(ANNOTATION_COLORS).map((color) => <option key={color} value={color}>{color[0].toUpperCase() + color.slice(1)}</option>)}
        </select></label>
        <label>Size<select aria-label="Text size" value={text.size}
          onChange={(event) => workspace.setTextStyle({ size: event.target.value as TextAnnotation["size"] })}>
          {(["small", "medium", "large"] as const).map((size) => <option key={size} value={size}>{size[0].toUpperCase() + size.slice(1)}</option>)}
        </select></label>
        <button type="button" onClick={() => workspace.editText(text.id)}>Edit text</button>
        <button type="button" onClick={workspace.requestDelete}>Delete text</button>
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
    <h2 id="annotation-delete-title">{workspace.deleteTarget?.kind === "text" ? "Delete text" : "Delete rectangle"}</h2>
    <p>{workspace.deleteTarget?.kind === "text" ? `Remove “${[...workspace.deleteTarget.text].slice(0, 80).join("")}${[...workspace.deleteTarget.text].length > 80 ? "…" : ""}” from the layout?`
      : "Remove this rectangle from the layout?"} Save layout to keep the change.</p>
    <div className="layout-dialog-actions">
      <button ref={cancelRef} type="button" disabled={locked} onClick={workspace.cancelDelete}>Cancel</button>
      <button type="button" disabled={locked} onClick={workspace.confirmDelete}>Delete</button>
    </div>
  </dialog>;
}
