import { DynamicProviderAuthType } from '@/types/core';
import { ISecurityStrategy, SecurityInjectionContext } from '@/services/security-strategy.interface';

export class HttpBearerStrategy implements ISecurityStrategy {
  readonly schemeTypes = ['http'];

  supportsAuthType(authType?: DynamicProviderAuthType): boolean {
    return authType === DynamicProviderAuthType.BEARER || !authType;
  }

  inject({ scheme, accessToken, headers }: SecurityInjectionContext): boolean {
    if (String(scheme.scheme).toLowerCase() !== 'bearer') return false;
    headers['Authorization'] = `Bearer ${accessToken}`;
    return true;
  }
}
