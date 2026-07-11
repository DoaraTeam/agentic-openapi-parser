import { createMockExecutor } from './mock-executor';
import { ToolNotFoundError } from '@/errors';

describe('createMockExecutor', () => {
  it('resolves a static value response', async () => {
    const executor = createMockExecutor({ getPet: { id: 1, name: 'Rex' } });

    await expect(executor.execute({}, 'getPet', {})).resolves.toEqual({ id: 1, name: 'Rex' });
  });

  it('calls a function response with the invocation args and options, sync or async', async () => {
    const executor = createMockExecutor({
      getPet: (args: Record<string, unknown>) => ({ id: args.petId, name: 'Rex' }),
      createPet: async (args: Record<string, unknown>) => ({ id: 99, ...args }),
    });

    await expect(executor.execute({}, 'getPet', { petId: 7 })).resolves.toEqual({ id: 7, name: 'Rex' });
    await expect(executor.execute({}, 'createPet', { name: 'Fido' })).resolves.toEqual({ id: 99, name: 'Fido' });
  });

  it('throws an Error response as-is, so consumers can simulate failed tool calls', async () => {
    const failure = new Error('upstream 500');
    const executor = createMockExecutor({ getPet: failure });

    await expect(executor.execute({}, 'getPet', {})).rejects.toBe(failure);
  });

  it('throws ToolNotFoundError for a tool name not present in the response map', async () => {
    const executor = createMockExecutor({ getPet: {} });

    await expect(executor.execute({}, 'deletePet', {})).rejects.toThrow(ToolNotFoundError);
  });

  it('defaults to an empty response map, so every tool name is unrecognized', async () => {
    const executor = createMockExecutor();

    await expect(executor.execute({}, 'getPet', {})).rejects.toThrow(ToolNotFoundError);
  });

  it('records every call in order for later assertions', async () => {
    const executor = createMockExecutor({ getPet: {}, listPets: [] });

    await executor.execute({}, 'getPet', { petId: 1 }, { timeout: 5000 });
    await executor.execute({}, 'listPets', {});

    expect(executor.calls).toEqual([
      { toolName: 'getPet', args: { petId: 1 }, options: { timeout: 5000 } },
      { toolName: 'listPets', args: {}, options: undefined },
    ]);
  });
});
