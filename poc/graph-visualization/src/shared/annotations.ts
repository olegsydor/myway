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
interface ShapeFields extends AnnotationBase {
  name?: string;
  description?: string;
  width: number;
  height: number;
  fill: "none" | "light" | "medium";
  border: "thin" | "normal" | "thick";
}
export interface RectangleAnnotation extends ShapeFields { kind: "rectangle" }
export interface EllipseAnnotation extends ShapeFields { kind: "ellipse" }
export type ShapeAnnotation = RectangleAnnotation | EllipseAnnotation;
export const shapeLabel = (kind: ShapeAnnotation["kind"]) => kind === "ellipse" ? "Ellipse" : "Rectangle";
export interface TextAnnotation extends AnnotationBase {
  kind: "text";
  text: string;
  size: "small" | "medium" | "large";
}
export type Annotation = ShapeAnnotation | TextAnnotation;
const colors = ["gray", "blue", "green", "yellow", "red", "purple"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
// Python str.strip()/PostgreSQL contract, including NEL and excluding BOM.
const whitespace = new Set([9, 10, 11, 12, 13, 28, 29, 30, 31, 32, 133, 160, 5760,
  8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288]);
export const annotationTextHasContent = (text: string) => [...text].some((character) => !whitespace.has(character.codePointAt(0)!));

export const ANNOTATION_METADATA_LIMIT = { name: 200, description: 2000 } as const;
// Include the Unicode line separators that HTML text inputs do not handle.
export function annotationNameOnOneLine(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\r\n\v\f\x1c-\x1e\x85\u2028\u2029]+/g, " ");
}

export function normalizeAnnotationMetadata(field: keyof typeof ANNOTATION_METADATA_LIMIT, value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || [...value].some((char) => {
    const point = char.codePointAt(0)!;
    return point === 0 || (point >= 0xd800 && point <= 0xdfff);
  })) throw new Error("Annotation metadata must be valid Unicode without NUL");
  const chars = [...(field === "name" ? annotationNameOnOneLine(value) : value)];
  let start = 0, end = chars.length;
  while (start < end && whitespace.has(chars[start].codePointAt(0)!)) start++;
  while (end > start && whitespace.has(chars[end - 1].codePointAt(0)!)) end--;
  if (end - start > ANNOTATION_METADATA_LIMIT[field]) {
    throw new Error(`Annotation ${field} exceeds ${ANNOTATION_METADATA_LIMIT[field]} characters`);
  }
  return chars.slice(start, end).join("") || undefined;
}

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
    const kind = row.kind;
    const shape = kind === "rectangle" || kind === "ellipse";
    const keys = shape
      ? ["id", "kind", "x", "y", "color", "width", "height", "fill", "border"]
      : row.kind === "text" ? ["id", "kind", "x", "y", "color", "text", "size"] : [];
    const allowedKeys = shape ? [...keys, "name", "description"] : keys;
    if (!keys.length || Object.keys(row).some(key => !allowedKeys.includes(key)) ||
        !keys.every((key) => Object.hasOwn(row, key)) ||
        typeof row.id !== "string" || !uuid.test(row.id) ||
        !finite(row.x) || !finite(row.y) || !colors.includes(row.color as string)) {
      throw new Error("Invalid annotation identity, geometry or style");
    }
    const id = row.id.toLowerCase();
    if (ids.has(id)) throw new Error("Duplicate annotation IDs");
    ids.add(id);
    const common = { id, x: row.x, y: row.y, color: row.color as AnnotationColor };
    if (shape) {
      if (!finite(row.width) || row.width <= 0 || !finite(row.height) || row.height <= 0 ||
          !["none", "light", "medium"].includes(row.fill as string) ||
          !["thin", "normal", "thick"].includes(row.border as string)) {
        throw new Error("Invalid shape dimensions or style");
      }
      const name = normalizeAnnotationMetadata("name", row.name);
      const description = normalizeAnnotationMetadata("description", row.description);
      return { ...common, kind, width: row.width, height: row.height,
        fill: row.fill as ShapeAnnotation["fill"], border: row.border as ShapeAnnotation["border"],
        ...(name === undefined ? {} : { name }), ...(description === undefined ? {} : { description }) };
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
