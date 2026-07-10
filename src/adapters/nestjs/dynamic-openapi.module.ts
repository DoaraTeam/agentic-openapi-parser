import { DynamicModule, Module, Global, Logger } from '@nestjs/common';
import { 
  OpenApiParserService, 
  DynamicToolExecutorService, 
  OpenApiSecurityInjector,
  OPENAPI_PARSER_SERVICE, 
  DYNAMIC_TOOL_EXECUTOR_SERVICE, 
  OPENAPI_SECURITY_INJECTOR 
} from '@/services';
import { ILogger } from '@/types';

@Global()
@Module({})
export class DynamicOpenApiModule {
  static forRoot(): DynamicModule {
    return {
      module: DynamicOpenApiModule,
      providers: [
        {
          provide: 'NESTJS_LOGGER_ADAPTER',
          useFactory: (): ILogger => {
            const nestLogger = new Logger('DynamicOpenApi');
            return {
              log: (msg) => nestLogger.log(msg),
              error: (msg) => nestLogger.error(msg),
              warn: (msg) => nestLogger.warn(msg),
              debug: (msg) => nestLogger.debug(msg),
            };
          },
        },
        {
          provide: OPENAPI_PARSER_SERVICE,
          useFactory: (logger: ILogger) => new OpenApiParserService(logger),
          inject: ['NESTJS_LOGGER_ADAPTER'],
        },
        {
          provide: OPENAPI_SECURITY_INJECTOR,
          useFactory: (logger: ILogger) => new OpenApiSecurityInjector(logger),
          inject: ['NESTJS_LOGGER_ADAPTER'],
        },
        {
          provide: DYNAMIC_TOOL_EXECUTOR_SERVICE,
          useFactory: (securityInjector: OpenApiSecurityInjector, logger: ILogger) => 
            new DynamicToolExecutorService(securityInjector, logger),
          inject: [OPENAPI_SECURITY_INJECTOR, 'NESTJS_LOGGER_ADAPTER'],
        },
      ],
      exports: [
        OPENAPI_PARSER_SERVICE,
        OPENAPI_SECURITY_INJECTOR,
        DYNAMIC_TOOL_EXECUTOR_SERVICE,
      ],
    };
  }
}
