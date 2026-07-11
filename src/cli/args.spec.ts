import { parseArgs } from './args';

describe('parseArgs', () => {
  it('treats no arguments as a help request', () => {
    expect(parseArgs([])).toEqual({ help: true, includeTags: [], excludeTags: [], json: false });
  });

  it('treats --help/-h as the command as a help request', () => {
    expect(parseArgs(['--help'])).toMatchObject({ help: true });
    expect(parseArgs(['-h'])).toMatchObject({ help: true });
  });

  it('parses a bare inspect command with a specUrl', () => {
    const args = parseArgs(['inspect', 'https://api.example.com/openapi.json']);
    expect(args).toEqual({
      help: false,
      command: 'inspect',
      specUrl: 'https://api.example.com/openapi.json',
      includeTags: [],
      excludeTags: [],
      json: false,
    });
  });

  it('collects repeated --tag flags into includeTags', () => {
    const args = parseArgs(['inspect', 'url', '--tag', 'pets', '--tag', 'orders']);
    expect(args.includeTags).toEqual(['pets', 'orders']);
  });

  it('collects repeated --exclude-tag flags into excludeTags', () => {
    const args = parseArgs(['inspect', 'url', '--exclude-tag', 'admin']);
    expect(args.excludeTags).toEqual(['admin']);
  });

  it('sets json when --json is present', () => {
    const args = parseArgs(['inspect', 'url', '--json']);
    expect(args.json).toBe(true);
  });

  it('recognizes -h/--help mixed in after the command as a help request', () => {
    const args = parseArgs(['inspect', 'url', '--help']);
    expect(args.help).toBe(true);
  });

  it('treats an unknown command as-is, leaving specUrl resolution/validation to the caller', () => {
    const args = parseArgs(['bogus']);
    expect(args.command).toBe('bogus');
    expect(args.specUrl).toBeUndefined();
  });

  it('does not crash when a flag expecting a value is the last argument', () => {
    const args = parseArgs(['inspect', 'url', '--tag']);
    expect(args.includeTags).toEqual(['']);
  });
});
