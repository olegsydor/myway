import type { RectangleAnnotation } from "../shared/annotations";
export const ANNOTATION_COLORS = {
  gray: "#475569", blue: "#2563eb", green: "#15803d", yellow: "#ca8a04", red: "#dc2626", purple: "#9333ea",
} as const;
export const ANNOTATION_TEXT_SIZE = { small: 14, medium: 20, large: 28 } as const;
export const RECTANGLE_FILL = { none: 0, light: 0.10, medium: 0.22 } as const;
export const RECTANGLE_BORDER = { thin: 1, normal: 2, thick: 4 } as const;
export function rectangleStyle(rectangle: RectangleAnnotation) {
  return { color: ANNOTATION_COLORS[rectangle.color], opacity: RECTANGLE_FILL[rectangle.fill], border: RECTANGLE_BORDER[rectangle.border] };
}
