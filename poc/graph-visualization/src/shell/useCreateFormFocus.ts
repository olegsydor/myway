import { useCallback, useLayoutEffect, useRef, useState } from 'react';
export type CreateForm = 'createNode' | 'createEdge';
/** One shared reveal/focus path for Create menu commands and Stage 14 N/E. */
export function useCreateFormFocus(open: boolean, reveal: () => void) {
  const createNode = useRef<HTMLDivElement>(null);
  const createEdge = useRef<HTMLDivElement>(null);
  const [requested, setRequested] = useState<CreateForm | null>(null);
  useLayoutEffect(() => {
    if (!open || !requested) return;
    const frame = requestAnimationFrame(() => {
      const section = requested === 'createNode' ? createNode.current : createEdge.current;
      if (!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) {
        section?.scrollIntoView({ block: 'nearest' });
        section?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')?.focus();
      }
      setRequested(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, requested]);
  const focus = useCallback((form: CreateForm) => { reveal(); setRequested(form); }, [reveal]);
  return { createNode, createEdge, focus };
}
