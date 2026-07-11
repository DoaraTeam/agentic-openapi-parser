import { OpenAiToolAdapter } from './openai.adapter';
import { DynamicToolDefinition } from '@/types';
import { ToolNotFoundError } from '@/errors';

describe('OpenAiToolAdapter', () => {
  const toolsDef: DynamicToolDefinition[] = [
    {
      name: 'getUserById',
      description: 'Get a user by id',
      method: 'get',
      url: '/users/{id}',
      parameters: [{ name: 'id', schema: { type: 'integer' }, required: true }],
    },
  ];

  it('serializes tools into the OpenAI function-calling shape', () => {
    const executor = { execute: jest.fn(), executeMany: jest.fn() };
    const adapter = new OpenAiToolAdapter(executor, {}, toolsDef);

    const tools = adapter.getTools();

    expect(tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'getUserById',
          description: 'Get a user by id',
          parameters: {
            type: 'object',
            properties: { id: { type: 'integer' } },
            required: ['id'],
          },
        },
      },
    ]);
  });

  it('falls back to a generated description when the tool has none', () => {
    const executor = { execute: jest.fn(), executeMany: jest.fn() };
    const adapter = new OpenAiToolAdapter(executor, {}, [{ ...toolsDef[0]!, description: '' }]);

    expect(adapter.getTools()[0]?.function.description).toBe('Tool for getUserById');
  });

  it('executeToolCall resolves the sanitized name back to the original tool and runs it', async () => {
    const executor = { execute: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }), executeMany: jest.fn() };
    const adapter = new OpenAiToolAdapter(executor, { paths: {} }, toolsDef, { accessToken: 'tok' });

    const result = await adapter.executeToolCall('getUserById', { id: 1 });

    expect(executor.execute).toHaveBeenCalledWith({ paths: {} }, 'getUserById', { id: 1 }, { accessToken: 'tok' });
    expect(result).toEqual({ id: 1, name: 'Alice' });
  });

  it('executeToolCall throws a ToolNotFoundError for an unknown tool name', async () => {
    const executor = { execute: jest.fn(), executeMany: jest.fn() };
    const adapter = new OpenAiToolAdapter(executor, {}, toolsDef);

    await expect(adapter.executeToolCall('doesNotExist', {})).rejects.toThrow(ToolNotFoundError);
    await expect(adapter.executeToolCall('doesNotExist', {})).rejects.toThrow(/doesNotExist/);
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
