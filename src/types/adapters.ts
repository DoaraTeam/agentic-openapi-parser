import { DynamicToolDefinition } from './core';

export interface IAiAdapter<TTool = unknown, TReturnType = TTool[]> {
  getTools(): TReturnType;
}
