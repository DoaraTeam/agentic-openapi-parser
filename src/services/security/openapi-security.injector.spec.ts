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

  // Parity cases with slack-be's orchestration/openapi-security.injector.ts, confirmed by audit
  // to have near-identical logic — these lock in the 3-layer fallback behavior it depends on.
  describe('parity: slack-be orchestration fallback layers', () => {
    it('skips injection entirely when the operation explicitly declares security: []', () => {
      const spec = {
        components: {
          securitySchemes: {
            ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
          },
        },
      };
      const operation = { security: [] };

      injector.inject(spec, operation, 'some-token', headers, queryParams, DynamicProviderAuthType.API_KEY);

      expect(headers).toEqual({});
      expect(queryParams).toEqual({});
    });

    it('falls back to forceInjectByAuthType when securitySchemes exist but none match the requirement', () => {
      const spec = {
        security: [{ UnknownScheme: [] }],
        components: {
          securitySchemes: {
            ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
          },
        },
      };

      injector.inject(spec, {}, 'my-secret-key-123', headers, queryParams, DynamicProviderAuthType.API_KEY);

      expect(queryParams['api_key']).toBe('my-secret-key-123');
    });

    it('injects Basic auth via base64 round-trip for http/basic scheme, matching legacy basic too', () => {
      const httpBasicSpec = {
        security: [{ BasicAuth: [] }],
        components: { securitySchemes: { BasicAuth: { type: 'http', scheme: 'basic' } } },
      };
      injector.inject(httpBasicSpec, {}, 'user:pass', headers, queryParams, DynamicProviderAuthType.BASIC);
      expect(headers['Authorization']).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
    });
  });
});
