import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';

/** Move real focus between the input and native result buttons; never select on arrows. */
export function useSearchResultNavigation({ open, count, disabled = false, onOpen, onClose }: {
  open: boolean; count: number; disabled?: boolean; onOpen: () => void; onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingFirst = useRef(false);
  useLayoutEffect(() => {
    if (open && count && !disabled && pendingFirst.current) {
      pendingFirst.current = false;
      buttons.current[0]?.focus();
    }
  }, [open, count, disabled]);

  function close() {
    pendingFirst.current = false;
    onClose();
    input.current?.focus();
  }
  function inputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled || event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' && count) {
      event.preventDefault(); event.stopPropagation();
      if (open) buttons.current[0]?.focus();
      else { pendingFirst.current = true; onOpen(); }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault(); event.stopPropagation(); close();
    }
  }
  function resultKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (disabled || event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'ArrowUp' && index === 0) input.current?.focus();
      else buttons.current[Math.min(count - 1, index + (event.key === 'ArrowDown' ? 1 : -1))]?.focus();
    }
    // Enter/Space and Tab retain native button behavior.
  }
  return { input, buttons, inputKey, resultKey };
}
