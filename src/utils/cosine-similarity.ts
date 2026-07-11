/**
 * Cosine similarity between two equal-length vectors, in [-1, 1]. Returns 0 for a zero-magnitude
 * vector (direction is undefined) instead of NaN, so a degenerate embedding can't poison a
 * similarity ranking with a NaN that sorts unpredictably.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Cannot compare vectors of different lengths (${a.length} vs ${b.length})`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
