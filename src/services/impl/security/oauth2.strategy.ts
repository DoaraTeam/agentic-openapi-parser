import { DynamicProviderAuthType } from '@/types/core';
import { ISecurityStrategy, SecurityInjectionContext } from '@/services/security-strategy.interface';

export class OAuth2Strategy implements ISecurityStrategy {
  readonly schemeTypes = ['oauth2', 'openIdConnect'];

  supportsAuthType(authType?: DynamicProviderAuthType): boolean {
    return authType === DynamicProviderAuthType.OAUTH2 || authType === DynamicProviderAuthType.BEARER || !authType;
  }

  inject({ accessToken, headers }: SecurityInjectionContext): boolean {
    headers['Authorization'] = `Bearer ${accessToken}`;
    return true;
  }
}
