import { useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ANNOTATION_LIMIT, annotationSnapshot, type Annotation, type RectangleAnnotation } from "../shared/annotations.ts";
import { finishRectangle, rectanglePreview, type AnnotationTool, type Point, type RectangleGesture, type ResizeHandle, type WorkspaceMode } from "./annotationInteraction.ts";

interface Options {
  annotations: Annotation[];
  setAnnotations: Dispatch<SetStateAction<Annotation[]>>;
  locked: boolean;
  toGraph: (point: Point) => Point;
  onBusy: (busy: boolean) => void;
  onEnterAnnotation: () => void;
}
interface Capture {
  hasPointerCapture(id: number): boolean;
  releasePointerCapture(id: number): void;
  setPointerCapture(id: number): void;
}
export interface AnnotationPointer {
  pointerId: number; button: number; isPrimary?: boolean; clientX: number; clientY: number;
  currentTarget: Capture; preventDefault(): void; stopPropagation(): void;
}
interface ActiveGesture extends RectangleGesture { pointerId: number; capture: Capture }

export function useAnnotationWorkspace(options: Options) {
  const [mode, setMode] = useState<WorkspaceMode>("graph");
  const [tool, setTool] = useState<AnnotationTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<RectangleAnnotation | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const latest = useRef(options);
  const modeRef = useRef(mode);
  const toolRef = useRef(tool);
  const selectedRef = useRef(selectedId);
  const deleteRef = useRef(deleteId);
  const gesture = useRef<ActiveGesture | null>(null);
  useLayoutEffect(() => { latest.current = options; });

  const selected = options.annotations.find((annotation) => annotation.id === selectedId) ?? null;
  const deleteTarget = options.annotations.find((annotation) => annotation.id === deleteId) ?? null;
  function select(id: string | null) { selectedRef.current = id; setSelectedId(id); }
  function chooseTool(next: AnnotationTool) { toolRef.current = next; setTool(next); }
  function release() {
    const active = gesture.current;
    gesture.current = null;
    setPreview(null);
    latest.current.onBusy(false);
    if (active?.capture.hasPointerCapture(active.pointerId)) active.capture.releasePointerCapture(active.pointerId);
  }
  function cancel() { release(); chooseTool("select"); }
  function reset() {
    cancel(); select(null); deleteRef.current = null; setDeleteId(null); setError("");
  }
  function switchMode(next: WorkspaceMode) {
    if (latest.current.locked || deleteRef.current || next === modeRef.current) return;
    reset();
    if (next === "annotation") latest.current.onEnterAnnotation();
    modeRef.current = next;
    setMode(next);
  }
  function setActiveTool(next: AnnotationTool) {
    if (latest.current.locked || deleteRef.current || modeRef.current !== "annotation") return;
    cancel(); chooseTool(next); setError("");
  }
  function begin(event: AnnotationPointer, targetId?: string, handle?: ResizeHandle): boolean {
    const current = latest.current;
    if (modeRef.current !== "annotation" || current.locked || deleteRef.current || gesture.current ||
        event.button !== 0 || event.isPrimary === false) return false;
    const start = current.toGraph({ x: event.clientX, y: event.clientY });
    let original: RectangleAnnotation;
    let kind: RectangleGesture["kind"];
    if (toolRef.current === "rectangle") {
      if (current.annotations.length >= ANNOTATION_LIMIT) {
        setError(`A layout can contain at most ${ANNOTATION_LIMIT} annotations.`); chooseTool("select");
        event.preventDefault(); event.stopPropagation(); return true;
      }
      original = { id: crypto.randomUUID(), kind: "rectangle", x: start.x, y: start.y,
        width: 0, height: 0, color: "blue", fill: "light", border: "normal" };
      kind = "draw";
      select(null);
    } else {
      const target = current.annotations.find((annotation) => annotation.id === targetId);
      if (target?.kind !== "rectangle") { select(null); return false; }
      original = { ...target };
      kind = handle ? "resize" : "move";
      select(target.id);
    }
    event.preventDefault(); event.stopPropagation();
    gesture.current = { kind, original, start, handle, pointerId: event.pointerId, capture: event.currentTarget };
    event.currentTarget.setPointerCapture(event.pointerId);
    current.onBusy(true);
    setPreview(kind === "draw" ? null : original);
    setError("");
    return true;
  }
  function move(event: AnnotationPointer): boolean {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return false;
    event.preventDefault(); event.stopPropagation();
    setPreview(rectanglePreview(active, latest.current.toGraph({ x: event.clientX, y: event.clientY })));
    return true;
  }
  function end(event: AnnotationPointer): boolean {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return false;
    event.preventDefault(); event.stopPropagation();
    const accepted = finishRectangle(active, latest.current.toGraph({ x: event.clientX, y: event.clientY }));
    release(); chooseTool("select");
    if (accepted && !latest.current.locked) {
      latest.current.setAnnotations((annotations) => active.kind === "draw"
        ? annotationSnapshot([...annotations, accepted])
        : annotationSnapshot(annotations.map((annotation) => annotation.id === accepted.id ? accepted : annotation)));
      select(accepted.id);
    }
    return true;
  }
  function cancelPointer(event: Pick<AnnotationPointer, "pointerId">) {
    if (gesture.current?.pointerId === event.pointerId) cancel();
  }
  function setRectangleStyle(patch: Partial<Pick<RectangleAnnotation, "color" | "fill" | "border">>) {
    if (latest.current.locked || gesture.current || deleteRef.current || modeRef.current !== "annotation") return;
    latest.current.setAnnotations((annotations) => annotationSnapshot(annotations.map((annotation) =>
      annotation.id === selectedRef.current && annotation.kind === "rectangle" ? { ...annotation, ...patch } : annotation)));
  }
  function requestDelete() {
    if (latest.current.locked || gesture.current || deleteRef.current || modeRef.current !== "annotation") return;
    const annotation = latest.current.annotations.find((item) => item.id === selectedRef.current);
    if (annotation?.kind !== "rectangle") return;
    deleteRef.current = annotation.id; setDeleteId(annotation.id);
  }
  function cancelDelete() { deleteRef.current = null; setDeleteId(null); }
  function confirmDelete() {
    if (latest.current.locked || !deleteRef.current) return;
    const id = deleteRef.current;
    cancelDelete();
    latest.current.setAnnotations((annotations) => annotations.filter((annotation) => annotation.id !== id));
    select(null);
  }
  return { mode, tool, selected, selectedId, preview, deleteTarget, error,
    switchMode, setActiveTool, begin, move, end, cancelPointer, cancel, reset,
    setRectangleStyle, requestDelete, cancelDelete, confirmDelete,
    get gestureActive() { return gesture.current !== null; },
  };
}
export type AnnotationWorkspace = ReturnType<typeof useAnnotationWorkspace>;
