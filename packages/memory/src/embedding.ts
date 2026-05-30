/**
 * EmbeddingFunction — maps a text string to a numeric vector.
 *
 * Implementations range from lightweight mocks (MockEmbeddingFunction)
 * to production-grade adapters wrapping external embedding APIs.
 */
export type EmbeddingFunction = (text: string) => Promise<number[]>;

/**
 * Hash-based deterministic embedding function for testing and development.
 *
 * Uses a djb2-variant hash seeded per dimension index so the same text
 * always produces the same normalised vector.  Not semantically meaningful
 * — use only in tests or as a placeholder.
 */
export class MockEmbeddingFunction {
  private dimension: number;

  constructor(dimension: number = 128) {
    this.dimension = dimension;
  }

  /** Satisfies the EmbeddingFunction call signature. */
  async embed(text: string): Promise<number[]> {
    const vector = new Array<number>(this.dimension);
    for (let i = 0; i < this.dimension; i++) {
      const hash = djb2(text, i);
      vector[i] = ((hash % 2001) - 1000) / 1000; // range [-1, 1]
    }
    // normalise to unit length
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    return norm > 0 ? vector.map((v) => v / norm) : vector;
  }
}

/**
 * djb2 hash variant — each `seed` produces a different hash for the same
 * input string, giving us `dimension` independent-looking values.
 */
function djb2(str: string, seed: number): number {
  let hash = 5381 + seed;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return hash;
}
