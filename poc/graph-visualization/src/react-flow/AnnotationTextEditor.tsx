import { useEffect, useRef } from "react";
import { ANNOTATION_COLORS, ANNOTATION_TEXT_SIZE } from "./annotationStyles";
import type { AnnotationWorkspace } from "./useAnnotationWorkspace";

/** The editor is UI state, kept readable at every zoom; its anchor stays in graph space. */
export function AnnotationTextEditor({ workspace, zoom }: { workspace: AnnotationWorkspace; zoom: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = workspace.editor?.annotation.id;
  useEffect(() => {
    if (id) { ref.current?.focus(); ref.current?.select(); }
  }, [id]);
  const draft = workspace.editor;
  if (!draft) return null;
  const annotation = draft.annotation;
  return <div className="annotation-text-editor nodrag nopan" data-annotation-editor
    style={{ left: annotation.x, top: annotation.y, transform: `scale(${1 / zoom})`,
      fontSize: ANNOTATION_TEXT_SIZE[annotation.size], color: ANNOTATION_COLORS[annotation.color] }}>
    <div className="annotation-text-editor-grid">
      <span aria-hidden="true" className="annotation-text-measure">{annotation.text + "\u200b"}</span>
      <textarea ref={ref} aria-label={draft.isNew ? "New annotation text" : "Edit annotation text"}
        aria-invalid={Boolean(workspace.error)} aria-describedby="annotation-text-hint"
        value={annotation.text} rows={1} wrap="off" spellCheck={false}
        onChange={(event) => workspace.updateText(event.target.value)}
        onCompositionStart={() => workspace.setComposing(true)}
        onCompositionEnd={(event) => { workspace.updateText(event.currentTarget.value); workspace.setComposing(false); }}
        onBlur={() => workspace.commitText()} />
    </div>
    <small id="annotation-text-hint">Click outside to finish · Esc to cancel</small>
    {workspace.error && <p className="annotation-text-error" role="alert">{workspace.error}</p>}
  </div>;
}
