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
});
