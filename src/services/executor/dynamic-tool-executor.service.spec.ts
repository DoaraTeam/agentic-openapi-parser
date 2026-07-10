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
});
