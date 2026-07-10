import { DynamicToolDefinition, ExecuteToolOptions } from '@/types';
import { IDynamicToolExecutorService } from '@/services';
import { safeToolName } from './tool-name';

/**
 * Shared plumbing for adapters whose target format is plain JSON with no SDK/peer dependency
 * (OpenAI function-calling, Anthropic tool-use, ...): map each tool to its sanitized name once,
 * serialize via `buildTool`, and resolve a tool call back to the original tool definition by that
 * same sanitized name (the provider echoes the name it was given back in its tool-call response).
 */
export abstract class BaseNativeToolAdapter<TTool> {
  private readonly toolsByName = new Map<string, DynamicToolDefinition>();

  constructor(
    protected readonly executor: IDynamicToolExecutorService,
    protected readonly spec: Record<string, unknown>,
    toolsDef: DynamicToolDefinition[],
    protected readonly options?: ExecuteToolOptions
  ) {
    for (const toolDef of toolsDef) {
      this.toolsByName.set(safeToolName(toolDef.name), toolDef);
    }
  }

  getTools(): TTool[] {
    return Array.from(this.toolsByName.entries(), ([name, toolDef]) => this.buildTool(name, toolDef));
  }

  /** Executes a tool call by the sanitized name the provider echoed back. */
  async executeToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
    const toolDef = this.toolsByName.get(name);
    if (!toolDef) {
      throw new Error(`Unknown tool "${name}"`);
    }
    return this.executor.execute(this.spec, toolDef.name, args, this.options);
  }

  protected abstract buildTool(name: string, toolDef: DynamicToolDefinition): TTool;
}
