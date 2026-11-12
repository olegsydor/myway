export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function activeLayoutKey(scope: string | null): string | null {
  return scope && scope.trim() === scope
    ? `myway:last-active-layout:v1:${encodeURIComponent(scope)}` : null;
}

export function browserStorage(): PreferenceStorage | null {
  try { return window.localStorage; } catch { return null; }
}

export function readActiveLayout(scope: string | null, storage = browserStorage()): number | null {
  const key = activeLayoutKey(scope);
  if (!key || !storage) return null;
  try {
    const value = storage.getItem(key);
    if (!value || !/^[1-9]\d*$/.test(value)) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
  } catch { return null; }
}

export function writeActiveLayout(scope: string | null, id: number, storage = browserStorage()): void {
  const key = activeLayoutKey(scope);
  if (!key || !storage || !Number.isSafeInteger(id) || id <= 0) return;
  try { storage.setItem(key, String(id)); } catch { /* Preferences never block the workspace. */ }
}

export function removeActiveLayout(scope: string | null, storage = browserStorage()): void {
  const key = activeLayoutKey(scope);
  if (!key || !storage) return;
  try { storage.removeItem(key); } catch { /* Best effort. */ }
}

export interface LayoutViewport { x: number; y: number; zoom: number }
export function viewportKey(scope: string | null, id: number): string | null {
  return activeLayoutKey(scope) && Number.isSafeInteger(id) && id > 0
    ? `myway:layout-viewport:v1:${encodeURIComponent(scope!)}:${id}` : null;
}
export function validViewport(value: unknown): value is LayoutViewport {
  if (!value || typeof value !== "object") return false;
  const v = value as LayoutViewport;
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.zoom) && v.zoom >= 0.05 && v.zoom <= 4;
}
export function readViewport(scope: string | null, id: number, storage = browserStorage()): LayoutViewport | null {
  const key = viewportKey(scope, id);
  if (!key || !storage) return null;
  try {
    const v = JSON.parse(storage.getItem(key) ?? "null");
    if (!validViewport(v as unknown) || v.version !== 1 || v.scope !== scope || v.layoutId !== id ||
      typeof v.savedAt !== "string" || !Number.isFinite(Date.parse(v.savedAt)) ||
      new Date(v.savedAt).toISOString() !== v.savedAt) return null;
    return { x: v.x, y: v.y, zoom: v.zoom };
  } catch { return null; }
}
export function writeViewport(scope: string | null, id: number, viewport: LayoutViewport,
  storage = browserStorage(), savedAt = new Date().toISOString()): void {
  const key = viewportKey(scope, id);
  if (!key || !storage || !validViewport(viewport)) return;
  try {
    if (new Date(savedAt).toISOString() !== savedAt) return;
    storage.setItem(key, JSON.stringify({ version: 1, scope, layoutId: id,
      x: viewport.x, y: viewport.y, zoom: viewport.zoom, savedAt }));
  } catch { /* Camera preferences are best effort. */ }
}
export function removeViewport(scope: string | null, id: number, storage = browserStorage()): void {
  const key = viewportKey(scope, id);
  if (!key || !storage) return;
  try { storage.removeItem(key); } catch { /* Best effort. */ }
}
