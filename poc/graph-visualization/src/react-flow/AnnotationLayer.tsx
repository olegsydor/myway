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
  const displayed = rectangles.map((rectangle) => workspace.preview?.id === rectangle.id ? workspace.preview : rectangle);
  const newPreview = workspace.preview && !rectangles.some((rectangle) => rectangle.id === workspace.preview!.id)
    ? workspace.preview : null;
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
      {annotations.filter((annotation) => annotation.kind === "text").map((annotation) =>
        <div key={annotation.id} className="annotation-text-visual" style={{ left: annotation.x, top: annotation.y,
          color: ANNOTATION_COLORS[annotation.color], fontSize: ANNOTATION_TEXT_SIZE[annotation.size] }}>
          {annotation.text}
        </div>)}
    </div>
    <div className="annotation-hit-targets" aria-hidden={!interactive}>
      {interactive && displayed.map((rectangle) => <div key={rectangle.id}
        className="annotation-rectangle-hit nodrag nopan" data-annotation-id={rectangle.id}
        style={{ left: rectangle.x, top: rectangle.y, width: rectangle.width, height: rectangle.height }} />)}
    </div>
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
