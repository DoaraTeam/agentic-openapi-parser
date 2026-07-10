import type { ISecurityStrategy } from '@/services';
import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { HttpBearerStrategy } from './strategies/http-bearer.strategy';
import { HttpBasicStrategy } from './strategies/http-basic.strategy';
import { OAuth2Strategy } from './strategies/oauth2.strategy';
import { LegacyBasicStrategy } from './strategies/legacy-basic.strategy';

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
