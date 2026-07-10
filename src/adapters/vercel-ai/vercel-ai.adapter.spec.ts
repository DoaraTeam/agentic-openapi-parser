jest.mock('ai', () => ({
  tool: (config: Record<string, unknown>) => config,
}));

import { VercelAiAdapter } from './vercel-ai.adapter';
import { DynamicToolDefinition } from '@/types';

describe('VercelAiAdapter', () => {
  const toolsDef: DynamicToolDefinition[] = [
    {
      name: 'getUserById',
      description: 'Get a user by id',
      method: 'get',
      url: '/users/{id}',
      parameters: [{ name: 'id', schema: { type: 'integer' }, required: true }],
    },
  ];

  it('produces a tools map keyed by sanitized tool name', () => {
    const executor = { execute: jest.fn().mockResolvedValue({ id: 1 }) };
    const adapter = new VercelAiAdapter(executor, {}, toolsDef);

    const tools = adapter.getTools();
    expect(Object.keys(tools)).toEqual(['getUserById']);
  });

  it('executes via the injected executor and returns the raw result', async () => {
    const executor = { execute: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }) };
    const adapter = new VercelAiAdapter(executor, { paths: {} }, toolsDef, { accessToken: 'tok' });

    const tools = adapter.getTools() as Record<string, { execute: (args: unknown) => Promise<unknown> }>;
    const getUserById = tools.getUserById;
    if (!getUserById) throw new Error('expected getUserById tool to be present');
    const result = await getUserById.execute({ id: 1 });

    expect(executor.execute).toHaveBeenCalledWith({ paths: {} }, 'getUserById', { id: 1 }, { accessToken: 'tok' });
    expect(result).toEqual({ id: 1, name: 'Alice' });
  });
});
