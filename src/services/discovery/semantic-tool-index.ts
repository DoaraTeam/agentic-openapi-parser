import { DynamicToolDefinition } from '@/types';
import { cosineSimilarity } from '@/utils';
import { EmbeddingProviderError } from '@/errors';
import { EmbeddingProvider } from './embedding-provider.interface';

/** The minimum shape SemanticToolIndex needs — satisfied by DynamicToolDefinition, but also by a
 *  tool object from any other source (an MCP server's tools/list, a hand-written tool, ...). */
export interface SemanticTool {
  name: string;
  description: string;
  tags?: string[];
}

export interface SemanticToolIndexOptions<T extends SemanticTool = DynamicToolDefinition> {
  /** Builds the text embedded for each tool. Defaults to "name description tag1 tag2 ...". */
  buildText?: (tool: T) => string;
}

interface IndexedTool<T> {
  tool: T;
  embedding: number[];
}

function defaultBuildText(tool: SemanticTool): string {
  const parts = [tool.name, tool.description, ...(tool.tags ?? [])];
  return parts.filter(Boolean).join(' ');
}

/**
 * Ranks tools by semantic similarity to a natural-language query, for tool sets large enough
 * (100-200+) that even a well-tuned static filter (ToolFilterOptions) can't narrow the set down
 * for one specific user intent.
 *
 * Generic over the tool shape (default DynamicToolDefinition, this library's own OpenAPI-derived
 * type) — the ranking only ever reads name/description/tags, so the same index works unmodified
 * for tools from any other source (an MCP server's tools/list, a hand-written tool registry, ...)
 * as long as they satisfy SemanticTool. search() returns the exact objects passed to build(), so
 * callers get back their own tool type, not a stripped-down stand-in.
 *
 * Deliberately does not call any embedding API itself — EmbeddingProvider is a bring-your-own-X
 * interface (same pattern as AccessTokenProvider/ResponseProcessor), so this library stays
 * unopinionated about which embedding model or provider (OpenAI, Cohere, a local model, ...) is
 * used. This class only owns what's actually hard to get right: building the index once and
 * ranking many search() queries against it without re-embedding every tool per query.
 */
export class SemanticToolIndex<T extends SemanticTool = DynamicToolDefinition> {
  private indexed: IndexedTool<T>[] = [];
  private readonly buildText: (tool: T) => string;

  constructor(
    private readonly embeddingProvider: EmbeddingProvider,
    options: SemanticToolIndexOptions<T> = {}
  ) {
    this.buildText = options.buildText ?? defaultBuildText;
  }

  /** Embeds every tool and replaces the index. Call again to re-index after the tool set changes. */
  async build(tools: T[]): Promise<void> {
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
  async search(query: string, topK: number = 10): Promise<T[]> {
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
