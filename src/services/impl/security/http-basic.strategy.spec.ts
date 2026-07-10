import { HttpBasicStrategy } from './http-basic.strategy';
import { DynamicProviderAuthType } from '@/types/core';

describe('HttpBasicStrategy', () => {
  let strategy: HttpBasicStrategy;
  let headers: Record<string, string>;
  let queryParams: Record<string, unknown>;

  beforeEach(() => {
    strategy = new HttpBasicStrategy();
    headers = {};
    queryParams = {};
  });

  it('supports BASIC and undefined authType', () => {
    expect(strategy.supportsAuthType(DynamicProviderAuthType.BASIC)).toBe(true);
    expect(strategy.supportsAuthType(undefined)).toBe(true);
    expect(strategy.supportsAuthType(DynamicProviderAuthType.BEARER)).toBe(false);
  });

  it('base64-encodes a raw token into a Basic Authorization header', () => {
    const injected = strategy.inject({
      scheme: { scheme: 'basic' },
      schemeName: 'BasicAuth',
      accessToken: 'user:pass',
      headers,
      queryParams,
    });
    expect(injected).toBe(true);
    expect(headers['Authorization']).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
  });

  it('passes an already-base64 token through unchanged', () => {
    const preEncoded = Buffer.from('user:pass').toString('base64');
    strategy.inject({
      scheme: { scheme: 'basic' },
      schemeName: 'BasicAuth',
      accessToken: preEncoded,
      headers,
      queryParams,
    });
    expect(headers['Authorization']).toBe(`Basic ${preEncoded}`);
  });

  it('returns false when scheme.scheme is not basic', () => {
    const injected = strategy.inject({
      scheme: { scheme: 'bearer' },
      schemeName: 'BearerAuth',
      accessToken: 'tok',
      headers,
      queryParams,
    });
    expect(injected).toBe(false);
  });
});
