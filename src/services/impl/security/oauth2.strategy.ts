import { DynamicProviderAuthType } from '@/types';
import type { ISecurityStrategy, SecurityInjectionContext } from '@/services';

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
