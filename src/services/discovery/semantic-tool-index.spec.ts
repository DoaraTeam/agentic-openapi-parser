import { SemanticToolIndex } from './semantic-tool-index';
import { EmbeddingProvider } from './embedding-provider.interface';
import { DynamicToolDefinition } from '@/types';
import { EmbeddingProviderError } from '@/errors';

function makeTool(overrides: Partial<DynamicToolDefinition>): DynamicToolDefinition {
  return {
    name: 'tool',
    description: '',
    method: 'get',
    url: '/tool',
    parameters: [],
    ...overrides,
  };
}

/** Maps exact text to a fixed vector so ranking behavior is fully deterministic in tests. */
function fakeEmbeddingProvider(vectors: Record<string, number[]>): EmbeddingProvider {
  return {
    embed: jest.fn(async (texts: string[]) =>
      texts.map((text) => {
        const vector = vectors[text];
        if (!vector) throw new Error(`No fixture vector for text: "${text}"`);
        return vector;
      })
    ),
  };
}

describe('SemanticToolIndex', () => {
  const getRefund = makeTool({ name: 'getRefund', description: 'Fetch a refund by id' });
  const createInvoice = makeTool({ name: 'createInvoice', description: 'Create a new invoice' });
  const listUsers = makeTool({ name: 'listUsers', description: 'List all users', tags: ['admin'] });

  it('has size 0 and returns no results before build() is called', async () => {
    const embeddingProvider = fakeEmbeddingProvider({});
    const index = new SemanticToolIndex(embeddingProvider);

    expect(index.size).toBe(0);
    expect(await index.search('anything')).toEqual([]);
    expect(embeddingProvider.embed).not.toHaveBeenCalled();
  });

  it('indexes 0 tools without calling the embedding provider', async () => {
    const embeddingProvider = fakeEmbeddingProvider({});
    const index = new SemanticToolIndex(embeddingProvider);

    await index.build([]);

    expect(index.size).toBe(0);
    expect(embeddingProvider.embed).not.toHaveBeenCalled();
  });

  it('embeds each tool using the default name+description+tags text and ranks by similarity', async () => {
    const embeddingProvider = fakeEmbeddingProvider({
      'getRefund Fetch a refund by id': [1, 0, 0],
      'createInvoice Create a new invoice': [0, 1, 0],
      'listUsers List all users admin': [0, 0, 1],
      'refund a payment': [1, 0, 0],
    });
    const index = new SemanticToolIndex(embeddingProvider);
    await index.build([getRefund, createInvoice, listUsers]);

    expect(index.size).toBe(3);

    const results = await index.search('refund a payment');

    expect(results[0]?.name).toBe('getRefund');
  });

  it('respects a custom buildText function', async () => {
    const embeddingProvider = fakeEmbeddingProvider({
      'CUSTOM:getRefund': [1, 0],
      'query': [1, 0],
    });
    const index = new SemanticToolIndex(embeddingProvider, {
      buildText: (tool) => `CUSTOM:${tool.name}`,
    });

    await index.build([getRefund]);
    const results = await index.search('query');

    expect(embeddingProvider.embed).toHaveBeenCalledWith(['CUSTOM:getRefund']);
    expect(results).toEqual([getRefund]);
  });

  it('limits results to topK, defaulting to 10', async () => {
    const tools = Array.from({ length: 15 }, (_, i) => makeTool({ name: `tool${i}`, description: `tool number ${i}` }));
    // Place the query at angle 0 and each tool at an increasing angle, so cosine similarity
    // (which depends only on direction, not magnitude) strictly decreases as i increases.
    const vectors: Record<string, number[]> = { query: [1, 0] };
    tools.forEach((tool, i) => {
      const theta = (i * Math.PI) / 2 / tools.length;
      vectors[`tool${i} tool number ${i}`] = [Math.cos(theta), Math.sin(theta)];
    });
    const embeddingProvider = fakeEmbeddingProvider(vectors);
    const index = new SemanticToolIndex(embeddingProvider);
    await index.build(tools);

    const defaultResults = await index.search('query');
    expect(defaultResults).toHaveLength(10);
    expect(defaultResults[0]?.name).toBe('tool0');

    const limitedResults = await index.search('query', 3);
    expect(limitedResults.map((t) => t.name)).toEqual(['tool0', 'tool1', 'tool2']);
  });

  it('returns an empty array when topK is 0 or negative, without calling the embedding provider for the query', async () => {
    const embeddingProvider = fakeEmbeddingProvider({
      'getRefund Fetch a refund by id': [1, 0],
    });
    const index = new SemanticToolIndex(embeddingProvider);
    await index.build([getRefund]);
    jest.clearAllMocks();

    expect(await index.search('query', 0)).toEqual([]);
    expect(await index.search('query', -5)).toEqual([]);
    expect(embeddingProvider.embed).not.toHaveBeenCalled();
  });

  it('throws an EmbeddingProviderError when the embedding provider returns a mismatched number of embeddings', async () => {
    const embeddingProvider: EmbeddingProvider = {
      embed: jest.fn().mockResolvedValue([[1, 0]]), // only 1, but we index 2 tools
    };
    const index = new SemanticToolIndex(embeddingProvider);

    await expect(index.build([getRefund, createInvoice])).rejects.toThrow(/returned 1 embeddings for 2 tools/);
    await expect(index.build([getRefund, createInvoice])).rejects.toThrow(EmbeddingProviderError);
  });

  it('re-indexing with build() replaces the previous index rather than appending to it', async () => {
    const embeddingProvider = fakeEmbeddingProvider({
      'getRefund Fetch a refund by id': [1, 0],
      'createInvoice Create a new invoice': [0, 1],
    });
    const index = new SemanticToolIndex(embeddingProvider);

    await index.build([getRefund]);
    expect(index.size).toBe(1);

    await index.build([createInvoice]);
    expect(index.size).toBe(1);
    expect((await index.search('createInvoice Create a new invoice'))[0]?.name).toBe('createInvoice');
  });
});
