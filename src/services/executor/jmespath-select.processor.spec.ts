import { JmesPathSelectProcessor } from './jmespath-select.processor';

describe('JmesPathSelectProcessor', () => {
  it('selects a nested field', () => {
    const processor = new JmesPathSelectProcessor('user.name');
    expect(processor.process({ user: { name: 'Alice', age: 30 } })).toBe('Alice');
  });

  it('projects a list of objects into a reshaped list', () => {
    const processor = new JmesPathSelectProcessor('items[*].{id: id, label: name}');
    const data = {
      items: [
        { id: 1, name: 'First', internal: 'x' },
        { id: 2, name: 'Second', internal: 'y' },
      ],
    };

    expect(processor.process(data)).toEqual([
      { id: 1, label: 'First' },
      { id: 2, label: 'Second' },
    ]);
  });

  it('applies a filter expression', () => {
    const processor = new JmesPathSelectProcessor("items[?status=='active'].id");
    const data = {
      items: [
        { id: 1, status: 'active' },
        { id: 2, status: 'inactive' },
        { id: 3, status: 'active' },
      ],
    };

    expect(processor.process(data)).toEqual([1, 3]);
  });

  it('returns null when the path does not match anything', () => {
    const processor = new JmesPathSelectProcessor('user.missingField');
    expect(processor.process({ user: { name: 'Alice' } })).toBeNull();
  });

  it('throws a descriptive error for a malformed expression instead of passing data through', () => {
    const processor = new JmesPathSelectProcessor('items[?');
    expect(() => processor.process({ items: [] })).toThrow(/Invalid JMESPath expression "items\[\?"/);
  });
});
