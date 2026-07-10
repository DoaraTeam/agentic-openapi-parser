import { TruncateResponseProcessor } from './truncate-response.processor';

describe('TruncateResponseProcessor', () => {
  it('leaves short strings, small arrays, and primitives untouched', () => {
    const processor = new TruncateResponseProcessor();
    expect(processor.process('short')).toBe('short');
    expect(processor.process([1, 2, 3])).toEqual([1, 2, 3]);
    expect(processor.process(42)).toBe(42);
    expect(processor.process(null)).toBeNull();
  });

  it('truncates a string longer than maxStringLength and appends a marker', () => {
    const processor = new TruncateResponseProcessor(10);
    const result = processor.process('a'.repeat(20)) as string;
    expect(result).toBe(`${'a'.repeat(10)}... [TRUNCATED_DUE_TO_SIZE: original length was 20]`);
  });

  it('truncates an array longer than maxArrayItems and appends a warning element', () => {
    const processor = new TruncateResponseProcessor(1000, 3);
    const result = processor.process([1, 2, 3, 4, 5]) as unknown[];
    expect(result).toHaveLength(4);
    expect(result.slice(0, 3)).toEqual([1, 2, 3]);
    expect(result[3]).toBe(
      '... [WARNING: Array truncated from 5 to 3 items to fit AI context window. Use limit/offset API parameters to view more.]'
    );
  });

  it('recurses into nested objects/arrays so deep strings/arrays get truncated too', () => {
    const processor = new TruncateResponseProcessor(5, 2);
    const result = processor.process({
      name: 'abcdefgh',
      items: [1, 2, 3, 4],
      nested: { bio: 'abcdefgh' },
    }) as Record<string, unknown>;

    expect(result.name).toBe('abcde... [TRUNCATED_DUE_TO_SIZE: original length was 8]');
    expect(result.items).toHaveLength(3); // 2 items + warning element
    expect((result.nested as Record<string, unknown>).bio).toBe('abcde... [TRUNCATED_DUE_TO_SIZE: original length was 8]');
  });
});
