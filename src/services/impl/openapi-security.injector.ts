import { DynamicProviderAuthType, ILogger } from '@/types';
import type { IOpenApiSecurityInjector } from '@/services';
import { DEFAULT_LOGGER } from '@/utils';
import { SecurityStrategyRegistry, createDefaultSecurityStrategyRegistry, encodeBasicAuthHeader } from './security';

export class OpenApiSecurityInjector implements IOpenApiSecurityInjector {
  constructor(
    private readonly logger: ILogger = DEFAULT_LOGGER,
    private readonly registry: SecurityStrategyRegistry = createDefaultSecurityStrategyRegistry()
  ) {}

  inject(
    spec: Record<string, unknown>,
    operation: Record<string, unknown>,
    accessToken: string,
    headers: Record<string, string>,
    queryParams: Record<string, unknown>,
    authType?: DynamicProviderAuthType
  ): void {
    if (!accessToken) return;
    accessToken = accessToken.trim();

    const activeSecurities = (operation.security || spec.security) as Record<string, unknown>[] | undefined;
    
    if (activeSecurities && activeSecurities.length === 0) {
       this.logger.debug?.('Endpoint explicitly disables security. Skipping injection.');
       return;
    }

    const components = spec.components as Record<string, unknown> | undefined;
    const securitySchemes = (components?.securitySchemes || spec.securityDefinitions || {}) as Record<string, unknown>;

    if (Object.keys(securitySchemes).length === 0) {
       this.logger.debug?.('No securitySchemes found in spec. Forcing auth by user selection.');
       this.forceInjectByAuthType(accessToken, headers, queryParams, authType);
       return;
    }

    let injected = false;
    const securitiesToCheck = activeSecurities || [{}];
    
    for (const secRequirement of securitiesToCheck) {
      const schemeNames = Object.keys(secRequirement);
      const namesToCheck = schemeNames.length > 0 ? schemeNames : Object.keys(securitySchemes);

      for (const schemeName of namesToCheck) {
        const scheme = securitySchemes[schemeName] as Record<string, unknown> | undefined;
        if (!scheme) continue;

        const candidates = this.registry.getStrategiesFor(String(scheme.type));
        for (const strategy of candidates) {
          if (!strategy.supportsAuthType(authType)) continue;
          if (strategy.inject({ scheme, schemeName, accessToken, headers, queryParams, authType })) {
            injected = true;
            this.logger.debug?.(`Successfully injected API Key using scheme: ${schemeName} (Type: ${scheme.type})`);
            break;
          }
        }

        if (injected) break;
      }

      if (injected) break;
    }

    if (!injected) {
       this.logger.warn('Could not match any security scheme. Forcing auth by user selection.');
       this.forceInjectByAuthType(accessToken, headers, queryParams, authType);
    }
  }

  private forceInjectByAuthType(
    accessToken: string,
    headers: Record<string, string>,
    queryParams: Record<string, unknown>,
    authType?: DynamicProviderAuthType
  ): void {
    if (authType === DynamicProviderAuthType.NONE) return;

    if (authType === DynamicProviderAuthType.API_KEY) {
      queryParams['api_key'] = accessToken;
    } else if (authType === DynamicProviderAuthType.BASIC) {
      headers['Authorization'] = encodeBasicAuthHeader(accessToken);
    } else {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
  }
}
