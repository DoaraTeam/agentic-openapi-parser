import { DynamicProviderAuthType } from '@/types/core';

export interface SecurityInjectionContext {
  scheme: Record<string, unknown>;
  schemeName: string;
  accessToken: string;
  headers: Record<string, string>;
  queryParams: Record<string, unknown>;
  authType?: DynamicProviderAuthType;
}

export interface ISecurityStrategy {
  /** securityScheme "type" values this strategy handles, e.g. ['apiKey'] or ['oauth2', 'openIdConnect']. */
  readonly schemeTypes: string[];
  /** Gate mirroring the authType compatibility check for this scheme/sub-scheme. */
  supportsAuthType(authType?: DynamicProviderAuthType): boolean;
  /** Attempts injection; returns true iff it wrote to headers/queryParams. */
  inject(ctx: SecurityInjectionContext): boolean;
}
