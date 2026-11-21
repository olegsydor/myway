export const ANNOTATION_HOVER_DELAY = 1000;
export const ANNOTATION_TOOLTIP_GUTTER = 8;

export interface AnnotationHoverTarget {
  id: string;
  x: number;
  y: number;
}

/** Wait for one stationary target, then keep the shown position until it leaves. */
export function createAnnotationHover<T extends AnnotationHoverTarget>({
  eligible, show,
}: { eligible: (candidate: T) => boolean; show: (candidate: T | null) => void }) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: T | undefined;
  let visible: T | undefined;

  function clear() {
    clearTimeout(timer);
    timer = undefined;
    pending = undefined;
    if (visible) {
      visible = undefined;
      show(null);
    }
  }

  function move(candidate: T | undefined) {
    if (!candidate) { clear(); return; }
    if (visible?.id === candidate.id ||
        (pending?.id === candidate.id && pending.x === candidate.x && pending.y === candidate.y)) return;
    clear();
    pending = candidate;
    timer = setTimeout(() => {
      pending = undefined;
      timer = undefined;
      if (eligible(candidate)) {
        visible = candidate;
        show(candidate);
      }
    }, ANNOTATION_HOVER_DELAY);
  }

  return { move, clear };
}

export function annotationTooltipPosition(anchor: number, size: number, limit: number) {
  const gap = 12;
  const gutter = ANNOTATION_TOOLTIP_GUTTER;
  const preferred = anchor + gap + size <= limit - gutter ? anchor + gap : anchor - gap - size;
  return Math.max(gutter, Math.min(preferred, limit - gutter - size));
}
