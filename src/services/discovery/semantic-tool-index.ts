import { DynamicToolDefinition } from '@/types';
import { cosineSimilarity } from '@/utils';
import { EmbeddingProviderError } from '@/errors';
import { EmbeddingProvider } from './embedding-provider.interface';

export interface SemanticToolIndexOptions {
  /** Builds the text embedded for each tool. Defaults to "name description tag1 tag2 ...". */
  buildText?: (tool: DynamicToolDefinition) => string;
}

interface IndexedTool {
  tool: DynamicToolDefinition;
  embedding: number[];
}

function defaultBuildText(tool: DynamicToolDefinition): string {
  const parts = [tool.name, tool.description, ...(tool.tags ?? [])];
  return parts.filter(Boolean).join(' ');
}

/**
 * Ranks tools by semantic similarity to a natural-language query, for specs large enough
 * (100-200+ tools) that even a well-tuned static filter (ToolFilterOptions) can't narrow the set
 * down for one specific user intent.
 *
 * Deliberately does not call any embedding API itself — EmbeddingProvider is a bring-your-own-X
 * interface (same pattern as AccessTokenProvider/ResponseProcessor), so this library stays
 * unopinionated about which embedding model or provider (OpenAI, Cohere, a local model, ...) is
 * used. This class only owns what's actually hard to get right: building the index once and
 * ranking many search() queries against it without re-embedding every tool per query.
 */
export class SemanticToolIndex {
  private indexed: IndexedTool[] = [];
  private readonly buildText: (tool: DynamicToolDefinition) => string;

  constructor(
    private readonly embeddingProvider: EmbeddingProvider,
    options: SemanticToolIndexOptions = {}
  ) {
    this.buildText = options.buildText ?? defaultBuildText;
  }

  /** Embeds every tool and replaces the index. Call again to re-index after the tool set changes. */
  async build(tools: DynamicToolDefinition[]): Promise<void> {
    if (tools.length === 0) {
      this.indexed = [];
      return;
    }

    const texts = tools.map((tool) => this.buildText(tool));
    const embeddings = await this.embeddingProvider.embed(texts);

    if (embeddings.length !== tools.length) {
      throw new EmbeddingProviderError(
        `EmbeddingProvider returned ${embeddings.length} embeddings for ${tools.length} tools — these must match 1:1.`
      );
    }

    this.indexed = tools.map((tool, i) => {
      const embedding = embeddings[i];
      if (!embedding) {
        throw new EmbeddingProviderError(`EmbeddingProvider returned no embedding for tool "${tool.name}" at index ${i}.`);
      }
      return { tool, embedding };
    });
  }

  /** Returns up to topK tools ranked by similarity to the query. Empty if build() hasn't run yet, indexed 0 tools, or topK <= 0. */
  async search(query: string, topK: number = 10): Promise<DynamicToolDefinition[]> {
    if (this.indexed.length === 0 || topK <= 0) return [];

    const [queryEmbedding] = await this.embeddingProvider.embed([query]);
    if (!queryEmbedding) {
      throw new EmbeddingProviderError('EmbeddingProvider returned no embedding for the search query.');
    }

    return this.indexed
      .map(({ tool, embedding }) => ({ tool, score: cosineSimilarity(queryEmbedding, embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ tool }) => tool);
  }

  /** Number of tools currently indexed. */
  get size(): number {
    return this.indexed.length;
  }
}
