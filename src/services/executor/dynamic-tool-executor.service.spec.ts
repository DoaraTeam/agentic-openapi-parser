import { DynamicToolExecutorService } from './dynamic-tool-executor.service';
import type { IOpenApiSecurityInjector } from '@/services';
import axios from 'axios';
import { ResponseProcessingError, ToolExecutionError, ToolNotFoundError } from '@/errors';

jest.mock('axios');

describe('DynamicToolExecutorService', () => {
  let service: DynamicToolExecutorService;
  let mockSecurityInjector: jest.Mocked<IOpenApiSecurityInjector>;

  beforeEach(() => {
    mockSecurityInjector = {
      inject: jest.fn(),
    };
    service = new DynamicToolExecutorService(mockSecurityInjector, {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    });
    jest.clearAllMocks();
  });

  it('should successfully execute a tool', async () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/users/{id}': {
          get: {
            operationId: 'getUser',
            parameters: [{ name: 'id', in: 'path' }, { name: 'role', in: 'query' }]
          }
        }
      }
    };

    (axios as unknown as jest.Mock).mockResolvedValue({ data: { success: true } });

    const result = await service.execute(mockSpec, 'getUser', { id: 123, role: 'admin' });

    expect(result).toEqual({ success: true });
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      method: 'get',
      url: 'https://api.example.com/users/123',
      params: { role: 'admin' },
      headers: { 'Content-Type': 'application/json' }
    }));
  });

  it('should handle execution errors and throw a masked ToolExecutionError', async () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/users': {
          get: { operationId: 'getUsers' }
        }
      }
    };

    const axiosError = {
      response: { status: 401, data: 'Unauthorized' },
      config: { headers: { Authorization: 'Bearer secret-token' }, params: {}, url: 'https://api.example.com/users' }
    };

    (axios as unknown as jest.Mock).mockRejectedValue(axiosError);

    await expect(service.execute(mockSpec, 'getUsers', {})).rejects.toThrow(/Status 401: Unauthorized/);

    // The exact error should contain masked token
    await expect(service.execute(mockSpec, 'getUsers', {})).rejects.toThrow(/Bearer \*\*\*/);
    await expect(service.execute(mockSpec, 'getUsers', {})).rejects.toThrow(ToolExecutionError);

    try {
      await service.execute(mockSpec, 'getUsers', {});
      fail('expected execute to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolExecutionError);
      expect((error as ToolExecutionError).statusCode).toBe(401);
      expect((error as ToolExecutionError).responseData).toBe('Unauthorized');
      expect((error as ToolExecutionError).cause).toBe(axiosError);
    }
  });

  it('runs the response through responseProcessors, in order, before returning', async () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: { '/users': { get: { operationId: 'getUsers' } } },
    };
    (axios as unknown as jest.Mock).mockResolvedValue({ data: 'hello' });

    const upper = { process: jest.fn((d: unknown) => String(d).toUpperCase()) };
    const exclaim = { process: jest.fn((d: unknown) => `${d}!`) };

    const result = await service.execute(mockSpec, 'getUsers', {}, { responseProcessors: [upper, exclaim] });

    expect(upper.process).toHaveBeenCalledWith('hello');
    expect(exclaim.process).toHaveBeenCalledWith('HELLO');
    expect(result).toBe('HELLO!');
  });

  it('does not alter the response when no responseProcessors are given', async () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: { '/users': { get: { operationId: 'getUsers' } } },
    };
    (axios as unknown as jest.Mock).mockResolvedValue({ data: { untouched: true } });

    const result = await service.execute(mockSpec, 'getUsers', {});

    expect(result).toEqual({ untouched: true });
  });

  it('propagates a responseProcessor failure as its own ResponseProcessingError, not as a masked "API Request Failed"', async () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: { '/users': { get: { operationId: 'getUsers' } } },
    };
    (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true } });

    class FakeJmesPathProcessor {
      process() {
        throw new Error('Invalid JMESPath expression');
      }
    }
    const throwingProcessor = new FakeJmesPathProcessor();

    await expect(
      service.execute(mockSpec, 'getUsers', {}, { responseProcessors: [throwingProcessor] })
    ).rejects.toThrow('Invalid JMESPath expression');
    await expect(
      service.execute(mockSpec, 'getUsers', {}, { responseProcessors: [throwingProcessor] })
    ).rejects.toThrow(ResponseProcessingError);

    try {
      await service.execute(mockSpec, 'getUsers', {}, { responseProcessors: [throwingProcessor] });
      fail('expected execute to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(ResponseProcessingError);
      expect((error as ResponseProcessingError).processorName).toBe('FakeJmesPathProcessor');
    }
  });

  it('refreshes the token via tokenRefresher before injecting security, and uses the new token', async () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: { '/users': { get: { operationId: 'getUsers' } } },
    };
    (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true } });

    const tokenRefresher = {
      refreshIfNeeded: jest.fn().mockResolvedValue({ accessToken: 'new-token' }),
    };

    await service.execute(
      mockSpec,
      'getUsers',
      {},
      { accessToken: 'old-token', tokenRefresher, oauth2State: { accessToken: 'old-token' } }
    );

    expect(tokenRefresher.refreshIfNeeded).toHaveBeenCalledWith({ accessToken: 'old-token' });
    expect(mockSecurityInjector.inject).toHaveBeenCalledWith(
      mockSpec,
      expect.anything(),
      'new-token',
      expect.any(Object),
      expect.any(Object),
      undefined
    );
  });

  it('falls back to the original token when tokenRefresher returns undefined', async () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: { '/users': { get: { operationId: 'getUsers' } } },
    };
    (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true } });

    const tokenRefresher = { refreshIfNeeded: jest.fn().mockResolvedValue(undefined) };

    await service.execute(
      mockSpec,
      'getUsers',
      {},
      { accessToken: 'old-token', tokenRefresher, oauth2State: { accessToken: 'old-token' } }
    );

    expect(mockSecurityInjector.inject).toHaveBeenCalledWith(
      mockSpec,
      expect.anything(),
      'old-token',
      expect.any(Object),
      expect.any(Object),
      undefined
    );
  });

  it('does not call tokenRefresher when oauth2State is not provided', async () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: { '/users': { get: { operationId: 'getUsers' } } },
    };
    (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true } });

    const tokenRefresher = { refreshIfNeeded: jest.fn() };

    await service.execute(mockSpec, 'getUsers', {}, { accessToken: 'old-token', tokenRefresher });

    expect(tokenRefresher.refreshIfNeeded).not.toHaveBeenCalled();
    expect(mockSecurityInjector.inject).toHaveBeenCalledWith(
      mockSpec,
      expect.anything(),
      'old-token',
      expect.any(Object),
      expect.any(Object),
      undefined
    );
  });

  describe('accessTokenProvider', () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: { '/users': { get: { operationId: 'getUsers' } } },
    };

    it('uses the token returned by accessTokenProvider for security injection', async () => {
      (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true } });
      const accessTokenProvider = { getAccessToken: jest.fn().mockResolvedValue('client-credentials-token') };

      await service.execute(mockSpec, 'getUsers', {}, { accessTokenProvider });

      expect(accessTokenProvider.getAccessToken).toHaveBeenCalledTimes(1);
      expect(mockSecurityInjector.inject).toHaveBeenCalledWith(
        mockSpec,
        expect.anything(),
        'client-credentials-token',
        expect.any(Object),
        expect.any(Object),
        undefined
      );
    });

    it('takes precedence over tokenRefresher/oauth2State when both are configured', async () => {
      (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true } });
      const accessTokenProvider = { getAccessToken: jest.fn().mockResolvedValue('client-credentials-token') };
      const tokenRefresher = { refreshIfNeeded: jest.fn() };

      await service.execute(mockSpec, 'getUsers', {}, {
        accessToken: 'old-token',
        accessTokenProvider,
        tokenRefresher,
        oauth2State: { accessToken: 'old-token' },
      });

      expect(accessTokenProvider.getAccessToken).toHaveBeenCalledTimes(1);
      expect(tokenRefresher.refreshIfNeeded).not.toHaveBeenCalled();
    });

    it('propagates a rejection from accessTokenProvider instead of sending an unauthenticated request', async () => {
      (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true } });
      const accessTokenProvider = { getAccessToken: jest.fn().mockRejectedValue(new Error('token endpoint down')) };

      await expect(service.execute(mockSpec, 'getUsers', {}, { accessTokenProvider })).rejects.toThrow('token endpoint down');
      expect(axios).not.toHaveBeenCalled();
    });
  });

  describe('retry', () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: { '/users': { get: { operationId: 'getUsers' } } },
    };

    it('does not retry by default, even on a retryable status code', async () => {
      const error = { response: { status: 503, data: 'Service Unavailable' }, config: {} };
      (axios as unknown as jest.Mock).mockRejectedValue(error);

      await expect(service.execute(mockSpec, 'getUsers', {})).rejects.toThrow(/Status 503/);
      expect(axios).toHaveBeenCalledTimes(1);
    });

    it('retries a retryable status code up to maxRetries, then succeeds', async () => {
      const error = { response: { status: 503, data: 'Service Unavailable' }, config: {} };
      (axios as unknown as jest.Mock)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: { ok: true } });

      const result = await service.execute(mockSpec, 'getUsers', {}, { retry: { maxRetries: 2, retryDelayMs: 1 } });

      expect(result).toEqual({ ok: true });
      expect(axios).toHaveBeenCalledTimes(3);
    });

    it('gives up after exhausting maxRetries', async () => {
      const error = { response: { status: 503, data: 'Service Unavailable' }, config: {} };
      (axios as unknown as jest.Mock).mockRejectedValue(error);

      await expect(service.execute(mockSpec, 'getUsers', {}, { retry: { maxRetries: 2, retryDelayMs: 1 } })).rejects.toThrow(/Status 503/);
      expect(axios).toHaveBeenCalledTimes(3);
    });

    it('does not retry a non-retryable status code even with maxRetries set', async () => {
      const error = { response: { status: 400, data: 'Bad Request' }, config: {} };
      (axios as unknown as jest.Mock).mockRejectedValue(error);

      await expect(service.execute(mockSpec, 'getUsers', {}, { retry: { maxRetries: 3, retryDelayMs: 1 } })).rejects.toThrow(/Status 400/);
      expect(axios).toHaveBeenCalledTimes(1);
    });
  });

  describe('observability hooks', () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: { '/users': { get: { operationId: 'getUsers' } } },
    };

    it('calls onRequestStart then onRequestEnd with a matching requestId on success', async () => {
      (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true }, status: 200 });
      const onRequestStart = jest.fn();
      const onRequestEnd = jest.fn();

      await service.execute(mockSpec, 'getUsers', {}, { hooks: { onRequestStart, onRequestEnd } });

      expect(onRequestStart).toHaveBeenCalledWith({ requestId: expect.any(String), toolName: 'getUsers' });
      const { requestId } = onRequestStart.mock.calls[0][0];
      expect(onRequestEnd).toHaveBeenCalledWith({
        requestId,
        toolName: 'getUsers',
        durationMs: expect.any(Number),
        success: true,
        statusCode: 200,
      });
    });

    it('calls onRequestEnd with success:false and the failing statusCode', async () => {
      (axios as unknown as jest.Mock).mockRejectedValue({ response: { status: 500, data: 'boom' }, config: {} });
      const onRequestEnd = jest.fn();

      await expect(service.execute(mockSpec, 'getUsers', {}, { hooks: { onRequestEnd } })).rejects.toThrow(ToolExecutionError);

      expect(onRequestEnd).toHaveBeenCalledWith(expect.objectContaining({ success: false, statusCode: 500 }));
    });

    it('calls onRetry once per retry attempt with the same requestId as onRequestStart', async () => {
      const error = { response: { status: 503, data: 'Service Unavailable' }, config: {} };
      (axios as unknown as jest.Mock)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: { ok: true }, status: 200 });
      const onRequestStart = jest.fn();
      const onRetry = jest.fn();

      await service.execute(mockSpec, 'getUsers', {}, { retry: { maxRetries: 1, retryDelayMs: 1 }, hooks: { onRequestStart, onRetry } });

      const { requestId } = onRequestStart.mock.calls[0][0];
      expect(onRetry).toHaveBeenCalledWith({ requestId, toolName: 'getUsers', attempt: 1, statusCode: 503, delayMs: expect.any(Number) });
    });

    it('does not let a throwing hook break the tool call, and logs it instead', async () => {
      (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true }, status: 200 });
      const onRequestStart = jest.fn(() => {
        throw new Error('consumer hook bug');
      });

      const result = await service.execute(mockSpec, 'getUsers', {}, { hooks: { onRequestStart } });

      expect(result).toEqual({ ok: true });
    });

    it('gives concurrent executeMany calls to the same tool distinct requestIds', async () => {
      (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true }, status: 200 });
      const onRequestStart = jest.fn();

      await service.executeMany(
        mockSpec,
        [{ toolName: 'getUsers', args: {} }, { toolName: 'getUsers', args: {} }],
        { hooks: { onRequestStart } }
      );

      const firstCallId = onRequestStart.mock.calls[0][0].requestId;
      const secondCallId = onRequestStart.mock.calls[1][0].requestId;
      expect(firstCallId).not.toBe(secondCallId);
    });
  });

  describe('namespace', () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: { '/users': { get: { operationId: 'getUsers' } } },
    };

    it('strips a matching namespace prefix before looking up the operation', async () => {
      (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true } });

      const result = await service.execute(mockSpec, 'github__getUsers', {}, { namespace: 'github' });

      expect(result).toEqual({ ok: true });
    });

    it('fails to find the tool when no namespace option is given for a namespaced name', async () => {
      (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true } });

      await expect(service.execute(mockSpec, 'github__getUsers', {})).rejects.toThrow(/not found/);
      await expect(service.execute(mockSpec, 'github__getUsers', {})).rejects.toThrow(ToolNotFoundError);

      try {
        await service.execute(mockSpec, 'github__getUsers', {});
        fail('expected execute to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(ToolNotFoundError);
        expect((error as ToolNotFoundError).toolName).toBe('github__getUsers');
      }
    });
  });

  describe('executeMany', () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: {
        '/users': { get: { operationId: 'getUsers' } },
        '/orders': { get: { operationId: 'getOrders' } },
      },
    };

    it('runs multiple tool calls and returns results in call order', async () => {
      (axios as unknown as jest.Mock)
        .mockResolvedValueOnce({ data: { users: [] } })
        .mockResolvedValueOnce({ data: { orders: [] } });

      const outcomes = await service.executeMany(mockSpec, [
        { toolName: 'getUsers', args: {} },
        { toolName: 'getOrders', args: {} },
      ]);

      expect(outcomes).toEqual([
        { toolName: 'getUsers', status: 'fulfilled', value: { users: [] } },
        { toolName: 'getOrders', status: 'fulfilled', value: { orders: [] } },
      ]);
    });

    it('does not let one failing call affect the others, and preserves order', async () => {
      (axios as unknown as jest.Mock)
        .mockResolvedValueOnce({ data: { users: [] } })
        .mockRejectedValueOnce({ response: { status: 500, data: 'boom' }, config: {} });

      const outcomes = await service.executeMany(mockSpec, [
        { toolName: 'getUsers', args: {} },
        { toolName: 'getOrders', args: {} },
      ]);

      expect(outcomes[0]).toEqual({ toolName: 'getUsers', status: 'fulfilled', value: { users: [] } });
      expect(outcomes[1]?.toolName).toBe('getOrders');
      expect(outcomes[1]?.status).toBe('rejected');
      expect((outcomes[1] as { reason: unknown }).reason).toBeInstanceOf(ToolExecutionError);
    });

    it('rejects the whole batch outcome for an unknown tool name, without touching other calls', async () => {
      (axios as unknown as jest.Mock).mockResolvedValueOnce({ data: { users: [] } });

      const outcomes = await service.executeMany(mockSpec, [
        { toolName: 'getUsers', args: {} },
        { toolName: 'deleteEverything', args: {} },
      ]);

      expect(outcomes[0]).toEqual({ toolName: 'getUsers', status: 'fulfilled', value: { users: [] } });
      expect(outcomes[1]?.status).toBe('rejected');
      expect((outcomes[1] as { reason: unknown }).reason).toBeInstanceOf(ToolNotFoundError);
    });

    it('shares the same options across every call in the batch', async () => {
      (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true } });

      await service.executeMany(
        mockSpec,
        [{ toolName: 'getUsers', args: {} }, { toolName: 'getOrders', args: {} }],
        { accessToken: 'shared-token' }
      );

      expect(mockSecurityInjector.inject).toHaveBeenCalledTimes(2);
      expect(mockSecurityInjector.inject).toHaveBeenNthCalledWith(1, mockSpec, expect.anything(), 'shared-token', expect.any(Object), expect.any(Object), undefined);
      expect(mockSecurityInjector.inject).toHaveBeenNthCalledWith(2, mockSpec, expect.anything(), 'shared-token', expect.any(Object), expect.any(Object), undefined);
    });
  });

  describe('concurrency', () => {
    it('caps concurrent requests through this executor instance', async () => {
      const mockSpec = {
        servers: [{ url: 'https://api.example.com' }],
        paths: { '/users': { get: { operationId: 'getUsers' } } },
      };

      let active = 0;
      let maxActive = 0;
      (axios as unknown as jest.Mock).mockImplementation(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return { data: { ok: true } };
      });

      const limitedService = new DynamicToolExecutorService(
        mockSecurityInjector,
        { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        { maxConcurrency: 2 }
      );

      await Promise.all(Array.from({ length: 5 }, () => limitedService.execute(mockSpec, 'getUsers', {})));

      expect(maxActive).toBeLessThanOrEqual(2);
    });

    it('caps concurrency for executeMany too, since it runs each call through execute()', async () => {
      const mockSpec = {
        servers: [{ url: 'https://api.example.com' }],
        paths: { '/users': { get: { operationId: 'getUsers' } } },
      };

      let active = 0;
      let maxActive = 0;
      (axios as unknown as jest.Mock).mockImplementation(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return { data: { ok: true } };
      });

      const limitedService = new DynamicToolExecutorService(
        mockSecurityInjector,
        { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        { maxConcurrency: 2 }
      );

      await limitedService.executeMany(
        mockSpec,
        Array.from({ length: 5 }, () => ({ toolName: 'getUsers', args: {} }))
      );

      expect(maxActive).toBeLessThanOrEqual(2);
    });
  });
});
