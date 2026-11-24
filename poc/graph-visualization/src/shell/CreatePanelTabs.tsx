const views = ['create-node', 'create-edge'] as const;
type CreateView = (typeof views)[number];

export function CreatePanelTabs({ view, onSelect }: { view: CreateView; onSelect: (view: CreateView) => void }) {
  return <div className="workspace-panel__tabs" role="tablist" aria-label="Create"
    onKeyDown={event => {
      let next: CreateView;
      if (event.key === 'Home') next = 'create-node';
      else if (event.key === 'End') next = 'create-edge';
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') next = view === 'create-node' ? 'create-edge' : 'create-node';
      else return;
      event.preventDefault();
      event.stopPropagation();
      onSelect(next);
      event.currentTarget.querySelector<HTMLButtonElement>(`#workspace-tab-${next}`)?.focus();
    }}>
    {views.map(key => <button key={key} id={`workspace-tab-${key}`} type="button" role="tab"
      aria-controls={`workspace-panel-${key}`} aria-selected={view === key} tabIndex={view === key ? 0 : -1}
      onClick={event => { onSelect(key); event.currentTarget.focus(); }}>{key === 'create-node' ? 'Node' : 'Edge'}</button>)}
  </div>;
}
