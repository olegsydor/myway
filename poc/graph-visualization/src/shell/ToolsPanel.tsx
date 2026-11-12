import { useLayoutEffect, useRef, type ReactNode } from 'react';
export function ToolsPanel({ open, mode, onClose, children }: {
  open: boolean; mode: 'docked' | 'overlay'; onClose: () => void; children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const scrollTop = useRef(0);
  useLayoutEffect(() => {
    if (open && scroller.current) scroller.current.scrollTop = scrollTop.current;
  }, [open, mode]);
  const close = () => {
    onClose();
    if (!document.activeElement?.closest('[data-annotation-editor]')) {
      document.querySelector<HTMLElement>('[data-tools-toggle]')?.focus();
    }
  };
  return <>
    {open && mode === 'overlay' && <div className="tools-panel__backdrop" aria-hidden="true"
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}
      onClick={event => { event.preventDefault(); event.stopPropagation(); close(); }} />}
    <aside id="myway-tools-panel" aria-label="Tools panel" className={`react-flow-sidebar tools-panel tools-panel--${mode}`} hidden={!open}>
      {mode === 'overlay' && <div className="tools-panel__header">
        <strong>Tools</strong><button type="button" onPointerDown={event => event.preventDefault()} onClick={close} aria-label="Close tools panel">Close</button>
      </div>}
      <div className="react-flow-sidebar__content" ref={scroller}
        onScroll={event => { if (open) scrollTop.current = event.currentTarget.scrollTop; }}>
        {children}
      </div>
    </aside>
  </>;
}
