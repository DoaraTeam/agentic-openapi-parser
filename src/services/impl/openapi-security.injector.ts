import { DynamicProviderAuthType } from '@/types';
import { IOpenApiSecurityInjector } from '@/services/openapi-security-injector.interface';
import { ILogger } from '@/types/logger';
import { DEFAULT_LOGGER } from '@/utils/logger';

export class OpenApiSecurityInjector implements IOpenApiSecurityInjector {
  constructor(private readonly logger: ILogger = DEFAULT_LOGGER) {}

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

        if (scheme.type === 'apiKey' && (authType === DynamicProviderAuthType.API_KEY || !authType)) {
          if (scheme.in === 'header') {
            let finalToken = accessToken;
            if (String(scheme.name).toLowerCase() === 'authorization' && !accessToken.toLowerCase().startsWith('bearer ') && !accessToken.toLowerCase().startsWith('basic ')) {
              if (accessToken.startsWith('eyJ') || String(scheme['x-bearer-format']).toLowerCase() === 'bearer') {
                finalToken = `Bearer ${accessToken}`;
              }
            }
            headers[String(scheme.name)] = finalToken;
            injected = true;
          } else if (scheme.in === 'query') {
            queryParams[String(scheme.name)] = accessToken;
            injected = true;
          }
        } 
        else if (scheme.type === 'http' && (authType === DynamicProviderAuthType.BEARER || authType === DynamicProviderAuthType.BASIC || !authType)) {
          if (String(scheme.scheme).toLowerCase() === 'bearer' && (authType === DynamicProviderAuthType.BEARER || !authType)) {
            headers['Authorization'] = `Bearer ${accessToken}`;
            injected = true;
          } else if (String(scheme.scheme).toLowerCase() === 'basic' && (authType === DynamicProviderAuthType.BASIC || !authType)) {
            const isBase64 = Buffer.from(accessToken, 'base64').toString('base64') === accessToken;
            const encoded = isBase64 ? accessToken : Buffer.from(accessToken).toString('base64');
            headers['Authorization'] = `Basic ${encoded}`;
            injected = true;
          }
        }
        else if ((scheme.type === 'oauth2' || scheme.type === 'openIdConnect') && (authType === DynamicProviderAuthType.OAUTH2 || authType === DynamicProviderAuthType.BEARER || !authType)) {
          headers['Authorization'] = `Bearer ${accessToken}`;
          injected = true;
        }
        else if (scheme.type === 'basic' && (authType === DynamicProviderAuthType.BASIC || !authType)) {
          const isBase64 = Buffer.from(accessToken, 'base64').toString('base64') === accessToken;
          const encoded = isBase64 ? accessToken : Buffer.from(accessToken).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
          injected = true;
        }

        if (injected) {
          this.logger.debug?.(`Successfully injected API Key using scheme: ${schemeName} (Type: ${scheme.type})`);
          break;
        }
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
      const isBase64 = Buffer.from(accessToken, 'base64').toString('base64') === accessToken;
      const encoded = isBase64 ? accessToken : Buffer.from(accessToken).toString('base64');
      headers['Authorization'] = `Basic ${encoded}`;
    } else {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
  }
}
