import { focusDeleteDialogAction } from "./deleteDialogKeyboard";
import { useEffect, useRef, useState } from "react";
import { ANNOTATION_COLORS } from "./annotationStyles";
import type { AnnotationWorkspace } from "./useAnnotationWorkspace";
import { ANNOTATION_METADATA_LIMIT, annotationNameOnOneLine, normalizeAnnotationMetadata, shapeLabel,
  type Annotation, type AnnotationColor, type ShapeAnnotation, type TextAnnotation } from "../shared/annotations";

type MetadataField = keyof typeof ANNOTATION_METADATA_LIMIT;

function ShapeMetadataField({ field, value, onUpdate }: {
  field: MetadataField; value?: string; onUpdate: (value: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState("");
  const composing = useRef(false);
  const localValue = useRef(value);
  useEffect(() => {
    if (value !== localValue.current) {
      localValue.current = value;
      setDraft(value ?? "");
      setError("");
    }
  }, [value]);
  function update(raw: string) {
    setDraft(raw);
    if (composing.current) return;
    try {
      const normalized = normalizeAnnotationMetadata(field, raw);
      localValue.current = normalized;
      onUpdate(normalized);
      setError("");
    } catch {
      setError(`Use valid text up to ${ANNOTATION_METADATA_LIMIT[field]} characters.`);
    }
  }
  const props = {
    value: draft,
    "aria-invalid": Boolean(error),
    onBlur: () => { composing.current = false; setDraft(localValue.current ?? ""); setError(""); },
    onCompositionStart: () => { composing.current = true; },
    onCompositionEnd: (event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composing.current = false;
      update(event.currentTarget.value);
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(event.currentTarget.value),
  };
  return <label data-annotation-metadata>
    {field === "name" ? "Name" : "Description"}
    {field === "name" ? <input type="text" {...props} onPaste={(event) => {
      const input = event.currentTarget;
      const text = event.clipboardData.getData("text");
      // HTML inputs remove line breaks themselves. Turn them into spaces first.
      const singleLine = annotationNameOnOneLine(text);
      if (singleLine === text) return;
      event.preventDefault();
      const start = input.selectionStart ?? draft.length;
      const end = input.selectionEnd ?? start;
      update(draft.slice(0, start) + singleLine + draft.slice(end));
      requestAnimationFrame(() => input.setSelectionRange(start + singleLine.length, start + singleLine.length));
    }} /> : <textarea rows={4} {...props} />}
    {error && <span className="error" role="alert">{error}</span>}
  </label>;
}

export type AnnotationDragMode = "move" | "pan";

export function AnnotationControls({ annotations, workspace, locked, planCeiling, dragMode, onDragModeChange }: {
  annotations: Annotation[];
  workspace: AnnotationWorkspace;
  locked: boolean;
  planCeiling?: number | null;
  dragMode?: AnnotationDragMode;
  onDragModeChange?: (mode: AnnotationDragMode) => void;
}) {
  if (workspace.mode !== "annotation") return null;
  const atLimit = planCeiling != null && annotations.length >= planCeiling;
  const shape = workspace.selected && workspace.selected.kind !== "text" ? workspace.selected : null;
  const shapes = annotations.filter((item): item is ShapeAnnotation => item.kind !== "text");
  const label = shape && shapeLabel(shape.kind);
  const text = workspace.selected?.kind === "text" ? workspace.selected : null;
  const propertiesLocked = locked || Boolean(workspace.editor) || workspace.gestureActive || Boolean(workspace.deleteTarget);
  return <div className="annotation-controls">
    {workspace.mode === "annotation" && <>
      <div className="annotation-button-row" role="group" aria-label="Annotation tools">
        <button type="button" aria-pressed={workspace.tool === "select"} disabled={locked || Boolean(workspace.deleteTarget)}
          onClick={() => workspace.setActiveTool("select")}>Select</button>
        <button type="button" aria-pressed={workspace.tool === "rectangle"} disabled={atLimit || locked || Boolean(workspace.deleteTarget)}
          onClick={() => workspace.setActiveTool("rectangle")}>Rectangle</button>
        <button type="button" aria-pressed={workspace.tool === "ellipse"} disabled={atLimit || locked || Boolean(workspace.deleteTarget)}
          onClick={() => workspace.setActiveTool("ellipse")}>Ellipse</button>
        <button type="button" aria-pressed={workspace.tool === "text"} disabled={atLimit || locked || Boolean(workspace.deleteTarget)}
          onClick={() => workspace.setActiveTool("text")}>Text</button>
      </div>
      {planCeiling != null && <small>{annotations.length} / {planCeiling}{atLimit && " · Annotation limit reached"}</small>}
      <small>{workspace.editor ? "Enter adds a line break. Click outside to finish; Escape cancels." : workspace.tool === "rectangle"
        ? "Drag to draw a shape. Escape cancels." : workspace.tool === "ellipse" ? "Drag to draw an ellipse. Escape cancels."
        : workspace.tool === "text" ? "Click to place text. Escape cancels."
        : "Click to select. Alt/Option + click cycles overlapping annotations. Double-click text to edit."}</small>
      {workspace.tool === "select" && !workspace.editor && dragMode && <>
        <label className="annotation-shape-picker">
          Drag behavior
          <select value={dragMode} disabled={propertiesLocked} aria-describedby="annotation-drag-hint"
            onChange={(event) => onDragModeChange?.(event.target.value === "pan" ? "pan" : "move")}>
            <option value="move">Move annotations by default</option>
            <option value="pan">Pan canvas by default</option>
          </select>
        </label>
        <small id="annotation-drag-hint">
          <strong><kbd>Space</kbd> + drag</strong>
          {dragMode === "pan" ? " to move the selected annotation." : " to pan the canvas."}
        </small>
      </>}
      {workspace.tool === "select" && shapes.length > 0 && <label className="annotation-shape-picker">
        Select shape
        <select disabled={propertiesLocked} value={shape?.id ?? ""}
          onChange={(event) => workspace.selectShape(event.target.value)}>
          <option value="">Choose a shape</option>
          {shapes.map((item, index) => <option key={item.id} value={item.id}>
            {item.name || shapeLabel(item.kind)} · {index + 1}
          </option>)}
        </select>
      </label>}
      {shape && <fieldset key={shape.id} disabled={propertiesLocked} className="annotation-properties">
        <legend>{label}</legend>
        <ShapeMetadataField field="name" value={shape.name} onUpdate={(name) => workspace.updateShape({ name })} />
        <ShapeMetadataField field="description" value={shape.description} onUpdate={(description) => workspace.updateShape({ description })} />
        <label>Color<select aria-label={`${label} color`} value={shape.color}
          onChange={(event) => workspace.updateShape({ color: event.target.value as AnnotationColor })}>
          {Object.keys(ANNOTATION_COLORS).map((color) => <option key={color} value={color}>{color[0].toUpperCase() + color.slice(1)}</option>)}
        </select></label>
        <label>Fill<select aria-label={`${label} fill`} value={shape.fill}
          onChange={(event) => workspace.updateShape({ fill: event.target.value as ShapeAnnotation["fill"] })}>
          {(["none", "light", "medium"] as const).map((fill) => <option key={fill} value={fill}>{fill[0].toUpperCase() + fill.slice(1)}</option>)}
        </select></label>
        <label>Border<select aria-label={`${label} border`} value={shape.border}
          onChange={(event) => workspace.updateShape({ border: event.target.value as ShapeAnnotation["border"] })}>
          {(["thin", "normal", "thick"] as const).map((border) => <option key={border} value={border}>{border[0].toUpperCase() + border.slice(1)}</option>)}
        </select></label>
        <button type="button" onClick={workspace.requestDelete}>Delete {label?.toLowerCase()}</button>
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
  const deleteRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(workspace.deleteTarget);
  const kind = workspace.deleteTarget?.kind ?? "rectangle";
  const label = kind === "text" ? "text" : shapeLabel(kind).toLowerCase();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog?.open) { dialog?.showModal(); cancelRef.current?.focus(); }
    else if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={dialogRef} className="layout-dialog" aria-labelledby="annotation-delete-title"
    onCancel={(event) => { event.preventDefault(); if (!locked) workspace.cancelDelete(); }}>
    <h2 id="annotation-delete-title">Delete {label}</h2>
    <p>{workspace.deleteTarget?.kind === "text" ? `Remove “${[...workspace.deleteTarget.text].slice(0, 80).join("")}${[...workspace.deleteTarget.text].length > 80 ? "…" : ""}” from the layout?`
      : `Remove this ${label} from the layout?`} Save layout to keep the change.</p>
    <div className="layout-dialog-actions" onKeyDown={event =>
      focusDeleteDialogAction(event, locked, cancelRef.current, deleteRef.current)}>
      <button ref={cancelRef} type="button" disabled={locked} onClick={workspace.cancelDelete}>Cancel</button>
      <button ref={deleteRef} className="mw-action-danger" type="button" disabled={locked} onClick={workspace.confirmDelete}>Delete</button>
    </div>
  </dialog>;
}

export function WorkspaceModeSwitch({ workspace, locked }: { workspace: AnnotationWorkspace; locked: boolean }) {
  return (
    <div className="annotation-button-row" role="group" aria-label="Workspace mode">
      <button type="button" aria-pressed={workspace.mode === "graph"} disabled={locked || Boolean(workspace.deleteTarget)}
        onClick={() => workspace.switchMode("graph")}>Graph</button>
      <button type="button" aria-pressed={workspace.mode === "annotation"} disabled={locked || Boolean(workspace.deleteTarget)}
        onClick={() => workspace.switchMode("annotation")}>Annotation</button>
    </div>
  );
}
