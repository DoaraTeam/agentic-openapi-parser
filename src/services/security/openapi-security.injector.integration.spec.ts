import { OpenApiParserService } from '../parser/openapi-parser.service';
import { OpenApiSecurityInjector } from './openapi-security.injector';

/**
 * Feeds the real, dereferenced Petstore document (src/services/parser/__fixtures__/petstore.openapi.json)
 * into OpenApiSecurityInjector against its two real security schemes — `petstore_auth` (OAuth2
 * implicit flow) on write operations, `api_key` (apiKey in header, named "api_key") on store
 * operations — instead of a hand-written scheme object. Every existing injector test builds its
 * own minimal spec/scheme by hand, which can't catch a mismatch between what real specs actually
 * look like (nesting, field names, how `security` requirements are shaped) and what the injector
 * assumes.
 */
describe('OpenApiSecurityInjector integration (real Petstore security schemes)', () => {
  const fixturePath = `${process.cwd()}/src/services/parser/__fixtures__/petstore.openapi.json`;
  const logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };

  async function parseFixture() {
    const parser = new OpenApiParserService(logger);
    return parser.parseAndFlatten(fixturePath);
  }

  it('injects the real oauth2 scheme (petstore_auth) as a Bearer header for an oauth2-secured operation', async () => {
    const { document } = await parseFixture();
    const addPetOperation = (document.paths as Record<string, any>)['/pet'].post;
    expect(addPetOperation.security).toEqual([{ petstore_auth: ['write:pets', 'read:pets'] }]);

    const injector = new OpenApiSecurityInjector(logger);
    const headers: Record<string, string> = {};
    const queryParams: Record<string, unknown> = {};

    injector.inject(document, addPetOperation, 'real-oauth-token', headers, queryParams);

    expect(headers['Authorization']).toBe('Bearer real-oauth-token');
    expect(queryParams).toEqual({});
  });

  it('injects the real apiKey scheme (api_key) into its declared header, not Authorization', async () => {
    const { document } = await parseFixture();
    const getInventoryOperation = (document.paths as Record<string, any>)['/store/inventory'].get;
    expect(getInventoryOperation.security).toEqual([{ api_key: [] }]);

    const injector = new OpenApiSecurityInjector(logger);
    const headers: Record<string, string> = {};
    const queryParams: Record<string, unknown> = {};

    injector.inject(document, getInventoryOperation, 'real-api-key', headers, queryParams);

    expect(headers['api_key']).toBe('real-api-key');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('does not inject anything when accessToken is empty, even against a real secured operation', async () => {
    const { document } = await parseFixture();
    const addPetOperation = (document.paths as Record<string, any>)['/pet'].post;

    const injector = new OpenApiSecurityInjector(logger);
    const headers: Record<string, string> = {};
    const queryParams: Record<string, unknown> = {};

    injector.inject(document, addPetOperation, '', headers, queryParams);

    expect(headers).toEqual({});
  });
});
