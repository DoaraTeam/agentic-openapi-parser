import { DynamicProviderAuthType } from '@/types';

export const OPENAPI_SECURITY_INJECTOR = Symbol('OPENAPI_SECURITY_INJECTOR');

export interface IOpenApiSecurityInjector {
  inject(
    spec: Record<string, unknown>,
    operation: Record<string, unknown>,
    accessToken: string,
    headers: Record<string, string>,
    queryParams: Record<string, unknown>,
    authType?: DynamicProviderAuthType
  ): void;
}
