import { OpenApiParserService } from './openapi-parser.service';
import SwaggerParser from '@apidevtools/swagger-parser';

jest.mock('@apidevtools/swagger-parser');

describe('OpenApiParserService', () => {
  let service: OpenApiParserService;

  beforeEach(() => {
    service = new OpenApiParserService({
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    });
    jest.clearAllMocks();
  });

  it('should parse and flatten a swagger document into tool definitions', async () => {
    const mockSpec = {
      paths: {
        '/pets': {
          get: {
            operationId: 'getPets',
            summary: 'List all pets',
            parameters: [],
          },
          post: {
            summary: 'Create a pet',
            // No operationId to test generated name fallback
          }
        }
      }
    };

    (SwaggerParser.dereference as jest.Mock).mockResolvedValue(mockSpec);

    const result = await service.parseAndFlatten('http://fake-url.com');

    expect(result.tools).toHaveLength(2);

    expect(result.tools?.[0]?.name).toBe('getPets');
    expect(result.tools?.[0]?.method).toBe('get');
    expect(result.tools?.[0]?.url).toBe('/pets');

    // Check fallback generated name
    expect(result.tools?.[1]?.name).toBe('post_pets');
    expect(result.tools?.[1]?.method).toBe('post');
  });

  it('should throw an error if SwaggerParser fails', async () => {
    (SwaggerParser.dereference as jest.Mock).mockRejectedValue(new Error('Network Error'));

    await expect(service.parseAndFlatten('http://fake-url.com')).rejects.toThrow('Failed to parse OpenAPI spec: Network Error');
  });

  it('should extract requestBody schema and tags from an OpenAPI 3 operation', async () => {
    const mockSpec = {
      paths: {
        '/users': {
          post: {
            operationId: 'createUser',
            tags: ['users'],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
                },
              },
            },
          },
        },
      },
    };

    (SwaggerParser.dereference as jest.Mock).mockResolvedValue(mockSpec);

    const result = await service.parseAndFlatten('http://fake-url.com');

    expect(result.tools?.[0]?.tags).toEqual(['users']);
    expect(result.tools?.[0]?.requestBodyRequired).toBe(true);
    expect(result.tools?.[0]?.requestBodySchema).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    });
  });

  it('should leave requestBodySchema/tags undefined when the operation has no requestBody', async () => {
    const mockSpec = {
      paths: {
        '/pets': {
          get: { operationId: 'getPets' },
        },
      },
    };

    (SwaggerParser.dereference as jest.Mock).mockResolvedValue(mockSpec);

    const result = await service.parseAndFlatten('http://fake-url.com');

    expect(result.tools?.[0]?.requestBodySchema).toBeUndefined();
    expect(result.tools?.[0]?.tags).toBeUndefined();
  });
});
