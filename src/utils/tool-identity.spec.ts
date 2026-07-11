import { deriveToolName, iterateOperations, findOperationByToolName } from './tool-identity';

describe('deriveToolName', () => {
  it('uses operationId when present', () => {
    expect(deriveToolName('get', '/users/{id}', 'getUserById')).toBe('getUserById');
  });

  it('falls back to method_path when operationId is absent', () => {
    expect(deriveToolName('get', '/users/{id}')).toBe('get_users_id');
  });

  it('sanitizes special characters', () => {
    expect(deriveToolName('post', '/x', 'create.user!name')).toBe('create_user_name');
  });

  it('truncates to 64 characters', () => {
    const longId = 'a'.repeat(100);
    const result = deriveToolName('get', '/x', longId);
    expect(result.length).toBe(64);
  });

  it('falls back to unknown_tool for an empty-after-sanitize name', () => {
    expect(deriveToolName('get', '', '___')).toBe('unknown_tool');
  });
});

describe('iterateOperations', () => {
  it('yields one entry per declared HTTP method on each path', () => {
    const spec = {
      paths: {
        '/users': {
          get: { operationId: 'listUsers' },
          post: { operationId: 'createUser' },
        },
        '/users/{id}': {
          get: { operationId: 'getUserById' },
        },
      },
    };

    const results = Array.from(iterateOperations(spec));
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.operation.operationId)).toEqual(['listUsers', 'createUser', 'getUserById']);
  });

  it('returns nothing for a spec with no paths', () => {
    expect(Array.from(iterateOperations({}))).toEqual([]);
  });
});

describe('findOperationByToolName', () => {
  it('finds the operation matching a derived tool name', () => {
    const spec = {
      paths: {
        '/users/{id}': {
          get: { operationId: 'getUserById' },
        },
      },
    };

    const found = findOperationByToolName(spec, 'getUserById');
    expect(found).not.toBeNull();
    expect(found?.path).toBe('/users/{id}');
    expect(found?.method).toBe('get');
  });

  it('returns null when no operation matches', () => {
    const spec = { paths: {} };
    expect(findOperationByToolName(spec, 'nonexistent')).toBeNull();
  });
});
