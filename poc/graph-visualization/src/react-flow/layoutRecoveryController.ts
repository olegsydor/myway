
import type { LayoutRecoveryRecord } from "./layoutRecovery";
import { LayoutRecoveryQueue } from "./layoutRecoveryQueue.ts";
import {
  readLayoutRecovery,
  writeLayoutRecovery,
  deleteLayoutRecovery,
} from "./layoutRecoveryStorage.ts";

export interface RecoveryStorage {
  read(
    scope: string,
    layoutId: number | null,
  ): Promise<unknown | null>;

  write(record: LayoutRecoveryRecord): Promise<void>;

  delete(
    scope: string,
    layoutId: number | null,
  ): Promise<void>;
}

export interface RecoveryControllerOptions {
  debounceMs?: number;
  storage?: RecoveryStorage;
  onError?: (error: unknown) => void;
}

interface PendingWrite {
  record: LayoutRecoveryRecord;
  timer: ReturnType<typeof setTimeout>;
}

const defaultStorage: RecoveryStorage = {
  read: readLayoutRecovery,
  write: writeLayoutRecovery,
  delete: deleteLayoutRecovery,
};

const sharedRecoveryQueue = new LayoutRecoveryQueue();
const recoveryGenerations = new Map<string, number>();

export class LayoutRecoveryController {
  private readonly queue = sharedRecoveryQueue;
  private readonly pending = new Map<string, PendingWrite>();

  private readonly storage: RecoveryStorage;
  private readonly debounceMs: number;
  private readonly onError: (error: unknown) => void;

  private disposed = false;

  constructor(options: RecoveryControllerOptions = {}) {
    this.storage = options.storage ?? defaultStorage;
    this.debounceMs = options.debounceMs ?? 500;
    this.onError = options.onError ?? (() => undefined);

    if (
      !Number.isFinite(this.debounceMs) ||
      this.debounceMs < 0
    ) {
      throw new Error("Invalid recovery debounce interval");
    }
  }

  private key(
    scope: string,
    layoutId: number | null,
  ): string {
    if (!scope.trim()) {
      throw new Error("Recovery scope is required");
    }

    if (
      layoutId !== null &&
      (!Number.isSafeInteger(layoutId) || layoutId <= 0)
    ) {
      throw new Error("Invalid recovery layout ID");
    }

    return JSON.stringify([scope, layoutId]);
  }

  private ensureActive(): void {
    if (this.disposed) {
      throw new Error("Recovery controller is disposed");
    }
  }

  private cancelPending(key: string): LayoutRecoveryRecord | null {
    const pending = this.pending.get(key);

    if (!pending) {
      return null;
    }

    clearTimeout(pending.timer);
    this.pending.delete(key);

    return pending.record;
  }

  private reportError(error: unknown): void {
    try {
      this.onError(error);
    } catch {
      // Diagnostic callbacks must not produce unhandled rejections.
    }
  }

  schedule(
    record: LayoutRecoveryRecord,
    generation?: number,
  ): void {
    this.ensureActive();

    const key = this.key(record.scope, record.layoutId);
    const currentGeneration = recoveryGenerations.get(key) ?? 0;

    if (
      generation !== undefined &&
      generation !== currentGeneration
    ) {
      return;
    }

    this.cancelPending(key);

    const timer = setTimeout(() => {
      const pending = this.pending.get(key);

      if (!pending || pending.timer !== timer || this.disposed) {
        return;
      }

      this.pending.delete(key);

      void this.queue
        .enqueue(key, async () => {
          // A clear() may have invalidated this snapshot
          // while it was waiting in the queue.
          if (
            (recoveryGenerations.get(key) ?? 0) !==
            currentGeneration
          ) {
            return;
          }

          await this.storage.write(pending.record);
        })
        .catch((error: unknown) => {
          this.reportError(error);
        });
    }, this.debounceMs);

    this.pending.set(key, { record, timer });
  }

  flush(
    scope: string,
    layoutId: number | null,
  ): Promise<void> {
    this.ensureActive();

    const key = this.key(scope, layoutId);
    const record = this.cancelPending(key);

    if (record) {
      return this.queue.enqueue(
        key,
        () => this.storage.write(record),
      );
    }

    // Also waits for an already-started write.
    return this.queue.enqueue(key, async () => undefined);
  }

  read(
    scope: string,
    layoutId: number | null,
  ): Promise<unknown | null> {
    this.ensureActive();

    const key = this.key(scope, layoutId);

    return this.queue.enqueue(
      key,
      () => this.storage.read(scope, layoutId),
    );
  }

  clear(
    scope: string,
    layoutId: number | null,
  ): Promise<void> {
    this.ensureActive();

    const key = this.key(scope, layoutId);

    const currentGeneration = recoveryGenerations.get(key) ?? 0;
    recoveryGenerations.set(key, currentGeneration + 1);

    this.cancelPending(key);

    return this.queue.enqueue(
      key,
      () => this.storage.delete(scope, layoutId),
    );
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
    }

    this.pending.clear();

    // Already-started operations are allowed to finish.
    // Existing IndexedDB records are not deleted.
  }

  getGeneration(
    scope: string,
    layoutId: number | null,
  ): number {
    this.ensureActive();

    const key = this.key(scope, layoutId);
    return recoveryGenerations.get(key) ?? 0;
  }
}
