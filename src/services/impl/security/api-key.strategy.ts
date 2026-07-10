import { DynamicProviderAuthType } from '@/types/core';
import { ISecurityStrategy, SecurityInjectionContext } from '@/services/security-strategy.interface';

export class ApiKeyStrategy implements ISecurityStrategy {
  readonly schemeTypes = ['apiKey'];

  supportsAuthType(authType?: DynamicProviderAuthType): boolean {
    return authType === DynamicProviderAuthType.API_KEY || !authType;
  }

  inject({ scheme, accessToken, headers, queryParams }: SecurityInjectionContext): boolean {
    if (scheme.in === 'header') {
      let finalToken = accessToken;
      if (
        String(scheme.name).toLowerCase() === 'authorization' &&
        !accessToken.toLowerCase().startsWith('bearer ') &&
        !accessToken.toLowerCase().startsWith('basic ')
      ) {
        if (accessToken.startsWith('eyJ') || String(scheme['x-bearer-format']).toLowerCase() === 'bearer') {
          finalToken = `Bearer ${accessToken}`;
        }
      }
      headers[String(scheme.name)] = finalToken;
      return true;
    }
    if (scheme.in === 'query') {
      queryParams[String(scheme.name)] = accessToken;
      return true;
    }
    return false;
  }
}
