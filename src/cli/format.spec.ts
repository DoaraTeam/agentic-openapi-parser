import { formatToolsTable, formatToolsJson } from './format';
import { DynamicToolDefinition } from '@/types';

function makeTool(overrides: Partial<DynamicToolDefinition>): DynamicToolDefinition {
  return { name: 'tool', description: '', method: 'get', url: '/tool', parameters: [], ...overrides };
}

describe('formatToolsTable', () => {
  it('reports no tools found for an empty list', () => {
    expect(formatToolsTable([])).toBe('No tools found in this spec.');
  });

  it('uses singular "tool" for exactly one result', () => {
    const output = formatToolsTable([makeTool({ name: 'getPets', method: 'get', url: '/pets' })]);
    expect(output).toContain('Found 1 tool:');
    expect(output).toContain('GET');
    expect(output).toContain('getPets');
    expect(output).toContain('/pets');
  });

  it('uses plural "tools" for more than one result', () => {
    const output = formatToolsTable([makeTool({ name: 'a' }), makeTool({ name: 'b' })]);
    expect(output).toContain('Found 2 tools:');
  });

  it('does not print the scale warning at or under the threshold', () => {
    const tools = Array.from({ length: 100 }, (_, i) => makeTool({ name: `tool${i}` }));
    expect(formatToolsTable(tools)).not.toContain('⚠');
  });

  it('prints a scale warning once past the threshold', () => {
    const tools = Array.from({ length: 101 }, (_, i) => makeTool({ name: `tool${i}` }));
    const output = formatToolsTable(tools);
    expect(output).toContain('⚠');
    expect(output).toContain('101 tools');
  });
});

describe('formatToolsJson', () => {
  it('serializes only name/method/url/tags, defaulting tags to an empty array', () => {
    const output = formatToolsJson([makeTool({ name: 'getPets', method: 'get', url: '/pets', tags: undefined })]);
    expect(JSON.parse(output)).toEqual([{ name: 'getPets', method: 'get', url: '/pets', tags: [] }]);
  });

  it('preserves real tags when present', () => {
    const output = formatToolsJson([makeTool({ name: 'getPets', tags: ['pets', 'read'] })]);
    expect(JSON.parse(output)[0].tags).toEqual(['pets', 'read']);
  });
});
