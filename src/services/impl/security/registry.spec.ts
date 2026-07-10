import { SecurityStrategyRegistry, createDefaultSecurityStrategyRegistry } from './registry';
import { ISecurityStrategy } from '@/services/security-strategy.interface';

describe('SecurityStrategyRegistry', () => {
  it('returns registered strategies for a scheme type', () => {
    const strategyA: ISecurityStrategy = {
      schemeTypes: ['custom'],
      supportsAuthType: () => true,
      inject: () => true,
    };
    const registry = new SecurityStrategyRegistry().register(strategyA);
    expect(registry.getStrategiesFor('custom')).toEqual([strategyA]);
  });

  it('returns an empty array for an unregistered scheme type', () => {
    const registry = new SecurityStrategyRegistry();
    expect(registry.getStrategiesFor('unknown')).toEqual([]);
  });

  it('supports multiple strategies registered under the same scheme type', () => {
    const first: ISecurityStrategy = { schemeTypes: ['http'], supportsAuthType: () => true, inject: () => false };
    const second: ISecurityStrategy = { schemeTypes: ['http'], supportsAuthType: () => true, inject: () => true };
    const registry = new SecurityStrategyRegistry().register(first).register(second);
    expect(registry.getStrategiesFor('http')).toEqual([first, second]);
  });
});

describe('createDefaultSecurityStrategyRegistry', () => {
  it('registers built-in strategies for apiKey, http (bearer+basic), oauth2/openIdConnect, and basic', () => {
    const registry = createDefaultSecurityStrategyRegistry();
    expect(registry.getStrategiesFor('apiKey')).toHaveLength(1);
    expect(registry.getStrategiesFor('http')).toHaveLength(2);
    expect(registry.getStrategiesFor('oauth2')).toHaveLength(1);
    expect(registry.getStrategiesFor('openIdConnect')).toHaveLength(1);
    expect(registry.getStrategiesFor('basic')).toHaveLength(1);
  });
});
