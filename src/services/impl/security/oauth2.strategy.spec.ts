import { OAuth2Strategy } from './oauth2.strategy';
import { DynamicProviderAuthType } from '@/types/core';

describe('OAuth2Strategy', () => {
  let strategy: OAuth2Strategy;
  let headers: Record<string, string>;
  let queryParams: Record<string, unknown>;

  beforeEach(() => {
    strategy = new OAuth2Strategy();
    headers = {};
    queryParams = {};
  });

  it('supports OAUTH2, BEARER, and undefined authType', () => {
    expect(strategy.supportsAuthType(DynamicProviderAuthType.OAUTH2)).toBe(true);
    expect(strategy.supportsAuthType(DynamicProviderAuthType.BEARER)).toBe(true);
    expect(strategy.supportsAuthType(undefined)).toBe(true);
    expect(strategy.supportsAuthType(DynamicProviderAuthType.BASIC)).toBe(false);
  });

  it('always injects the token as a Bearer Authorization header', () => {
    const injected = strategy.inject({
      scheme: { type: 'oauth2' },
      schemeName: 'OAuth2',
      accessToken: 'access-token',
      headers,
      queryParams,
    });
    expect(injected).toBe(true);
    expect(headers['Authorization']).toBe('Bearer access-token');
  });
});
