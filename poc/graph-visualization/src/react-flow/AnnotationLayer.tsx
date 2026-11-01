import { AnnotationTextEditor } from "./AnnotationTextEditor";
import { ViewportPortal, useViewport } from "@xyflow/react";
import type { Annotation, RectangleAnnotation } from "../shared/annotations";
import { ANNOTATION_COLORS, ANNOTATION_TEXT_SIZE, rectangleStyle } from "./annotationStyles";
import { RESIZE_HANDLES } from "./annotationInteraction";
import type { AnnotationWorkspace } from "./useAnnotationWorkspace";
import "./annotations.css";

export function AnnotationLayer({ annotations, workspace, locked }: {
  annotations: Annotation[]; workspace: AnnotationWorkspace; locked: boolean;
}) {
  const { zoom } = useViewport();
  const rectangles = annotations.filter((annotation): annotation is RectangleAnnotation => annotation.kind === "rectangle");
  const rectanglePreview = workspace.preview?.kind === "rectangle" ? workspace.preview : null;
  const displayed = rectangles.map((rectangle) => rectanglePreview?.id === rectangle.id ? rectanglePreview : rectangle);
  const newPreview = rectanglePreview && !rectangles.some((rectangle) => rectangle.id === rectanglePreview.id) ? rectanglePreview : null;
  const texts = annotations.filter((annotation) => annotation.kind === "text").map((annotation) =>
    workspace.preview?.kind === "text" && workspace.preview.id === annotation.id ? workspace.preview : annotation);
  const selectedText = texts.find((annotation) => annotation.id === workspace.selectedId);
  const selected = displayed.find((rectangle) => rectangle.id === workspace.selectedId) ?? newPreview;
  const interactive = workspace.mode === "annotation" && !locked;
  return <ViewportPortal>
    <div className="annotation-rectangles" aria-hidden="true">
      {[...displayed, ...(newPreview ? [newPreview] : [])].map((rectangle) => {
        const style = rectangleStyle(rectangle);
        return <div key={rectangle.id} className="annotation-rectangle-visual"
          data-annotation-visual={rectangle.id}
          style={{ left: rectangle.x, top: rectangle.y, width: rectangle.width, height: rectangle.height,
            border: `${style.border}px solid ${style.color}` }}>
          <div style={{ background: style.color, opacity: style.opacity }} />
        </div>;
      })}
    </div>
    <div className="annotation-texts" aria-hidden="true">
      {texts.filter((annotation) => annotation.id !== workspace.editor?.annotation.id).map((annotation) =>
        <div key={annotation.id} className={`annotation-text-visual${interactive ? " annotation-text-hit nodrag nopan" : ""}`}
          data-annotation-visual={annotation.id} data-annotation-id={interactive ? annotation.id : undefined}
          onDoubleClick={interactive ? (event) => { event.stopPropagation(); workspace.editText(annotation.id); } : undefined}
          style={{ left: annotation.x, top: annotation.y, color: ANNOTATION_COLORS[annotation.color], fontSize: ANNOTATION_TEXT_SIZE[annotation.size] }}>
          {annotation.text}
        </div>)}
    </div>
    <div className="annotation-hit-targets" aria-hidden={!interactive}>
      {interactive && displayed.map((rectangle) => <div key={rectangle.id}
        className="annotation-rectangle-hit nodrag nopan" data-annotation-id={rectangle.id}
        style={{ left: rectangle.x, top: rectangle.y, width: rectangle.width, height: rectangle.height }} />)}
    </div>
    {workspace.mode === "annotation" && selectedText && !workspace.editor && <div
      className="annotation-text-selection" aria-hidden="true" style={{ left: selectedText.x, top: selectedText.y,
        fontSize: ANNOTATION_TEXT_SIZE[selectedText.size], outlineWidth: 2 / zoom }}>{selectedText.text}</div>}
    {workspace.mode === "annotation" && workspace.editor && <AnnotationTextEditor workspace={workspace} zoom={zoom} />}
    {workspace.mode === "annotation" && selected && <div className="annotation-selection" aria-hidden="true"
      style={{ left: selected.x, top: selected.y, width: selected.width, height: selected.height,
        outlineWidth: 2 / zoom }}>
      {interactive && !newPreview && RESIZE_HANDLES.map((handle) => <div key={handle}
        className={`annotation-resize-handle annotation-resize-handle--${handle} nodrag nopan`}
        data-annotation-id={selected.id} data-annotation-resize={handle}
        style={{ width: 10 / zoom, height: 10 / zoom, borderWidth: 1 / zoom }} />)}
    </div>}
  </ViewportPortal>;
}
