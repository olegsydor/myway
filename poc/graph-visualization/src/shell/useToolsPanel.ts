import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { initialToolsPanel, rememberToolsPanel, toolsPanelPresentation } from './toolsPanelState.ts';
function storage() {
  try { return window.localStorage; } catch { return null; }
}
const subscribe = (listener: () => void) => {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
};
const presentation = () => toolsPanelPresentation(window.innerWidth);
export function useToolsPanel() {
  const [open, setOpen] = useState(() => initialToolsPanel(window.innerWidth, storage()));
  const explicit = useRef(false);
  const mode = useSyncExternalStore(subscribe, presentation, () => 'docked' as const);
  useEffect(() => { if (explicit.current) rememberToolsPanel(open, storage()); }, [open]);
  const show = useCallback(() => { explicit.current = true; setOpen(true); }, []);
  const hide = useCallback(() => { explicit.current = true; setOpen(false); }, []);
  const toggle = useCallback(() => { explicit.current = true; setOpen(value => !value); }, []);
  return { open, mode, show, hide, toggle };
}
