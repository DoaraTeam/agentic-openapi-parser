import { ResponseProcessor } from '@/types';

const DEFAULT_MAX_BYTES = 50 * 1024; // 50 KB

/**
 * Caps the total serialized size of a response, as a last-resort safety net after any selection/
 * truncation the caller has already configured (TruncateResponseProcessor caps individual
 * strings/arrays, not the overall payload). Over the limit, returns a metadata wrapper with a
 * truncated JSON preview instead of the raw value — this intentionally does not return a
 * re-parseable JSON document, since a byte-accurate cut can't guarantee valid JSON either way.
 */
export class MaxBytesResponseProcessor implements ResponseProcessor {
  private readonly maxBytes: number;

  constructor(maxBytes: number = DEFAULT_MAX_BYTES) {
    this.maxBytes = maxBytes;
  }

  process(data: unknown): unknown {
    const serialized = JSON.stringify(data);
    if (serialized === undefined) return data;

    const sizeBytes = Buffer.byteLength(serialized, 'utf8');
    if (sizeBytes <= this.maxBytes) return data;

    return {
      truncated: true,
      originalSizeBytes: sizeBytes,
      maxBytes: this.maxBytes,
      preview: `${this.truncateToByteLength(serialized, this.maxBytes)}...`,
    };
  }

  /** Cuts at a byte boundary without splitting a multi-byte UTF-8 character into an invalid tail. */
  private truncateToByteLength(text: string, maxBytes: number): string {
    const sliced = Buffer.from(text, 'utf8').subarray(0, maxBytes);
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(sliced);
    return decoded.endsWith('\uFFFD') ? decoded.slice(0, -1) : decoded;
  }
}
