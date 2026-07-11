import { OpenApiParserService } from './openapi-parser.service';
import { buildZodSchemaForTool, buildStrictInputSchema } from '@/adapters/shared';
import { DynamicToolDefinition } from '@/types';

/**
 * Runs parseAndFlatten() against the real, official Swagger Petstore OpenAPI 3.0 spec
 * (src/services/parser/__fixtures__/petstore.openapi.json, fetched verbatim from
 * https://petstore3.swagger.io/api/v3/openapi.json) — no mocking of SwaggerParser or axios.
 * Every other spec file in this project uses a hand-written mock spec, which can't catch bugs
 * that only show up against a real, non-trivial document (real $ref nesting, real enum/array/
 * format combinations, real required-field lists).
 */
describe('OpenApiParserService integration (real Petstore spec)', () => {
  const fixturePath = `${process.cwd()}/src/services/parser/__fixtures__/petstore.openapi.json`;
  let service: OpenApiParserService;

  function findTool(tools: DynamicToolDefinition[], name: string): DynamicToolDefinition {
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Expected fixture to contain tool "${name}"`);
    return tool;
  }

  beforeEach(() => {
    service = new OpenApiParserService({ log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() });
  });

  it('parses the real spec into exactly the 19 real Petstore operations', async () => {
    const { tools } = await service.parseAndFlatten(fixturePath);

    expect(tools).toHaveLength(19);
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'addPet',
        'createUser',
        'createUsersWithListInput',
        'deleteOrder',
        'deletePet',
        'deleteUser',
        'findPetsByStatus',
        'findPetsByTags',
        'getInventory',
        'getOrderById',
        'getPetById',
        'getUserByName',
        'loginUser',
        'logoutUser',
        'placeOrder',
        'updatePet',
        'updatePetWithForm',
        'updateUser',
        'uploadFile',
      ].sort()
    );
  });

  it('captures the real requestBody schema for addPet (nested $ref object, array, enum, required list)', async () => {
    const { tools } = await service.parseAndFlatten(fixturePath);
    const addPet = findTool(tools, 'addPet');

    expect(addPet.method).toBe('post');
    expect(addPet.url).toBe('/pet');
    expect(addPet.requestBodyRequired).toBe(true);
    expect(addPet.requestBodySchema).toMatchObject({
      type: 'object',
      required: ['name', 'photoUrls'],
      properties: expect.objectContaining({
        name: { type: 'string', example: 'doggie' },
        photoUrls: expect.objectContaining({ type: 'array' }),
        status: expect.objectContaining({ enum: ['available', 'pending', 'sold'] }),
      }),
    });
    // Petstore's Pet.category is a $ref — SwaggerParser.dereference() must have resolved it into
    // a real nested object schema, not left a dangling { $ref: ... }.
    expect(addPet.requestBodySchema?.properties).toHaveProperty('category.type', 'object');
  });

  it('builds a working Zod schema from the real addPet requestBody and validates real payloads', async () => {
    const { tools } = await service.parseAndFlatten(fixturePath);
    const addPet = findTool(tools, 'addPet');
    const schema = buildZodSchemaForTool(addPet);

    const valid = schema.safeParse({
      requestBody: {
        name: 'doggie',
        photoUrls: ['https://example.com/photo.jpg'],
        category: { id: 1, name: 'Dogs' },
        tags: [{ id: 1, name: 'friendly' }],
        status: 'available',
      },
    });
    expect(valid.success).toBe(true);

    const missingRequiredField = schema.safeParse({ requestBody: { photoUrls: [] } }); // missing "name"
    expect(missingRequiredField.success).toBe(false);

    const invalidEnum = schema.safeParse({
      requestBody: { name: 'doggie', photoUrls: [], status: 'not-a-real-status' },
    });
    expect(invalidEnum.success).toBe(false);
  });

  it('builds a strict JSON Schema (MCP/OpenAI/Anthropic shape) from the same real tool without throwing', async () => {
    const { tools } = await service.parseAndFlatten(fixturePath);
    const addPet = findTool(tools, 'addPet');

    const jsonSchema = buildStrictInputSchema(addPet);

    expect(jsonSchema).toMatchObject({
      type: 'object',
      required: ['requestBody'],
      properties: {
        requestBody: expect.objectContaining({ type: 'object' }),
      },
    });
    // sanitizeJsonSchema() strips "example" — real fixture data must actually trigger that path.
    expect(JSON.stringify(jsonSchema)).not.toContain('"example"');
  });

  it('derives real query-parameter enums correctly (findPetsByStatus)', async () => {
    const { tools } = await service.parseAndFlatten(fixturePath);
    const findByStatus = findTool(tools, 'findPetsByStatus');

    const statusParam = findByStatus.parameters.find((p) => p.name === 'status');
    expect(statusParam).toMatchObject({
      in: 'query',
      required: true,
      schema: expect.objectContaining({ enum: ['available', 'pending', 'sold'] }),
    });

    expect(() => buildZodSchemaForTool(findByStatus)).not.toThrow();
    const schema = buildZodSchemaForTool(findByStatus);
    expect(schema.safeParse({ status: 'sold' }).success).toBe(true);
    expect(schema.safeParse({ status: 'not-real' }).success).toBe(false);
  });

  it('applies a real tag-based filter against the real spec (pet/store/user tags)', async () => {
    const { tools } = await service.parseAndFlatten(fixturePath, undefined, { includeTags: ['store'] });

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['deleteOrder', 'getInventory', 'getOrderById', 'placeOrder'].sort()
    );
  });
});
