import type { RectangleAnnotation, TextAnnotation } from "../src/shared/annotations.ts";
export const rectangle: RectangleAnnotation = {
  id: "12345678-1234-4123-8123-123456789abc", kind: "rectangle", x: -12.123456789, y: 8,
  width: 30, height: 40, color: "blue", fill: "light", border: "normal",
};
export const text: TextAnnotation = {
  id: "12345678-1234-4123-8123-123456789abd", kind: "text", x: 90, y: -40,
  text: "  Hello\nСвіт 🌍  ", color: "gray", size: "medium",
};
