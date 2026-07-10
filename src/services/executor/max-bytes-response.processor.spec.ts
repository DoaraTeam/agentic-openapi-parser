import { MaxBytesResponseProcessor } from './max-bytes-response.processor';

describe('MaxBytesResponseProcessor', () => {
  it('passes data through unchanged when under the byte limit', () => {
    const processor = new MaxBytesResponseProcessor(1000);
    const data = { ok: true, message: 'small payload' };

    expect(processor.process(data)).toBe(data);
  });

  it('wraps oversized data in a truncated metadata envelope', () => {
    const processor = new MaxBytesResponseProcessor(50);
    const data = { message: 'x'.repeat(200) };

    const result = processor.process(data) as Record<string, unknown>;

    expect(result.truncated).toBe(true);
    expect(result.maxBytes).toBe(50);
    expect(result.originalSizeBytes).toBeGreaterThan(50);
    expect(typeof result.preview).toBe('string');
    expect((result.preview as string).length).toBeLessThan(JSON.stringify(data).length);
  });

  it('uses the default 50KB limit when none is given', () => {
    const processor = new MaxBytesResponseProcessor();
    const smallData = { ok: true };

    expect(processor.process(smallData)).toBe(smallData);
  });

  it('does not split a multi-byte UTF-8 character at the truncation boundary', () => {
    // Each '你' is 3 bytes in UTF-8; pick a maxBytes that lands mid-character to prove the cut is byte-safe.
    const processor = new MaxBytesResponseProcessor(11); // `{"s":"` is 6 bytes, leaves 5 bytes for content — not a multiple of 3
    const data = { s: '你你你你你你你你你你' };

    const result = processor.process(data) as { preview: string };

    // A byte-unsafe cut would leave a replacement character (U+FFFD) in the preview.
    expect(result.preview).not.toContain('�');
    // Every character surviving the cut (before the appended "...") must be a complete, valid '你'.
    const contentAfterKey = result.preview.replace(/\.\.\.$/, '').replace('{"s":"', '');
    expect([...contentAfterKey].every((ch) => ch === '你')).toBe(true);
  });

  it('reports the correct original size for a JSON.stringify-able value larger than the limit', () => {
    const processor = new MaxBytesResponseProcessor(10);
    const data = Array.from({ length: 100 }, (_, i) => i);

    const result = processor.process(data) as { originalSizeBytes: number };

    expect(result.originalSizeBytes).toBe(Buffer.byteLength(JSON.stringify(data), 'utf8'));
  });
});
