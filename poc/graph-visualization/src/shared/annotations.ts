export const ANNOTATION_LIMIT = 2000;
export const ANNOTATION_TEXT_LIMIT = 2000;
export const RECTANGLE_MIN_SIZE = 20;
export const COORDINATE_TOLERANCE = 1e-6;
export type AnnotationColor = "gray" | "blue" | "green" | "yellow" | "red" | "purple";

interface AnnotationBase {
  id: string;
  x: number;
  y: number;
  color: AnnotationColor;
}
export interface RectangleAnnotation extends AnnotationBase {
  kind: "rectangle";
  width: number;
  height: number;
  fill: "none" | "light" | "medium";
  border: "thin" | "normal" | "thick";
}
export interface TextAnnotation extends AnnotationBase {
  kind: "text";
  text: string;
  size: "small" | "medium" | "large";
}
export type Annotation = RectangleAnnotation | TextAnnotation;
const colors = ["gray", "blue", "green", "yellow", "red", "purple"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
// Python str.strip()/PostgreSQL contract, including NEL and excluding BOM.
const whitespace = new Set([9, 10, 11, 12, 13, 28, 29, 30, 31, 32, 133, 160, 5760,
  8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288]);
export const annotationTextHasContent = (text: string) => [...text].some((character) => !whitespace.has(character.codePointAt(0)!));

/** Validate external data and copy it into a canonical, detached snapshot. */
export function annotationSnapshot(candidate: unknown): Annotation[] {
  if (!Array.isArray(candidate)) throw new Error("Invalid annotation snapshot: expected an array");
  if (candidate.length > ANNOTATION_LIMIT) {
    throw new Error(`A layout must contain at most ${ANNOTATION_LIMIT} annotations`);
  }
  const ids = new Set<string>();
  return Array.from(candidate, (value: unknown) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Invalid annotation");
    }
    const row = value as Record<string, unknown>;
    const keys = row.kind === "rectangle"
      ? ["id", "kind", "x", "y", "color", "width", "height", "fill", "border"]
      : row.kind === "text" ? ["id", "kind", "x", "y", "color", "text", "size"] : [];
    if (!keys.length || Object.keys(row).length !== keys.length ||
        !keys.every((key) => Object.hasOwn(row, key)) ||
        typeof row.id !== "string" || !uuid.test(row.id) ||
        !finite(row.x) || !finite(row.y) || !colors.includes(row.color as string)) {
      throw new Error("Invalid annotation identity, geometry or style");
    }
    const id = row.id.toLowerCase();
    if (ids.has(id)) throw new Error("Duplicate annotation IDs");
    ids.add(id);
    const common = { id, x: row.x, y: row.y, color: row.color as AnnotationColor };
    if (row.kind === "rectangle") {
      if (!finite(row.width) || row.width <= 0 || !finite(row.height) || row.height <= 0 ||
          !["none", "light", "medium"].includes(row.fill as string) ||
          !["thin", "normal", "thick"].includes(row.border as string)) {
        throw new Error("Invalid rectangle dimensions or style");
      }
      return { ...common, kind: "rectangle", width: row.width, height: row.height,
        fill: row.fill as RectangleAnnotation["fill"], border: row.border as RectangleAnnotation["border"] };
    }
    if (typeof row.text !== "string" || !annotationTextHasContent(row.text) ||
        [...row.text].length > ANNOTATION_TEXT_LIMIT ||
        !["small", "medium", "large"].includes(row.size as string)) {
      throw new Error(`Text annotations require non-empty text up to ${ANNOTATION_TEXT_LIMIT} characters and a valid size`);
    }
    return { ...common, kind: "text", text: row.text, size: row.size as TextAnnotation["size"] };
  });
}

export function annotationsEqual(left: readonly Annotation[], right: readonly Annotation[]): boolean {
  return left.length === right.length && left.every((annotation, index) => {
    const previous = right[index];
    return Object.keys(annotation).length === Object.keys(previous).length &&
      (Object.keys(annotation) as (keyof Annotation)[]).every((key) => {
        const value = annotation[key];
        const other = previous[key];
        return typeof value === "number" && typeof other === "number"
          ? Number.isFinite(value) && Number.isFinite(other) && Math.abs(value - other) <= COORDINATE_TOLERANCE
          : value === other;
      });
  });
}

/** Order and every persisted field participate; object property order does not. */
export function annotationFingerprint(annotations: unknown): string {
  return JSON.stringify(annotationSnapshot(annotations));
}

export function normalizeRectangle(start: { x: number; y: number }, end: { x: number; y: number }) {
  if (![start.x, start.y, end.x, end.y].every(finite)) throw new Error("Invalid rectangle coordinates");
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (!finite(width) || !finite(height)) throw new Error("Invalid rectangle dimensions");
  if (width < RECTANGLE_MIN_SIZE || height < RECTANGLE_MIN_SIZE) return null;
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width, height };
}
