import { OpenApiParserService } from './openapi-parser.service';
import SwaggerParser from '@apidevtools/swagger-parser';
import axios from 'axios';

jest.mock('@apidevtools/swagger-parser');
jest.mock('axios');

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

  it('should apply a tool filter to the extracted tools', async () => {
    const mockSpec = {
      paths: {
        '/pets': {
          get: { operationId: 'getPets', tags: ['pets'] },
        },
        '/admin/reset': {
          post: { operationId: 'resetDb', tags: ['admin'] },
        },
      },
    };

    (SwaggerParser.dereference as jest.Mock).mockResolvedValue(mockSpec);

    const result = await service.parseAndFlatten('http://fake-url.com', undefined, { excludeTags: ['admin'] });

    expect(result.tools).toHaveLength(1);
    expect(result.tools?.[0]?.name).toBe('getPets');
  });

  it('should prefix tool names with the given namespace', async () => {
    const mockSpec = {
      paths: {
        '/pets': { get: { operationId: 'getPets' } },
      },
    };

    (SwaggerParser.dereference as jest.Mock).mockResolvedValue(mockSpec);

    const result = await service.parseAndFlatten('http://fake-url.com', undefined, undefined, 'github');

    expect(result.tools?.[0]?.name).toBe('github__getPets');
  });

  describe('caching', () => {
    const mockSpec = { paths: { '/pets': { get: { operationId: 'getPets' } } } };

    function makeCachingService(ttlMs = 1000, revalidateWithEtag = true) {
      return new OpenApiParserService(
        { log: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
        { cache: { ttlMs, revalidateWithEtag } }
      );
    }

    it('fetches once and reuses the cached document within the TTL window', async () => {
      const cachingService = makeCachingService(1000);
      (axios.get as jest.Mock).mockResolvedValue({ data: mockSpec, headers: { etag: 'v1' } });
      (SwaggerParser.dereference as jest.Mock).mockImplementation((doc: unknown) => Promise.resolve(doc));

      await cachingService.parseAndFlatten('https://api.example.com/openapi.json');
      await cachingService.parseAndFlatten('https://api.example.com/openapi.json');

      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(SwaggerParser.dereference).toHaveBeenCalledTimes(1);
    });

    it('does not cache across different spec URLs', async () => {
      const cachingService = makeCachingService(1000);
      (axios.get as jest.Mock).mockResolvedValue({ data: mockSpec, headers: {} });
      (SwaggerParser.dereference as jest.Mock).mockImplementation((doc: unknown) => Promise.resolve(doc));

      await cachingService.parseAndFlatten('https://api.example.com/a.json');
      await cachingService.parseAndFlatten('https://api.example.com/b.json');

      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    it('revalidates with If-None-Match after the TTL expires and reuses the cached document on 304', async () => {
      const cachingService = makeCachingService(10);
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockSpec, headers: { etag: 'v1' } })
        .mockResolvedValueOnce({ status: 304 });
      (SwaggerParser.dereference as jest.Mock).mockImplementation((doc: unknown) => Promise.resolve(doc));

      await cachingService.parseAndFlatten('https://api.example.com/openapi.json');
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = await cachingService.parseAndFlatten('https://api.example.com/openapi.json');

      expect(axios.get).toHaveBeenCalledTimes(2);
      expect(axios.get).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/openapi.json',
        expect.objectContaining({ headers: { 'If-None-Match': 'v1' } })
      );
      expect(SwaggerParser.dereference).toHaveBeenCalledTimes(1);
      expect(result.tools?.[0]?.name).toBe('getPets');
    });

    it('re-dereferences when a 200 with a changed spec comes back after TTL expiry', async () => {
      const cachingService = makeCachingService(10);
      const updatedSpec = { paths: { '/pets': { get: { operationId: 'getPets' } }, '/dogs': { get: { operationId: 'getDogs' } } } };
      (axios.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockSpec, headers: { etag: 'v1' } })
        .mockResolvedValueOnce({ status: 200, data: updatedSpec, headers: { etag: 'v2' } });
      (SwaggerParser.dereference as jest.Mock).mockImplementation((doc: unknown) => Promise.resolve(doc));

      await cachingService.parseAndFlatten('https://api.example.com/openapi.json');
      await new Promise((resolve) => setTimeout(resolve, 20));
      const result = await cachingService.parseAndFlatten('https://api.example.com/openapi.json');

      expect(SwaggerParser.dereference).toHaveBeenCalledTimes(2);
      expect(result.tools).toHaveLength(2);
    });

    it('does not use axios for a local file path — falls back to a full SwaggerParser.dereference each time TTL expires', async () => {
      const cachingService = makeCachingService(10);
      (SwaggerParser.dereference as jest.Mock).mockResolvedValue(mockSpec);

      await cachingService.parseAndFlatten('./local-spec.json');
      await new Promise((resolve) => setTimeout(resolve, 20));
      await cachingService.parseAndFlatten('./local-spec.json');

      expect(axios.get).not.toHaveBeenCalled();
      expect(SwaggerParser.dereference).toHaveBeenCalledTimes(2);
    });
  });
});
