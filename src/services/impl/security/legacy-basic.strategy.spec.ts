import { LegacyBasicStrategy } from './legacy-basic.strategy';
import { DynamicProviderAuthType } from '@/types/core';

describe('LegacyBasicStrategy', () => {
  let strategy: LegacyBasicStrategy;
  let headers: Record<string, string>;
  let queryParams: Record<string, unknown>;

  beforeEach(() => {
    strategy = new LegacyBasicStrategy();
    headers = {};
    queryParams = {};
  });

  it('supports BASIC and undefined authType', () => {
    expect(strategy.supportsAuthType(DynamicProviderAuthType.BASIC)).toBe(true);
    expect(strategy.supportsAuthType(undefined)).toBe(true);
    expect(strategy.supportsAuthType(DynamicProviderAuthType.BEARER)).toBe(false);
  });

  it('always injects a Basic Authorization header regardless of scheme contents', () => {
    const injected = strategy.inject({
      scheme: {},
      schemeName: 'LegacyBasic',
      accessToken: 'user:pass',
      headers,
      queryParams,
    });
    expect(injected).toBe(true);
    expect(headers['Authorization']).toBe(`Basic ${Buffer.from('user:pass').toString('base64')}`);
  });
});
