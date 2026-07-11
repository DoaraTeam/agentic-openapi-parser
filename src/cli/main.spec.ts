import { main, HELP_TEXT } from './main';

/**
 * Runs main() against a real local fixture (src/cli/__fixtures__/mini.openapi.json) — no mocking
 * of DynamicOpenApiAgent/SwaggerParser — to verify the actual wiring end to end, the same "prefer
 * real over mocked" approach used for the rest of the parser/executor integration tests.
 */
describe('cli main()', () => {
  const fixturePath = `${process.cwd()}/src/cli/__fixtures__/mini.openapi.json`;

  function capture() {
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    return {
      stdout: (line: string) => stdoutLines.push(line),
      stderr: (line: string) => stderrLines.push(line),
      stdoutLines,
      stderrLines,
    };
  }

  it('prints the help text and exits 0 when given no arguments', async () => {
    const { stdout, stdoutLines } = capture();
    const exitCode = await main([], stdout);

    expect(exitCode).toBe(0);
    expect(stdoutLines[0]).toBe(HELP_TEXT);
  });

  it('exits 1 with an error on stderr for an unknown command', async () => {
    const { stdout, stderr, stderrLines } = capture();
    const exitCode = await main(['bogus'], stdout, stderr);

    expect(exitCode).toBe(1);
    expect(stderrLines[0]).toContain('Unknown command "bogus"');
  });

  it('exits 1 with an error on stderr when specUrl is missing', async () => {
    const { stdout, stderr, stderrLines } = capture();
    const exitCode = await main(['inspect'], stdout, stderr);

    expect(exitCode).toBe(1);
    expect(stderrLines[0]).toContain('Missing <specUrl>');
  });

  it('parses a real local spec and prints a table of all 3 real tools', async () => {
    const { stdout, stderr, stdoutLines } = capture();
    const exitCode = await main(['inspect', fixturePath], stdout, stderr);

    expect(exitCode).toBe(0);
    const output = stdoutLines.join('\n');
    expect(output).toContain('Found 3 tools:');
    expect(output).toContain('listPets');
    expect(output).toContain('createPet');
    expect(output).toContain('listOrders');
  });

  it('applies --tag filtering against the real spec', async () => {
    const { stdout, stderr, stdoutLines } = capture();
    const exitCode = await main(['inspect', fixturePath, '--tag', 'orders'], stdout, stderr);

    expect(exitCode).toBe(0);
    const output = stdoutLines.join('\n');
    expect(output).toContain('Found 1 tool:');
    expect(output).toContain('listOrders');
    expect(output).not.toContain('listPets');
  });

  it('prints JSON when --json is given', async () => {
    const { stdout, stderr, stdoutLines } = capture();
    const exitCode = await main(['inspect', fixturePath, '--tag', 'orders', '--json'], stdout, stderr);

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdoutLines[0]!);
    expect(parsed).toEqual([{ name: 'listOrders', method: 'get', url: '/orders', tags: ['orders'] }]);
  });

  it('propagates a real parse failure (bad path) as a rejected promise, not a swallowed error', async () => {
    const { stdout, stderr } = capture();
    await expect(main(['inspect', `${process.cwd()}/does-not-exist.json`], stdout, stderr)).rejects.toThrow();
  });
});
