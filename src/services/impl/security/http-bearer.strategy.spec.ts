import { HttpBearerStrategy } from './http-bearer.strategy';
import { DynamicProviderAuthType } from '@/types/core';

describe('HttpBearerStrategy', () => {
  let strategy: HttpBearerStrategy;
  let headers: Record<string, string>;
  let queryParams: Record<string, unknown>;

  beforeEach(() => {
    strategy = new HttpBearerStrategy();
    headers = {};
    queryParams = {};
  });

  it('supports BEARER and undefined authType', () => {
    expect(strategy.supportsAuthType(DynamicProviderAuthType.BEARER)).toBe(true);
    expect(strategy.supportsAuthType(undefined)).toBe(true);
    expect(strategy.supportsAuthType(DynamicProviderAuthType.BASIC)).toBe(false);
  });

  it('injects a Bearer Authorization header when scheme.scheme is bearer', () => {
    const injected = strategy.inject({
      scheme: { scheme: 'bearer' },
      schemeName: 'BearerAuth',
      accessToken: 'tok',
      headers,
      queryParams,
    });
    expect(injected).toBe(true);
    expect(headers['Authorization']).toBe('Bearer tok');
  });

  it('returns false when scheme.scheme is not bearer', () => {
    const injected = strategy.inject({
      scheme: { scheme: 'basic' },
      schemeName: 'BasicAuth',
      accessToken: 'tok',
      headers,
      queryParams,
    });
    expect(injected).toBe(false);
    expect(headers['Authorization']).toBeUndefined();
  });
});
