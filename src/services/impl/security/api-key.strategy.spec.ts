import { ApiKeyStrategy } from './api-key.strategy';
import { DynamicProviderAuthType } from '@/types/core';

describe('ApiKeyStrategy', () => {
  let strategy: ApiKeyStrategy;
  let headers: Record<string, string>;
  let queryParams: Record<string, unknown>;

  beforeEach(() => {
    strategy = new ApiKeyStrategy();
    headers = {};
    queryParams = {};
  });

  describe('supportsAuthType', () => {
    it('supports API_KEY and undefined authType', () => {
      expect(strategy.supportsAuthType(DynamicProviderAuthType.API_KEY)).toBe(true);
      expect(strategy.supportsAuthType(undefined)).toBe(true);
    });

    it('rejects other explicit authTypes', () => {
      expect(strategy.supportsAuthType(DynamicProviderAuthType.BEARER)).toBe(false);
    });
  });

  describe('inject', () => {
    it('auto-prepends Bearer for JWT-looking tokens on an Authorization header scheme', () => {
      const token = 'eyJhbGciOiJIUzI1NiJ9.abc.def';
      const injected = strategy.inject({
        scheme: { in: 'header', name: 'Authorization' },
        schemeName: 'ApiKeyAuth',
        accessToken: token,
        headers,
        queryParams,
      });
      expect(injected).toBe(true);
      expect(headers['Authorization']).toBe(`Bearer ${token}`);
    });

    it('passes the raw token through for a non-Authorization header name', () => {
      const injected = strategy.inject({
        scheme: { in: 'header', name: 'x-api-key' },
        schemeName: 'ApiKeyAuth',
        accessToken: 'my-secret-key',
        headers,
        queryParams,
      });
      expect(injected).toBe(true);
      expect(headers['x-api-key']).toBe('my-secret-key');
    });

    it('writes to queryParams when scheme.in is query', () => {
      const injected = strategy.inject({
        scheme: { in: 'query', name: 'api_key' },
        schemeName: 'ApiKeyAuth',
        accessToken: 'my-secret-key',
        headers,
        queryParams,
      });
      expect(injected).toBe(true);
      expect(queryParams['api_key']).toBe('my-secret-key');
    });

    it('returns false when scheme.in is neither header nor query', () => {
      const injected = strategy.inject({
        scheme: { in: 'cookie', name: 'session' },
        schemeName: 'ApiKeyAuth',
        accessToken: 'tok',
        headers,
        queryParams,
      });
      expect(injected).toBe(false);
    });
  });
});
