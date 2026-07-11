import { LangchainToolAdapter } from './langchain.adapter';
import { DynamicToolDefinition } from '@/types';

describe('LangchainToolAdapter', () => {
  const toolsDef: DynamicToolDefinition[] = [
    {
      name: 'getUserById',
      description: 'Get a user by id',
      method: 'get',
      url: '/users/{id}',
      parameters: [{ name: 'id', schema: { type: 'integer' }, required: true }],
    },
  ];

  it('produces one DynamicStructuredTool per tool definition with a sanitized name', () => {
    const executor = { execute: jest.fn().mockResolvedValue({ id: 1 }) };
    const adapter = new LangchainToolAdapter(executor, {}, toolsDef);

    const tools = adapter.getTools();
    expect(tools).toHaveLength(1);
    const [tool] = tools;
    if (!tool) throw new Error('expected a tool to be present');
    expect(tool.name).toBe('getUserById');
    expect(tool.description).toBe('Get a user by id');
  });

  it('executes via the injected executor and JSON-stringifies the result', async () => {
    const executor = { execute: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }) };
    const adapter = new LangchainToolAdapter(executor, { paths: {} }, toolsDef, { accessToken: 'tok' });

    const [tool] = adapter.getTools();
    if (!tool) throw new Error('expected a tool to be present');
    const result = await tool.func({ id: 1 });

    expect(executor.execute).toHaveBeenCalledWith({ paths: {} }, 'getUserById', { id: 1 }, { accessToken: 'tok' });
    expect(result).toBe(JSON.stringify({ id: 1, name: 'Alice' }));
  });
});
