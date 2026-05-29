/**
 * ProgressiveDisclosure — lazy identifier → async loader mapping.
 *
 * Register loaders by id, load on demand, cache results.
 * Supports per-id and global cache invalidation.
 */
export class ProgressiveDisclosure<T> {
  private loaders = new Map<string, () => Promise<T>>();
  private cache = new Map<string, T>();

  /** Register an async loader for the given identifier. */
  register(id: string, loader: () => Promise<T>): void {
    this.loaders.set(id, loader);
  }

  /** Load value by id. First call invokes loader; subsequent calls return cached value. */
  async get(id: string): Promise<T> {
    const cached = this.cache.get(id);
    if (cached !== undefined) return cached;

    const loader = this.loaders.get(id);
    if (!loader) {
      throw new Error(`ProgressiveDisclosure: unknown identifier "${id}"`);
    }

    const value = await loader();
    this.cache.set(id, value);
    return value;
  }

  /** Clear cached value for a specific id. Next get() will re-invoke the loader. */
  invalidate(id: string): void {
    this.cache.delete(id);
  }

  /** Clear all cached values. */
  invalidateAll(): void {
    this.cache.clear();
  }

  /** Check if an identifier has been registered (regardless of cache state). */
  has(id: string): boolean {
    return this.loaders.has(id);
  }

  /** List all registered identifiers. */
  list(): string[] {
    return [...this.loaders.keys()];
  }
}
