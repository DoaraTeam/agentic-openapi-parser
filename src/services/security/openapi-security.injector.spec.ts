import { OpenApiSecurityInjector } from './openapi-security.injector';
import { DynamicProviderAuthType } from '@/types';

describe('OpenApiSecurityInjector', () => {
  let headers: Record<string, string>;
  let queryParams: Record<string, any>;
  let injector: OpenApiSecurityInjector;

  beforeEach(() => {
    headers = {};
    queryParams = {};
    injector = new OpenApiSecurityInjector({
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    });
  });

  it('should inject Bearer token automatically for JWT when scheme is apiKey and header is Authorization', () => {
    const spec = {
      security: [{ ApiKeyAuth: [] }],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization',
          },
        },
      },
    };

    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

    injector.inject(spec, {}, token, headers, queryParams, DynamicProviderAuthType.API_KEY);

    expect(headers['Authorization']).toBe(`Bearer ${token}`);
  });

  it('should inject raw token when scheme is apiKey but header is NOT Authorization', () => {
    const spec = {
      security: [{ ApiKeyAuth: [] }],
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
          },
        },
      },
    };

    const token = 'my-secret-key-123';

    injector.inject(spec, {}, token, headers, queryParams, DynamicProviderAuthType.API_KEY);

    expect(headers['x-api-key']).toBe(token);
  });

  it('should fallback to user authType when spec has NO security defined', () => {
    const spec = {};
    const token = 'my-secret-key-123';

    injector.inject(spec, {}, token, headers, queryParams, DynamicProviderAuthType.API_KEY);

    expect(queryParams['api_key']).toBe(token);
  });
});
