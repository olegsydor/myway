export const WORKSPACE_PANEL_PREFERENCE = 'myway:workspace-panel:v2';
export const LEGACY_PANEL_PREFERENCE = 'myway:tools-panel:v1';
export const WORKSPACE_PANEL_ID = 'myway-workspace-panel';

export const PANEL_TITLES = {
  'create-node': 'Create Node',
  'create-edge': 'Create Edge',
  search: 'Search & Navigate',
  annotations: 'Annotations',
};
export type PanelView = keyof typeof PANEL_TITLES;
export type GraphPanelView = Exclude<PanelView, 'annotations'>;
export type PanelPreference = { open: boolean; graphView: GraphPanelView };
export type PanelStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function initialPanelPreference(width: number, storage: PanelStorage | null): {
  preference: PanelPreference; migrated: boolean;
} {
  const fallback: PanelPreference = { open: width >= 1200, graphView: 'search' };
  try {
    const raw = storage?.getItem(WORKSPACE_PANEL_PREFERENCE);
    if (raw != null) {
      const saved = JSON.parse(raw);
      const view = saved?.graphView;
      if (typeof saved?.open === 'boolean' && (view === 'search' || view === 'create-node' || view === 'create-edge')) {
        return { preference: { open: saved.open, graphView: view }, migrated: false };
      }
    } else {
      const legacy = storage?.getItem(LEGACY_PANEL_PREFERENCE);
      if (legacy === 'open' || legacy === 'closed') {
        return { preference: { open: legacy === 'open', graphView: 'search' }, migrated: true };
      }
    }
  } catch { /* UI preferences must never prevent startup. */ }
  return { preference: fallback, migrated: false };
}

export function rememberPanelPreference(preference: PanelPreference, storage: PanelStorage | null): void {
  try { storage?.setItem(WORKSPACE_PANEL_PREFERENCE, JSON.stringify(preference)); }
  catch { /* The panel remains usable without storage. */ }
}

export function panelPresentation(width: number): 'docked' | 'overlay' {
  return width >= 1100 ? 'docked' : 'overlay';
}
