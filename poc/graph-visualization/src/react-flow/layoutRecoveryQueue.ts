export class LayoutRecoveryQueue {
  private readonly pending = new Map<string, Promise<void>>();

  enqueue<T>(
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.pending.get(key) ?? Promise.resolve();

    const result = previous
      .catch(() => undefined)
      .then(operation);

    const settled = result.then(
      () => undefined,
      () => undefined,
    );

    this.pending.set(key, settled);

    void settled.then(() => {
      if (this.pending.get(key) === settled) {
        this.pending.delete(key);
      }
    });

    return result;
  }
}
