export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function activeLayoutKey(scope: string | null): string | null {
  return scope && scope.trim() === scope
    ? `myway:last-active-layout:v1:${encodeURIComponent(scope)}` : null;
}

function browserStorage(): PreferenceStorage | null {
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
