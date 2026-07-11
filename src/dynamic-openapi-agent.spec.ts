jest.mock('axios', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue({ data: { ok: true } }),
}));

import { DynamicOpenApiAgent } from './dynamic-openapi-agent';
import { IDynamicToolExecutorService } from '@/services';

describe('DynamicOpenApiAgent', () => {
  it('wires up default parser/securityInjector/executor when constructed with just a logger', () => {
    const agent = new DynamicOpenApiAgent();
    expect(agent.getExecutor()).toBeDefined();
    expect(typeof agent.parseAndFlatten).toBe('function');
    expect(typeof agent.executeTool).toBe('function');
  });

  it('wires an overridden securityInjector into the internally-built executor', async () => {
    const inject = jest.fn();
    const agent = new DynamicOpenApiAgent(undefined, { securityInjector: { inject } });

    const spec = { paths: { '/ping': { get: { operationId: 'ping' } } } };
    await agent.executeTool(spec, 'ping', {}, { accessToken: 'tok' });

    expect(inject).toHaveBeenCalledWith(spec, { operationId: 'ping' }, 'tok', expect.any(Object), expect.any(Object), undefined);
  });

  it('returns the exact overridden executor instance from getExecutor()', () => {
    const customExecutor: IDynamicToolExecutorService = { execute: jest.fn().mockResolvedValue('custom') };
    const agent = new DynamicOpenApiAgent(undefined, { executor: customExecutor });
    expect(agent.getExecutor()).toBe(customExecutor);
  });
});
