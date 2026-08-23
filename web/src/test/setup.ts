// The upload queue persists shots in IndexedDB, which jsdom does not provide.
import 'fake-indexeddb/auto';

/**
 * Node 22+ installs its own experimental `localStorage` global that shadows the
 * jsdom implementation and exposes no methods unless the runtime was started
 * with a storage file. Rather than depend on which of the two wins, install a
 * plain in-memory Storage so tests see consistent browser-like behaviour.
 */
class MemoryStorage implements Storage {
  #entries = new Map<string, string>();

  get length(): number {
    return this.#entries.size;
  }

  key(index: number): string | null {
    return [...this.#entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.#entries.get(String(key)) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#entries.set(String(key), String(value));
  }

  removeItem(key: string): void {
    this.#entries.delete(String(key));
  }

  clear(): void {
    this.#entries.clear();
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  const storage = new MemoryStorage();
  for (const target of [globalThis, typeof window === 'undefined' ? null : window]) {
    if (!target) continue;
    Object.defineProperty(target, name, {
      value: storage,
      configurable: true,
      writable: true,
    });
  }
}
