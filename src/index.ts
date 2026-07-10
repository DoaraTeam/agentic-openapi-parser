import {
  OpenApiParserService,
  OpenApiSecurityInjector,
  DynamicToolExecutorService,
  IOpenApiParserService,
  IOpenApiSecurityInjector,
  IDynamicToolExecutorService,
} from '@/services';
import { ILogger, DynamicToolDefinition, ExecuteToolOptions } from '@/types';
import { DEFAULT_LOGGER } from '@/utils';

export interface DynamicOpenApiAgentOverrides {
  parser?: IOpenApiParserService;
  securityInjector?: IOpenApiSecurityInjector;
  executor?: IDynamicToolExecutorService;
}

/**
 * Main entry point for the Dynamic OpenAPI Agent.
 * This facade unifies the parser, security injector, and executor services
 * for vanilla TypeScript/JavaScript usage.
 */
export class DynamicOpenApiAgent {
  private parser: IOpenApiParserService;
  private securityInjector: IOpenApiSecurityInjector;
  private executor: IDynamicToolExecutorService;

  constructor(logger: ILogger = DEFAULT_LOGGER, overrides: DynamicOpenApiAgentOverrides = {}) {
    this.securityInjector = overrides.securityInjector ?? new OpenApiSecurityInjector(logger);
    this.parser = overrides.parser ?? new OpenApiParserService(logger);
    this.executor = overrides.executor ?? new DynamicToolExecutorService(this.securityInjector, logger);
  }

  /**
   * Get the underlying tool executor service.
   */
  getExecutor(): IDynamicToolExecutorService {
    return this.executor;
  }

  /**
   * Parse an OpenAPI specification from a URL and extract its tools.
   */
  async parseAndFlatten(apiSpecUrl: string, providerId?: string): Promise<{ document: Record<string, unknown>; tools: DynamicToolDefinition[] }> {
    return this.parser.parseAndFlatten(apiSpecUrl, providerId);
  }

  /**
   * Execute a specific tool extracted from an OpenAPI spec.
   */
  async executeTool(spec: Record<string, unknown>, toolName: string, args: Record<string, unknown>, options?: ExecuteToolOptions): Promise<unknown> {
    return this.executor.execute(spec, toolName, args, options);
  }
}
