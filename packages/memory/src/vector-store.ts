import type { EmbeddingFunction } from "./embedding.js";
import type { MemoryStore } from "./memory-store.js";
import type { MemoryEntry, MemoryQuery } from "./types.js";

/** Query extension with optional embedding vector for similarity search. */
export interface VectorQuery extends MemoryQuery {
  /** Query vector for cosine similarity ranking. */
  embedding?: number[];
}

/** Result returned by {@link VectorMemoryStore.consolidate}. */
export interface ConsolidateResult {
  /** Entries that were removed (merged into a surviving entry). */
  removed: MemoryEntry[];
  /** Entries that survived consolidation (absorbed a duplicate). */
  merged: MemoryEntry[];
}

interface StoredEntry {
  entry: MemoryEntry;
  embedding?: number[];
}

/** Pure-TS cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * In-memory MemoryStore backed by cosine-similarity vector search.
 *
 * When constructed with an `embeddingFn`, `put` and `search` automatically
 * compute embeddings from `entry.content` / `query.text` respectively —
 * callers never need to provide vectors directly.
 *
 * Without an `embeddingFn` the store still works: vectors can be supplied
 * explicitly via the `VectorQuery.embedding` field or the two-arg `put`.
 *
 * `save` / `load` provide JSON round-trip persistence.
 */
export class VectorMemoryStore implements MemoryStore {
  private store = new Map<string, StoredEntry>();
  private embeddingFn?: EmbeddingFunction;

  constructor(embeddingFn?: EmbeddingFunction) {
    this.embeddingFn = embeddingFn;
  }

  async put(
    entry: MemoryEntry,
    embedding?: number[],
  ): Promise<void> {
    let vec = embedding;
    // auto-embed when an embeddingFn is configured and no vector is provided
    if (!vec && this.embeddingFn && entry.content) {
      vec = await this.embeddingFn(entry.content);
    }
    this.store.set(entry.id, {
      entry: { ...entry },
      embedding: vec ? [...vec] : undefined,
    });
  }

  async get(id: string): Promise<MemoryEntry | undefined> {
    const stored = this.store.get(id);
    return stored ? { ...stored.entry } : undefined;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async search(query: VectorQuery): Promise<MemoryEntry[]> {
    let results = [...this.store.values()];

    // metadata filter
    if (query.filter) {
      results = results.filter((s) =>
        Object.entries(query.filter!).every(
          ([key, value]) => s.entry.metadata[key] === value,
        ),
      );
    }

    // resolve the query vector: explicit > auto-embed from query.text
    let queryVector = query.embedding;
    if (!queryVector && this.embeddingFn && query.text) {
      queryVector = await this.embeddingFn(query.text);
    }

    // cosine similarity ranking when a vector is available
    if (queryVector) {
      results = results
        .filter((s) => s.embedding !== undefined)
        .map((s) => ({
          stored: s,
          score: cosineSimilarity(queryVector!, s.embedding!),
        }))
        .sort((a, b) => b.score - a.score)
        .map(({ stored }) => stored);
    }

    if (query.offset) {
      results = results.slice(query.offset);
    }
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results.map((s) => ({ ...s.entry }));
  }

  async list(): Promise<MemoryEntry[]> {
    return [...this.store.values()].map((s) => ({ ...s.entry }));
  }

  /** Serialize store contents to a JSON string. */
  save(): string {
    const data = [...this.store.values()].map((s) => ({
      entry: s.entry,
      embedding: s.embedding,
    }));
    return JSON.stringify(data);
  }

  /** Load entries from a JSON string, replacing current contents. */
  load(json: string): void {
    this.store.clear();
    const data = JSON.parse(json) as Array<{
      entry: MemoryEntry;
      embedding?: number[];
    }>;
    for (const item of data) {
      this.store.set(item.entry.id, {
        entry: item.entry,
        embedding: item.embedding,
      });
    }
  }

  /**
   * Detect entries with similar embeddings (cosine > threshold) and merge
   * them: the entry with the higher `importance` survives, absorbing the
   * metadata of its duplicates. Duplicate entries are deleted from the store.
   *
   * Entries without an embedding are skipped.
   *
   * @param threshold  Cosine-similarity threshold (default 0.95).
   */
  async consolidate(threshold = 0.95): Promise<ConsolidateResult> {
    const entries = [...this.store.values()].filter((s) => s.embedding);

    const removed = new Set<string>();
    const removedEntries: MemoryEntry[] = [];
    const mergedEntries: MemoryEntry[] = [];

    for (let i = 0; i < entries.length; i++) {
      if (removed.has(entries[i].entry.id)) continue;

      const group: StoredEntry[] = [entries[i]];

      for (let j = i + 1; j < entries.length; j++) {
        if (removed.has(entries[j].entry.id)) continue;

        const sim = cosineSimilarity(
          entries[i].embedding!,
          entries[j].embedding!,
        );

        if (sim > threshold) {
          group.push(entries[j]);
        }
      }

      if (group.length < 2) continue;

      // Pick the survivor: highest importance, then latest updatedAt as
      // tiebreaker, then first encountered.
      group.sort((a, b) => {
        const impA = a.entry.importance ?? 0;
        const impB = b.entry.importance ?? 0;
        if (impB !== impA) return impB - impA;
        return b.entry.updatedAt - a.entry.updatedAt;
      });

      const survivor = group[0];
      const victims = group.slice(1);

      // Merge metadata: victim keys are added only when absent on survivor.
      const mergedMetadata = { ...survivor.entry.metadata };
      for (const victim of victims) {
        for (const [key, value] of Object.entries(victim.entry.metadata)) {
          if (!(key in mergedMetadata)) {
            mergedMetadata[key] = value;
          }
        }
      }

      const updatedSurvivor: MemoryEntry = {
        ...survivor.entry,
        metadata: mergedMetadata,
        updatedAt: Date.now(),
      };

      this.store.set(updatedSurvivor.id, {
        entry: updatedSurvivor,
        embedding: survivor.embedding,
      });

      for (const victim of victims) {
        removed.add(victim.entry.id);
        this.store.delete(victim.entry.id);
        removedEntries.push(victim.entry);
      }

      mergedEntries.push(updatedSurvivor);
    }

    return { removed: removedEntries, merged: mergedEntries };
  }
}
