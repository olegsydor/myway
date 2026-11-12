export const TOOLS_PANEL_PREFERENCE = 'myway:tools-panel:v1';
export const TOOLS_PANEL_INITIAL_WIDTH = 1200;
export const TOOLS_PANEL_DOCK_WIDTH = 1100;
export type PanelStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function initialToolsPanel(width: number, storage: PanelStorage | null): boolean {
  try {
    const saved = storage?.getItem(TOOLS_PANEL_PREFERENCE);
    if (saved === 'open') return true;
    if (saved === 'closed') return false;
  } catch { /* UI preferences must never prevent startup. */ }
  return width >= TOOLS_PANEL_INITIAL_WIDTH;
}
export function rememberToolsPanel(open: boolean, storage: PanelStorage | null): void {
  try { storage?.setItem(TOOLS_PANEL_PREFERENCE, open ? 'open' : 'closed'); }
  catch { /* A working panel is more important than persisting a preference. */ }
}
export function toolsPanelPresentation(width: number): 'docked' | 'overlay' {
  return width >= TOOLS_PANEL_DOCK_WIDTH ? 'docked' : 'overlay';
}
