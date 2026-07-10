import type { ISecurityStrategy } from '@/services';
import { ApiKeyStrategy } from './api-key.strategy';
import { HttpBearerStrategy } from './http-bearer.strategy';
import { HttpBasicStrategy } from './http-basic.strategy';
import { OAuth2Strategy } from './oauth2.strategy';
import { LegacyBasicStrategy } from './legacy-basic.strategy';

export class SecurityStrategyRegistry {
  private strategies = new Map<string, ISecurityStrategy[]>();

  register(strategy: ISecurityStrategy): this {
    for (const schemeType of strategy.schemeTypes) {
      const list = this.strategies.get(schemeType) ?? [];
      list.push(strategy);
      this.strategies.set(schemeType, list);
    }
    return this;
  }

  getStrategiesFor(schemeType: string): ISecurityStrategy[] {
    return this.strategies.get(schemeType) ?? [];
  }
}

export function createDefaultSecurityStrategyRegistry(): SecurityStrategyRegistry {
  return new SecurityStrategyRegistry()
    .register(new ApiKeyStrategy())
    .register(new HttpBearerStrategy())
    .register(new HttpBasicStrategy())
    .register(new OAuth2Strategy())
    .register(new LegacyBasicStrategy());
}
