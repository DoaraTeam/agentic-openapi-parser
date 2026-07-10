import { ResponseProcessor } from '@/types';

const DEFAULT_MAX_STRING_LENGTH = 1000;
const DEFAULT_MAX_ARRAY_ITEMS = 50;

/** Recursively truncates long strings and long arrays so responses fit an LLM's context window. */
export class TruncateResponseProcessor implements ResponseProcessor {
  constructor(
    private readonly maxStringLength: number = DEFAULT_MAX_STRING_LENGTH,
    private readonly maxArrayItems: number = DEFAULT_MAX_ARRAY_ITEMS
  ) {}

  process(data: unknown): unknown {
    return this.truncate(data);
  }

  private truncate(data: unknown): unknown {
    if (typeof data === 'string') {
      if (data.length <= this.maxStringLength) return data;
      return `${data.substring(0, this.maxStringLength)}... [TRUNCATED_DUE_TO_SIZE: original length was ${data.length}]`;
    }

    if (Array.isArray(data)) {
      const truncated = data.slice(0, this.maxArrayItems).map((item) => this.truncate(item));
      if (data.length > this.maxArrayItems) {
        truncated.push(
          `... [WARNING: Array truncated from ${data.length} to ${this.maxArrayItems} items to fit AI context window. Use limit/offset API parameters to view more.]`
        );
      }
      return truncated;
    }

    if (data && typeof data === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.truncate(value);
      }
      return result;
    }

    return data;
  }
}
