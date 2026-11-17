import type { RectangleAnnotation } from "../shared/annotations";
export const ANNOTATION_COLORS = {
  gray: "#53657b", blue: "#346dcb", green: "#39785b", yellow: "#8b681d", red: "#a94753", purple: "#8051aa",
} as const;
export const ANNOTATION_TEXT_SIZE = { small: 14, medium: 20, large: 28 } as const;
export const RECTANGLE_FILL = { none: 0, light: 0.10, medium: 0.22 } as const;
export const RECTANGLE_BORDER = { thin: 1, normal: 2, thick: 4 } as const;
export function rectangleStyle(rectangle: RectangleAnnotation) {
  return { color: ANNOTATION_COLORS[rectangle.color], opacity: RECTANGLE_FILL[rectangle.fill], border: RECTANGLE_BORDER[rectangle.border] };
}
