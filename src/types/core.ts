export enum DynamicProviderAuthType {
  NONE = 'NONE',
  API_KEY = 'API_KEY',
  BEARER = 'BEARER',
  OAUTH2 = 'OAUTH2',
  BASIC = 'BASIC',
}

export interface DynamicToolDefinition {
  name: string;
  description: string;
  method: string;
  url: string;
  parameters: Record<string, unknown>[];
  security?: Record<string, unknown>[];
  providerId?: string;
}

export interface ExecuteToolOptions {
  authType?: DynamicProviderAuthType;
  accessToken?: string;
  timeout?: number;
}

export interface IAiAdapter<TTool = unknown, TReturnType = TTool[]> {
  getTools(): TReturnType;
}
