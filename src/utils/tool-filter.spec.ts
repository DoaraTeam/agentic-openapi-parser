import { DynamicToolDefinition } from '@/types';
import { filterTools } from './tool-filter';

function makeTool(overrides: Partial<DynamicToolDefinition>): DynamicToolDefinition {
  return {
    name: 'getPets',
    description: '',
    method: 'get',
    url: '/pets',
    parameters: [],
    ...overrides,
  };
}

describe('filterTools', () => {
  const tools = [
    makeTool({ name: 'getPets', url: '/pets', tags: ['pets'] }),
    makeTool({ name: 'deletePet', url: '/pets/{id}', method: 'delete', tags: ['pets', 'destructive'] }),
    makeTool({ name: 'getUsers', url: '/users', tags: ['users'] }),
    makeTool({ name: 'adminResetDb', url: '/admin/reset', tags: undefined }),
  ];

  it('returns all tools when no filter is given', () => {
    expect(filterTools(tools)).toHaveLength(4);
  });

  it('keeps only tools matching includeTags', () => {
    const result = filterTools(tools, { includeTags: ['users'] });
    expect(result.map((t) => t.name)).toEqual(['getUsers']);
  });

  it('drops tools matching excludeTags', () => {
    const result = filterTools(tools, { excludeTags: ['destructive'] });
    expect(result.map((t) => t.name)).toEqual(['getPets', 'getUsers', 'adminResetDb']);
  });

  it('keeps only tools whose name matches includeOperationIds glob', () => {
    const result = filterTools(tools, { includeOperationIds: ['get*'] });
    expect(result.map((t) => t.name)).toEqual(['getPets', 'getUsers']);
  });

  it('drops tools whose name matches excludeOperationIds glob', () => {
    const result = filterTools(tools, { excludeOperationIds: ['admin*'] });
    expect(result.map((t) => t.name)).toEqual(['getPets', 'deletePet', 'getUsers']);
  });

  it('keeps only tools whose path matches includePaths glob', () => {
    const result = filterTools(tools, { includePaths: ['/pets', '/pets/*'] });
    expect(result.map((t) => t.name)).toEqual(['getPets', 'deletePet']);
  });

  it('drops tools whose path matches excludePaths glob', () => {
    const result = filterTools(tools, { excludePaths: ['/admin/**'] });
    expect(result.map((t) => t.name)).toEqual(['getPets', 'deletePet', 'getUsers']);
  });

  it('combines multiple filter dimensions with AND semantics', () => {
    const result = filterTools(tools, { includeTags: ['pets'], excludeOperationIds: ['delete*'] });
    expect(result.map((t) => t.name)).toEqual(['getPets']);
  });

  it('treats a tool with no tags as failing any includeTags filter', () => {
    const result = filterTools(tools, { includeTags: ['pets'] });
    expect(result.map((t) => t.name)).toEqual(['getPets', 'deletePet']);
  });
});
