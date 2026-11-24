import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { PANEL_TITLES, WORKSPACE_PANEL_ID, type PanelView } from './workspacePanelState.ts';

export function WorkspacePanel({ open, mode, view, onClose, header, shared, bodies }: {
  open: boolean; mode: 'docked' | 'overlay'; view: PanelView; onClose: () => void;
  header?: ReactNode; shared?: ReactNode; bodies: Record<PanelView, ReactNode>;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const positions = useRef<Record<PanelView, number>>({
    'create-node': 0, 'create-edge': 0, search: 0, annotations: 0,
  });
  useLayoutEffect(() => {
    if (open && scroller.current) scroller.current.scrollTop = positions.current[view];
  }, [open, mode, view]);

  return <>
    {open && mode === 'overlay' && <div className="workspace-panel__backdrop" aria-hidden="true"
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); }}
      onClick={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} />}
    <aside id={WORKSPACE_PANEL_ID} aria-label={PANEL_TITLES[view]}
      className={`react-flow-sidebar workspace-panel workspace-panel--${mode}`} hidden={!open}>
      <div className="workspace-panel__header">
        <h2>{PANEL_TITLES[view]}</h2>
        <button type="button" onPointerDown={event => event.preventDefault()} onClick={onClose}>Close</button>
      </div>
      {header}
      <div className="react-flow-sidebar__content" ref={scroller}
        onScroll={event => { if (open) positions.current[view] = event.currentTarget.scrollTop; }}>
        {shared}
        {(Object.keys(PANEL_TITLES) as PanelView[]).map(key => {
          const create = key === 'create-node' || key === 'create-edge';
          return <div key={key} data-panel-view={key} hidden={key !== view}
            id={`workspace-panel-${key}`} role={create ? 'tabpanel' : undefined}
            aria-labelledby={create ? `workspace-tab-${key}` : undefined}>
            {bodies[key]}
          </div>;
        })}
      </div>
    </aside>
  </>;
}
