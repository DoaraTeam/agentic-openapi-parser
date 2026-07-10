import { DynamicProviderAuthType } from '@/types';
import type { ISecurityStrategy, SecurityInjectionContext } from '@/services';
import { encodeBasicAuthHeader } from './basic-auth.util';

export class HttpBasicStrategy implements ISecurityStrategy {
  readonly schemeTypes = ['http'];

  supportsAuthType(authType?: DynamicProviderAuthType): boolean {
    return authType === DynamicProviderAuthType.BASIC || !authType;
  }

  inject({ scheme, accessToken, headers }: SecurityInjectionContext): boolean {
    if (String(scheme.scheme).toLowerCase() !== 'basic') return false;
    headers['Authorization'] = encodeBasicAuthHeader(accessToken);
    return true;
  }
}
