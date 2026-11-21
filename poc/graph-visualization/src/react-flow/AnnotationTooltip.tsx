import { useViewport } from "@xyflow/react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { shapeLabel, type Annotation, type ShapeAnnotation } from "../shared/annotations";
import { annotationTooltipPosition, createAnnotationHover } from "./annotationHover";
import type { AnnotationWorkspace } from "./useAnnotationWorkspace";

type Hover = { shape: ShapeAnnotation; id: string; x: number; y: number };

function hit(target: EventTarget | null): string | undefined {
  if (!(target instanceof Element) ||
      target.closest("[data-annotation-resize], .react-flow__controls, .react-flow__panel, input, textarea, select, button, a")) return;
  return target.closest<HTMLElement>("[data-annotation-id]")?.dataset.annotationId;
}

export function AnnotationTooltip({ annotations, workspace, locked }: {
  annotations: Annotation[]; workspace: AnnotationWorkspace; locked: boolean;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const { x, y, zoom } = useViewport();
  const enabled = workspace.mode === "annotation" && workspace.tool === "select" &&
    !locked && !workspace.gestureActive && !workspace.editor && !workspace.deleteTarget;

  useLayoutEffect(() => {
    const canvas = marker.current?.closest(".react-flow-container");
    if (!canvas || !enabled) return;
    const shapes = new Map(annotations.filter((shape): shape is ShapeAnnotation =>
      shape.kind !== "text" && Boolean(shape.name || shape.description)).map(shape => [shape.id, shape]));
    if (!shapes.size) return;
    const editing = () => document.activeElement?.closest("[data-annotation-metadata]") ||
      document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]');
    const controller = createAnnotationHover<Hover>({
      eligible: ({ x, y, id }) => !editing() && hit(document.elementFromPoint(x, y)) === id,
      show: setHover,
    });
    const { clear } = controller;
    const move = (event: PointerEvent) => {
      const id = hit(event.target);
      const shape = id ? shapes.get(id) : undefined;
      controller.move(shape && event.pointerType === "mouse" && !event.buttons && !editing()
        ? { shape, id: shape.id, x: event.clientX, y: event.clientY } : undefined);
    };
    const onFocus = () => { if (editing()) clear(); };
    const onMove = (event: Event) => move(event as PointerEvent);
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") clear(); };
    const cancelEvents = ["pointerleave", "pointerdown", "pointercancel", "wheel"];
    canvas.addEventListener("pointermove", onMove, true);
    for (const event of cancelEvents) canvas.addEventListener(event, clear, true);
    document.addEventListener("focusin", onFocus);
    window.addEventListener("keydown", onEscape, true);
    window.addEventListener("blur", clear);
    window.addEventListener("resize", clear);
    return () => {
      canvas.removeEventListener("pointermove", onMove, true);
      for (const event of cancelEvents) canvas.removeEventListener(event, clear, true);
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("keydown", onEscape, true);
      window.removeEventListener("blur", clear);
      window.removeEventListener("resize", clear);
      clear();
    };
  }, [annotations, enabled, x, y, zoom]);

  useLayoutEffect(() => {
    if (!hover || !card.current) return;
    const element = card.current;
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${annotationTooltipPosition(hover.x, bounds.width, width)}px`;
    element.style.top = `${annotationTooltipPosition(hover.y, bounds.height, height)}px`;
    element.dataset.clipped = String(element.scrollHeight > element.clientHeight);
  }, [hover]);

  return <>
    <span ref={marker} hidden />
    {enabled && hover && createPortal(<div ref={card} className="annotation-metadata-tooltip" role="tooltip">
      <strong>{hover.shape.name || shapeLabel(hover.shape.kind)}</strong>
      {hover.shape.description && <div>{hover.shape.description}</div>}
    </div>, document.body)}
  </>;
}
