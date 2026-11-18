export interface WorkspaceExit {
  dirty: boolean;
  busy: boolean;
  save: () => Promise<boolean>;
  preserve: () => Promise<void>;
}
let current: WorkspaceExit | null = null;
export function registerWorkspace(value: WorkspaceExit) {
  current = value;
  return () => { if (current === value) current = null; };
}
export function workspaceExit() { return current; }
