type Stamp = { scope: string; version: string };

// Memory only. Every reuse first validates the actor's current access and revisions.
export class ValidatedReads {
  private generation = 0;
  private entries = new Map<string, { value: unknown; size: number; at: number }>();
  private bytes = 0;
  private stamp?: Promise<Stamp>;
  clear() {
    this.generation++;
    this.entries.clear();
    this.bytes = 0;
    this.stamp = undefined;
  }
  async read<T>(path: string, read: <R>(path: string) => Promise<R>, signal?: AbortSignal) {
    const generation = this.generation;
    const check = () => {
      signal?.throwIfAborted();
      if (generation !== this.generation)
        throw new DOMException('Dữ liệu đã thay đổi, vui lòng thử lại.', 'ReadInvalidatedError');
    };
    check();
    const pending = this.stamp || (this.stamp = read<Stamp>('/journal-state'));
    let stamp: Stamp;
    try {
      stamp = await pending;
    } catch (error) {
      this.clear();
      throw error;
    } finally {
      if (this.stamp === pending) this.stamp = undefined;
    }
    check();
    const key = `${stamp.scope}:${stamp.version}:${path}`;
    const cached = this.entries.get(key);
    if (cached && Date.now() - cached.at < 120000) return structuredClone(cached.value) as T;
    const value = await read<T>(path);
    check();
    const size = JSON.stringify(value).length * 2;
    if (size <= 4 * 1024 * 1024) {
      if (cached) {
        this.entries.delete(key);
        this.bytes -= cached.size;
      }
      this.entries.set(key, { value: structuredClone(value), size, at: Date.now() });
      this.bytes += size;
      while (this.entries.size > 32 || this.bytes > 8 * 1024 * 1024) {
        const oldest = this.entries.keys().next().value!;
        this.bytes -= this.entries.get(oldest)!.size;
        this.entries.delete(oldest);
      }
    }
    return value;
  }
}
