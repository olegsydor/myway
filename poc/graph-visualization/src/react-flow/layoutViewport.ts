import { readViewport, writeViewport, type LayoutViewport } from "./workspacePreferences.ts";

// One generation owns camera initialization and all completed movement writes.
export class LayoutViewportCoordinator {
  private generation = 0;
  private initialized = false;
  private scope: string | null = null;
  private id: number | null = null;
  begin(scope: string | null, id: number | null) {
    this.scope = scope;
    this.id = id;
    this.initialized = false;
    return ++this.generation;
  }
  current(token: number) { return token === this.generation; }
  stored() { return this.id === null ? null : readViewport(this.scope, this.id); }
  finish(token: number, viewport: LayoutViewport) {
    if (!this.current(token)) return false;
    this.initialized = true;
    this.moved(token, viewport);
    return true;
  }
  moved(token: number, viewport: LayoutViewport) {
    if (this.current(token) && this.initialized && this.id !== null) {
      writeViewport(this.scope, this.id, viewport);
    }
  }
  cancel() { ++this.generation; this.initialized = false; }
}
