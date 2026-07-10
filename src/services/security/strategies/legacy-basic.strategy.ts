import { DynamicProviderAuthType } from '@/types';
import type { ISecurityStrategy, SecurityInjectionContext } from '@/services';
import { encodeBasicAuthHeader } from '../basic-auth.util';

/** Handles Swagger 2's bare `type: 'basic'` scheme (as opposed to OpenAPI 3's `type: 'http', scheme: 'basic'`). */
export class LegacyBasicStrategy implements ISecurityStrategy {
  readonly schemeTypes = ['basic'];

  supportsAuthType(authType?: DynamicProviderAuthType): boolean {
    return authType === DynamicProviderAuthType.BASIC || !authType;
  }

  inject({ accessToken, headers }: SecurityInjectionContext): boolean {
    headers['Authorization'] = encodeBasicAuthHeader(accessToken);
    return true;
  }
}
