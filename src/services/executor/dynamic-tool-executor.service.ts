import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ExecuteToolOptions, ILogger, ResponseProcessor, RetryOptions, ToolCallRequest, ToolCallOutcome } from '@/types';
import type { IDynamicToolExecutorService, IOpenApiSecurityInjector } from '@/services';
import { ConcurrencyLimiter, DEFAULT_LOGGER, findOperationByToolName, stripNamespace } from '@/utils';
import { ResponseProcessingError, ToolExecutionError, ToolNotFoundError } from '@/errors';
import { RetryPolicy } from './retry-policy';

export interface DynamicToolExecutorServiceOptions {
  /** Caps how many requests this executor instance sends concurrently; extra calls queue. Unset = unlimited. */
  maxConcurrency?: number;
}

export class DynamicToolExecutorService implements IDynamicToolExecutorService {
  private readonly concurrencyLimiter?: ConcurrencyLimiter;

  constructor(
    private readonly securityInjector: IOpenApiSecurityInjector,
    private readonly logger: ILogger = DEFAULT_LOGGER,
    executorOptions?: DynamicToolExecutorServiceOptions
  ) {
    if (executorOptions?.maxConcurrency) {
      this.concurrencyLimiter = new ConcurrencyLimiter(executorOptions.maxConcurrency);
    }
  }

  async execute(
    spec: Record<string, unknown>,
    toolName: string,
    args: Record<string, unknown>,
    options?: ExecuteToolOptions
  ): Promise<unknown> {
    this.logger.log(`Executing dynamic tool "${toolName}"`);

    const unnamespacedName = stripNamespace(toolName, options?.namespace);
    const operationInfo = findOperationByToolName(spec, unnamespacedName);

    if (!operationInfo) {
      throw new ToolNotFoundError(toolName);
    }

    const { path, method, operation } = operationInfo;
    
    const baseUrl = this.getBaseUrl(spec);
    const { requestUrl, queryParams, headers } = this.buildRequestParams(baseUrl, path, operation, args);

    const requestBody = args.requestBody;

    let accessToken = options?.accessToken;
    if (options?.accessTokenProvider) {
      accessToken = await options.accessTokenProvider.getAccessToken();
    } else if (accessToken && options?.tokenRefresher && options?.oauth2State) {
      const refreshed = await options.tokenRefresher.refreshIfNeeded(options.oauth2State);
      if (refreshed) accessToken = refreshed.accessToken;
    }

    if (accessToken) {
      this.securityInjector.inject(spec, operation, accessToken, headers, queryParams, options?.authType);
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

    let response: AxiosResponse;
    try {
      const send = () => this.sendWithRetry(reqConfig, toolName, options?.retry);
      response = this.concurrencyLimiter ? await this.concurrencyLimiter.run(send) : await send();
    } catch (error: unknown) {
      this.handleExecutionError(error);
    }

    // Deliberately outside the try/catch above: a ResponseProcessor failure (e.g. a malformed
    // JMESPath expression) is a caller configuration bug, not a failed HTTP request, and must not
    // be reported through handleExecutionError's Axios-error-shaped formatting.
    return this.applyResponseProcessors(response.data, options?.responseProcessors);
  }

  async executeMany(
    spec: Record<string, unknown>,
    calls: ToolCallRequest[],
    options?: ExecuteToolOptions
  ): Promise<ToolCallOutcome[]> {
    const settled = await Promise.allSettled(calls.map((call) => this.execute(spec, call.toolName, call.args, options)));

    return settled.map((outcome, index) => {
      const toolName = calls[index]!.toolName;
      return outcome.status === 'fulfilled'
        ? { toolName, status: 'fulfilled', value: outcome.value }
        : { toolName, status: 'rejected', reason: outcome.reason };
    });
  }

  private async sendWithRetry(reqConfig: AxiosRequestConfig, toolName: string, retryOptions?: RetryOptions): Promise<AxiosResponse> {
    const policy = new RetryPolicy(retryOptions);
    let attempt = 0;

    for (;;) {
      try {
        return await axios(reqConfig);
      } catch (error: unknown) {
        const statusCode = (error as AxiosError).response?.status;
        if (!policy.shouldRetry(attempt, statusCode)) throw error;

        const delayMs = policy.delayFor(attempt);
        this.logger.warn(`Tool "${toolName}" attempt ${attempt + 1} failed (status ${statusCode ?? 'network error'}), retrying in ${Math.round(delayMs)}ms`);
        await this.sleep(delayMs);
        attempt++;
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private applyResponseProcessors(data: unknown, processors?: ResponseProcessor[]): unknown {
    if (!processors || processors.length === 0) return data;
    return processors.reduce((acc, processor) => {
      try {
        return processor.process(acc);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new ResponseProcessingError(processor.constructor.name, message, { cause: error });
      }
    }, data);
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
    
    const safeHeaders: Record<string, string> = { ...reqConfig?.headers };
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
    
    const safeParams: Record<string, unknown> = { ...reqConfig?.params };
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
    throw new ToolExecutionError(errorText, status, data, { cause: error });
  }
}
