import { DynamicToolExecutorService } from './dynamic-tool-executor.service';
import type { IOpenApiSecurityInjector } from '@/services';
import axios from 'axios';

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

  it('should handle execution errors and throw a masked error', async () => {
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

  it('propagates a responseProcessor failure as its own error, not as a masked "API Request Failed"', async () => {
    const mockSpec = {
      servers: [{ url: 'https://api.example.com' }],
      paths: { '/users': { get: { operationId: 'getUsers' } } },
    };
    (axios as unknown as jest.Mock).mockResolvedValue({ data: { ok: true } });

    const throwingProcessor = {
      process: jest.fn(() => {
        throw new Error('Invalid JMESPath expression');
      }),
    };

    await expect(
      service.execute(mockSpec, 'getUsers', {}, { responseProcessors: [throwingProcessor] })
    ).rejects.toThrow('Invalid JMESPath expression');
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
  });
});
