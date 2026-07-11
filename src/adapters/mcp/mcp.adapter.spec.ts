const registerToolMock = jest.fn();

jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: jest.fn().mockImplementation(() => ({
    registerTool: registerToolMock,
  })),
}));

import { McpToolAdapter } from './mcp.adapter';
import { DynamicToolDefinition } from '@/types';

describe('McpToolAdapter', () => {
  const toolsDef: DynamicToolDefinition[] = [
    {
      name: 'getUserById',
      description: 'Get a user by id',
      method: 'get',
      url: '/users/{id}',
      parameters: [{ name: 'id', schema: { type: 'integer' }, required: true }],
    },
  ];

  beforeEach(() => {
    registerToolMock.mockClear();
  });

  it('registers each tool onto the given server with a sanitized name and description', () => {
    const executor = { execute: jest.fn() };
    const adapter = new McpToolAdapter(executor, {}, toolsDef);
    const server = { registerTool: registerToolMock } as never;

    adapter.registerOn(server);

    expect(registerToolMock).toHaveBeenCalledTimes(1);
    const [name, config] = registerToolMock.mock.calls[0];
    expect(name).toBe('getUserById');
    expect(config.description).toBe('Get a user by id');
    expect(config.inputSchema).toHaveProperty('id');
  });

  it('handler executes via the injected executor and returns MCP content shape', async () => {
    const executor = { execute: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }) };
    const adapter = new McpToolAdapter(executor, { paths: {} }, toolsDef, { accessToken: 'tok' });
    const server = { registerTool: registerToolMock } as never;

    adapter.registerOn(server);

    const [, , handler] = registerToolMock.mock.calls[0];
    const result = await handler({ id: 1 });

    expect(executor.execute).toHaveBeenCalledWith({ paths: {} }, 'getUserById', { id: 1 }, { accessToken: 'tok' });
    expect(result).toEqual({ content: [{ type: 'text', text: JSON.stringify({ id: 1, name: 'Alice' }) }] });
  });

  it('handler catches executor errors and returns isError content instead of throwing', async () => {
    const executor = { execute: jest.fn().mockRejectedValue(new Error('boom')) };
    const adapter = new McpToolAdapter(executor, {}, toolsDef);
    const server = { registerTool: registerToolMock } as never;

    adapter.registerOn(server);

    const [, , handler] = registerToolMock.mock.calls[0];
    const result = await handler({ id: 1 });

    expect(result).toEqual({ content: [{ type: 'text', text: 'boom' }], isError: true });
  });

  it('createServer builds a fresh McpServer and registers tools on it', () => {
    const executor = { execute: jest.fn() };
    const adapter = new McpToolAdapter(executor, {}, toolsDef);

    const server = adapter.createServer({ name: 'test-server', version: '1.0.0' });

    expect(server).toBeDefined();
    expect(registerToolMock).toHaveBeenCalledTimes(1);
  });
});
