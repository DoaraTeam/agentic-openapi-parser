import { ILogger } from '@/types';
import pino from 'pino';

const pinoLogger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
  name: 'DynamicOpenApi',
});

export const DEFAULT_LOGGER: ILogger = {
  log: (msg) => pinoLogger.info(msg),
  error: (msg) => pinoLogger.error(msg),
  warn: (msg) => pinoLogger.warn(msg),
  debug: (msg) => pinoLogger.debug(msg),
};
