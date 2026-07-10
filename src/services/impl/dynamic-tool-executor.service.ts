import axios, { AxiosRequestConfig } from 'axios';
import { ExecuteToolOptions } from '@/types';
import type { IDynamicToolExecutorService } from '@/services/dynamic-tool-executor.interface';
import type { IOpenApiSecurityInjector } from '@/services/openapi-security-injector.interface';
import { ILogger } from '@/types/logger';
import { DEFAULT_LOGGER } from '@/utils/logger';

export class DynamicToolExecutorService implements IDynamicToolExecutorService {
  constructor(
    private readonly securityInjector: IOpenApiSecurityInjector,
    private readonly logger: ILogger = DEFAULT_LOGGER
  ) {}

  async execute(
    spec: Record<string, unknown>,
    toolName: string,
    args: Record<string, unknown>,
    options?: ExecuteToolOptions
  ): Promise<unknown> {
    this.logger.log(`Executing dynamic tool "${toolName}"`);
    
    const operationInfo = this.findOperationByToolName(spec, toolName);
    
    if (!operationInfo) {
      throw new Error(`Tool "${toolName}" not found in the provided OpenAPI spec.`);
    }

    const { path, method, operation } = operationInfo;
    
    const baseUrl = this.getBaseUrl(spec);
    const { requestUrl, queryParams, headers } = this.buildRequestParams(baseUrl, path, operation, args);

    const requestBody = args.requestBody;

    if (options?.accessToken) {
      this.securityInjector.inject(spec, operation, options.accessToken, headers, queryParams, options.authType);
    }

    this.logger.debug?.(`[${method.toUpperCase()}] Requesting: ${requestUrl}`);
    
    const reqConfig: AxiosRequestConfig = {
        method: method as AxiosRequestConfig['method'],
        url: requestUrl,
        params: queryParams,
        data: requestBody,
        headers,
        timeout: options?.timeout || 15000,
    };

    try {
      const response = await axios(reqConfig);
      return response.data;
    } catch (error: unknown) {
      this.handleExecutionError(error);
    }
  }

  private getBaseUrl(spec: Record<string, unknown>): string {
    const servers = spec.servers as Array<{url: string}> | undefined;
    const firstServer = servers?.[0];
    if (firstServer?.url) {
       let baseUrl = firstServer.url;
       if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
       return baseUrl;
    } else if (spec.host) {
       const schemes = spec.schemes as string[] | undefined;
       const scheme = schemes?.[0] || 'https';
       return `${scheme}://${spec.host}${spec.basePath || ''}`;
    }
    return '';
  }

  private buildRequestParams(
    baseUrl: string, 
    path: string, 
    operation: Record<string, unknown>, 
    args: Record<string, unknown>
  ) {
    let requestUrl = `${baseUrl}${path}`;
    const queryParams: Record<string, unknown> = {};
    const headers: Record<string, string> = {
       'Content-Type': 'application/json',
    };
    
    const parameters = operation.parameters as Array<Record<string, unknown>> | undefined;
    if (parameters && Array.isArray(parameters)) {
      for (const p of parameters) {
        const pName = String(p.name);
        const val = args[pName];
        if (val !== undefined && val !== null) {
          if (p.in === 'path') {
             requestUrl = requestUrl.replace(`{${pName}}`, String(val));
          } else if (p.in === 'query') {
             queryParams[pName] = val;
          } else if (p.in === 'header') {
             headers[pName] = String(val);
          }
        }
      }
    }
    return { requestUrl, queryParams, headers };
  }

  private handleExecutionError(error: unknown): never {
    const axiosError = error as any;
    const status = axiosError.response?.status;
    const data = axiosError.response?.data;
    const reqConfig = axiosError.config;
    
    let safeHeaders: Record<string, string> = { ...reqConfig?.headers };
    if (safeHeaders['Authorization']) {
      const authVal = String(safeHeaders['Authorization']);
      if (authVal.toLowerCase().startsWith('bearer ')) {
        safeHeaders['Authorization'] = 'Bearer ***';
      } else if (authVal.toLowerCase().startsWith('basic ')) {
        safeHeaders['Authorization'] = 'Basic ***';
      } else {
        safeHeaders['Authorization'] = '*** (No Prefix / Raw Token)';
      }
    }
    
    let safeParams: Record<string, unknown> = { ...reqConfig?.params };
    if (safeParams['api_key']) safeParams['api_key'] = '***';

    const debugInfo = {
      url: reqConfig?.url,
      params: safeParams,
      headers: safeHeaders,
    };
    
    const errorText = `API Request Failed: Status ${status}: ${
      typeof data === 'object' ? JSON.stringify(data) : data
    }\nRequest Sent: ${JSON.stringify(debugInfo)}`;
    
    this.logger.error(errorText);
    throw new Error(errorText);
  }

  private findOperationByToolName(spec: Record<string, unknown>, targetToolName: string) {
     const paths = (spec.paths as Record<string, unknown>) || {};
     const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];
     
     for (const [path, pathItem] of Object.entries(paths)) {
        if (!pathItem) continue;
        for (const method of methods) {
           const operation = (pathItem as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
           if (!operation) continue;
           
           const rawName = (operation.operationId as string) || `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
           const generatedName = rawName
             .replace(/[^a-zA-Z0-9_-]/g, '_')
             .replace(/_+/g, '_')
             .substring(0, 64)
             .replace(/^_+|_+$/g, '') || 'unknown_tool';
             
           if (generatedName === targetToolName) {
              return { path, method, operation };
           }
        }
     }
     return null;
  }
}
