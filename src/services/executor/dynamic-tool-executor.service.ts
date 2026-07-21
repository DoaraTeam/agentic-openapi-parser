import { randomUUID } from 'crypto';
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ExecuteToolOptions, ILogger, ObservabilityHooks, ResponseProcessor, RetryOptions, ToolCallRequest, ToolCallOutcome } from '@/types';
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

    const signal = options?.signal;
    if (signal?.aborted) {
      throw this.abortError();
    }

    const reqConfig: AxiosRequestConfig = {
        method: method as AxiosRequestConfig['method'],
        url: requestUrl,
        params: queryParams,
        data: requestBody,
        headers,
        timeout: options?.timeout || 15000,
        signal,
    };

    const requestId = randomUUID();
    const hooks = options?.hooks;
    const startedAt = Date.now();
    this.invokeHook(hooks?.onRequestStart, { requestId, toolName });

    let response: AxiosResponse;
    try {
      const send = () => this.sendWithRetry(reqConfig, toolName, options?.retry, requestId, hooks, signal);
      response = this.concurrencyLimiter ? await this.concurrencyLimiter.run(send) : await send();
    } catch (error: unknown) {
      this.invokeHook(hooks?.onRequestEnd, {
        requestId,
        toolName,
        durationMs: Date.now() - startedAt,
        success: false,
        statusCode: (error as AxiosError).response?.status,
      });
      // Caller cancelled (e.g. user-initiated "Stop") — this was never a real
      // API failure, so it has no status/response to format meaningfully.
      // Re-throw as-is instead of going through handleExecutionError(), which
      // would otherwise report a misleading "Status undefined" API error.
      if (this.isCancellation(error, signal)) throw error;
      this.handleExecutionError(error);
    }

    this.invokeHook(hooks?.onRequestEnd, {
      requestId,
      toolName,
      durationMs: Date.now() - startedAt,
      success: true,
      statusCode: response.status,
    });

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

  private async sendWithRetry(
    reqConfig: AxiosRequestConfig,
    toolName: string,
    retryOptions: RetryOptions | undefined,
    requestId: string,
    hooks: ObservabilityHooks | undefined,
    signal?: AbortSignal
  ): Promise<AxiosResponse> {
    const policy = new RetryPolicy(retryOptions);
    let attempt = 0;

    for (;;) {
      try {
        return await axios(reqConfig);
      } catch (error: unknown) {
        // Cancelled by the caller — not a retryable failure. Without this
        // check, an aborted request (no HTTP response) looks identical to a
        // network error to RetryPolicy, which retries network errors by
        // default — meaning an intentional "Stop" would silently keep firing
        // more requests instead of actually stopping.
        if (this.isCancellation(error, signal)) throw error;

        const axiosError = error as AxiosError;
        const statusCode = axiosError.response?.status;
        if (!policy.shouldRetry(attempt, statusCode)) throw error;

        const retryAfterHeader = axiosError.response?.headers?.['retry-after'];
        const delayMs = policy.delayFor(attempt, retryAfterHeader !== undefined ? String(retryAfterHeader) : undefined);
        this.logger.warn(`Tool "${toolName}" attempt ${attempt + 1} failed (status ${statusCode ?? 'network error'}), retrying in ${Math.round(delayMs)}ms`);
        this.invokeHook(hooks?.onRetry, { requestId, toolName, attempt: attempt + 1, statusCode, delayMs });
        await this.sleep(delayMs, signal);
        attempt++;
      }
    }
  }

  /** Rejects immediately if `signal` fires while sleeping, instead of waiting out the full backoff — so a caller-initiated cancellation between two retry attempts takes effect right away. */
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(this.abortError());
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(this.abortError());
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** True when `error` (or the signal itself) reflects a caller-initiated cancellation rather than a genuine request failure — covers both an aborted axios request and a rejection from this class's own `sleep()`. */
  private isCancellation(error: unknown, signal?: AbortSignal): boolean {
    if (signal?.aborted) return true;
    if (axios.isCancel(error)) return true;
    return (error as { code?: string } | undefined)?.code === 'ERR_CANCELED';
  }

  private abortError(): Error {
    return new DOMException('The tool call was aborted', 'AbortError');
  }

  /** Runs a caller-supplied observability hook without letting it fail or block the tool call — a
   *  throwing hook is logged and ignored, since it's a side channel, not part of the request. */
  private invokeHook<TInfo>(hook: ((info: TInfo) => void) | undefined, info: TInfo): void {
    if (!hook) return;
    try {
      hook(info);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Observability hook threw and was ignored: ${message}`);
    }
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
