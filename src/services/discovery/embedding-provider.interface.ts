export interface EmbeddingProvider {
  /** Returns one embedding vector per input text, in the same order as the input. */
  embed(texts: string[]): Promise<number[][]>;
}
