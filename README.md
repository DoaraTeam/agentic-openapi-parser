# Agentic OpenAPI 🚀

[![npm version](https://badge.fury.io/js/agentic-openapi.svg)](https://badge.fury.io/js/agentic-openapi)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

A highly modular, universal library that dynamically parses OpenAPI/Swagger specifications and turns them into highly structured, AI-ready functions ("Tools"). It securely injects authentication (Bearer, API Keys, Basic Auth, OAuth2) on the fly and provides ready-to-use adapters for the **Vercel AI SDK** and **Langchain**.

This library completely eliminates the need to generate static client code. Your AI agent can directly interact with *any* API given its Swagger/OpenAPI URL!

---

## 🌟 Key Features

- **Zero Static Code Gen:** Fetch, parse, and execute API endpoints directly from an OpenAPI URL or JSON file dynamically.
- **Smart Security Injector:** Automatically injects `Bearer`, `API Key`, or `Basic Auth` headers. It can even auto-detect and fix malformed Bearer tokens (e.g., automatically prepending `Bearer ` if the spec or user misses it).
- **AI Ecosystem Adapters:** Seamlessly converts API endpoints into `DynamicStructuredTool` for **Langchain** or `CoreTool` for **Vercel AI SDK**.
- **Strictly Typed & Zero `any`:** Built with uncompromising TypeScript strictness for enterprise stability.
- **Universal Architecture:** Usable natively in Vanilla TypeScript/Node.js, or inside an enterprise NestJS backend (via included `DynamicModule`).

---

## 📦 Installation

```bash
# Using npm
npm install agentic-openapi

# Using pnpm
pnpm add agentic-openapi

# Using yarn
yarn add agentic-openapi
```

If you plan to use the AI Adapters, install the peer dependencies you need:
```bash
npm install zod @langchain/core ai @modelcontextprotocol/sdk
```

---

## 🚀 Usage Guide

This library uses modern sub-path exports to keep your bundle clean.

### 1. Vanilla TypeScript Usage (Agent Facade)

You don't need NestJS to use this library. Use the `DynamicOpenApiAgent` facade for quick integration:

```typescript
import { DynamicOpenApiAgent } from 'agentic-openapi';

async function run() {
  const agent = new DynamicOpenApiAgent();

  // 1. Parse an OpenAPI spec
  const { spec, tools } = await agent.parseAndFlatten('https://api.example.com/swagger-json');

  // 2. See available tools
  console.log(tools.map(t => t.name)); 
  // Output: ['getUserById', 'createUser', ...]

  // 3. Execute a tool securely
  const result = await agent.executeTool(
    spec, 
    'getUserById', 
    { id: 123 }, // Parameters
    {
      token: 'my-secret-token',
      authType: 'BEARER' // Optional: if omitted, the agent will try to auto-detect from the spec
    }
  );

  console.log(result);
}
```

### 2. NestJS Integration

For NestJS apps, the library provides a dynamic module for dependency injection.

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { DynamicOpenApiModule } from 'agentic-openapi/adapters/nestjs';

@Module({
  imports: [
    DynamicOpenApiModule.forRoot()
  ],
})
export class AppModule {}
```

Then inject the services directly into your controllers/services:

```typescript
// app.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { 
  OPENAPI_PARSER_SERVICE, 
  IOpenApiParserService,
  DYNAMIC_TOOL_EXECUTOR_SERVICE,
  IDynamicToolExecutorService 
} from 'agentic-openapi/services';

@Injectable()
export class AppService {
  constructor(
    @Inject(OPENAPI_PARSER_SERVICE)
    private parser: IOpenApiParserService,
    @Inject(DYNAMIC_TOOL_EXECUTOR_SERVICE)
    private executor: IDynamicToolExecutorService,
  ) {}

  async doSomething() {
    const { spec, tools } = await this.parser.parseAndFlatten('...');
    // ...
  }
}
```

---

## 🤖 AI Ecosystem Adapters

The true power of this library is feeding OpenAPI specs directly into LLMs!

### Vercel AI SDK Adapter

Map your APIs directly into `ai` compatible tools.

```typescript
import { DynamicOpenApiAgent } from 'agentic-openapi';
import { VercelAiAdapter } from 'agentic-openapi/adapters/vercel-ai';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const agent = new DynamicOpenApiAgent();
const { spec, tools } = await agent.parseAndFlatten('https://api.example.com/docs');

// Create the adapter
const adapter = new VercelAiAdapter(agent.getExecutor(), spec, tools, {
  token: 'YOUR_API_KEY',
  authType: 'BEARER'
});

// Pass directly to Vercel AI
const result = await generateText({
  model: openai('gpt-4-turbo'),
  prompt: 'Get the user with ID 123',
  tools: adapter.getTools()
});
```

### Langchain Adapter

Seamlessly integrate with Langchain's agents and tools ecosystem.

```typescript
import { DynamicOpenApiAgent } from 'agentic-openapi';
import { LangchainToolAdapter } from 'agentic-openapi/adapters/langchain';
import { ChatOpenAI } from '@langchain/openai';
import { createOpenAIToolsAgent, AgentExecutor } from 'langchain/agents';

const agent = new DynamicOpenApiAgent();
const { spec, tools } = await agent.parseAndFlatten('https://api.example.com/docs');

const adapter = new LangchainToolAdapter(agent.getExecutor(), spec, tools, {
  token: 'YOUR_API_KEY',
  authType: 'BEARER'
});

const llm = new ChatOpenAI({ modelName: "gpt-4" });
const langchainTools = adapter.getTools(); // Returns DynamicStructuredTool[]

// Bind tools to the LLM
const llmWithTools = llm.bindTools(langchainTools);
```

### MCP Adapter

Expose your parsed OpenAPI tools on an [MCP](https://modelcontextprotocol.io) server. This adapter
only registers tools — it does not choose a transport or call `.connect()`, so you stay in control
of whether the server runs over stdio, HTTP, or anything else.

```typescript
import { DynamicOpenApiAgent } from 'agentic-openapi';
import { McpToolAdapter } from 'agentic-openapi/adapters/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const agent = new DynamicOpenApiAgent();
const { spec, tools } = await agent.parseAndFlatten('https://api.example.com/docs');

const adapter = new McpToolAdapter(agent.getExecutor(), spec, tools, {
  token: 'YOUR_API_KEY',
  authType: 'BEARER'
});

// Builds a McpServer and registers every tool onto it (unconnected)
const server = adapter.createServer({ name: 'my-api-server', version: '1.0.0' });

// You choose the transport and connect it yourself
const transport = new StdioServerTransport();
await server.connect(transport);
```

If you already have a `McpServer` instance (e.g. one that also serves resources/prompts), use
`adapter.registerOn(existingServer)` instead of `createServer()`.

### OpenAI / Anthropic Native Tool Adapters

Both providers' tool-calling format is plain JSON — no SDK required, so these two adapters carry
**zero peer dependency**. `getTools()` returns wire-format objects ready to pass straight into the
provider's request; `executeToolCall(name, args)` maps a returned tool call back to the matching
OpenAPI operation and runs it.

```typescript
import { DynamicOpenApiAgent } from 'agentic-openapi';
import { OpenAiToolAdapter } from 'agentic-openapi/adapters/openai';
import OpenAI from 'openai';

const agent = new DynamicOpenApiAgent();
const { spec, tools } = await agent.parseAndFlatten('https://api.example.com/docs');
const adapter = new OpenAiToolAdapter(agent.getExecutor(), spec, tools, { accessToken: 'YOUR_API_KEY' });

const client = new OpenAI();
const response = await client.chat.completions.create({
  model: 'gpt-4-turbo',
  messages: [{ role: 'user', content: 'Get the user with ID 123' }],
  tools: adapter.getTools(),
});

const call = response.choices[0]?.message.tool_calls?.[0];
if (call) {
  const result = await adapter.executeToolCall(call.function.name, JSON.parse(call.function.arguments));
}
```

`AnthropicToolAdapter` (`agentic-openapi/adapters/anthropic`) works the same way — `getTools()`
returns `{ name, description, input_schema }[]` for the Messages API's `tools` field, and a
`tool_use` content block's `name`/`input` go straight into `executeToolCall(name, input)`.

---

## 🧠 Request Bodies & Nested Schemas

Tool schemas aren't limited to flat query/path parameters — `requestBody` (OpenAPI 3), nested
objects, arrays, enums, and common string formats (`date-time`, `email`, `uuid`) are all converted
into the matching Zod validators, so the LLM sees (and is validated against) the real shape of the
payload it needs to send, not just a generic string/object. A POST endpoint with a JSON request
body shows up in the generated tool schema as a `requestBody` field alongside the usual parameters.

---

## 🧰 Tool Filtering

Large specs (Stripe, GitHub, ...) can flatten into hundreds of tools, which hurts LLM tool-selection
accuracy well before it hits any provider limit. Pass a `ToolFilterOptions` as the third argument to
`parseAndFlatten()` to keep only the tools you actually want to expose:

```ts
const { tools } = await agent.parseAndFlatten('https://api.example.com/openapi.json', 'stripe', {
  includeTags: ['payments', 'customers'],   // keep only these OpenAPI tags
  excludeOperationIds: ['admin*'],          // glob against the derived tool name
  excludePaths: ['/internal/**'],           // glob against the OpenAPI path template
});
```

All four dimensions (`includeTags`/`excludeTags`, `includeOperationIds`/`excludeOperationIds`,
`includePaths`/`excludePaths`) are optional and combine with AND semantics — a tool must pass every
filter you specify. `include*` uses OR-within-dimension (any pattern matching is enough), `exclude*`
drops a tool if any pattern matches. Patterns support `*` (single path segment), `**` (any number of
segments), and `?` (single character).

---

## 🗄️ Spec Caching & Multi-Spec Namespacing

**Caching** — re-parsing and re-dereferencing a large spec on every `parseAndFlatten()` call is
wasteful for a long-lived process. Opt in via the `OpenApiParserService` constructor (this is a
policy for the parser *instance*, like `maxConcurrency` is for the executor):

```ts
import { OpenApiParserService } from 'agentic-openapi-parser';

const parser = new OpenApiParserService(logger, {
  cache: {
    ttlMs: 5 * 60 * 1000,      // how long a dereferenced document stays fresh
    revalidateWithEtag: true,  // default true — see below
  },
});
```

For `http(s)://` spec URLs, once the TTL expires the parser doesn't necessarily redo the full
dereference: if the server returned an `ETag` on the last fetch, it sends a conditional
`If-None-Match` request first — a `304 Not Modified` reuses the already-dereferenced document at
almost no cost, and only an actual `200` with new content triggers a full re-parse. Local file
paths (or an already-parsed object) skip the ETag step entirely (there's no HTTP response to
revalidate against) but still benefit from the TTL window itself.

**Multi-spec namespacing** — when you flatten tools from more than one spec into a single list for
an LLM, two specs can derive the same tool name (two `getUser` operations). Pass a `namespace` as
the fourth argument to `parseAndFlatten()` to prefix every tool name from that spec:

```ts
const { tools: githubTools } = await agent.parseAndFlatten(githubSpecUrl, 'github-provider', undefined, 'github');
const { tools: stripeTools } = await agent.parseAndFlatten(stripeSpecUrl, 'stripe-provider', undefined, 'stripe');
// githubTools[0].name === 'github__getUser', stripeTools[0].name === 'stripe__getUser' — no collision
```

Pass the same `namespace` back in `ExecuteToolOptions.namespace` when executing one of these tools,
so the executor can strip the prefix and resolve the original OpenAPI operation:

```ts
await agent.executeTool(spec, 'github__getUser', args, { namespace: 'github', accessToken: '...' });
```

---

## 🔁 Retry, Timeout & Concurrency

Third-party APIs are flaky. Three independent knobs handle this without any extra dependency:

- **Per-call timeout** — `options.timeout` (ms) on `executeTool()`/`execute()`, already scoped to a
  single tool call so different endpoints on the same provider can use different budgets.
- **Retry with backoff** — `options.retry` on the same call:

  ```ts
  await agent.executeTool(spec, 'getInvoice', args, {
    retry: {
      maxRetries: 3,               // default 0 (no retry)
      retryDelayMs: 300,           // base delay; exponential backoff with full jitter
      retryableStatusCodes: [408, 429, 500, 502, 503, 504], // this is the default
      retryOnNetworkError: true,   // retry when there's no HTTP response at all
    },
  });
  ```

  Only retries idempotent-looking failures (timeouts, 429/5xx, connection resets) — a 4xx client
  error fails immediately, no retry.

- **Concurrency limit** — a policy for the *executor instance* rather than a single call, since it
  protects one provider's API from a burst of parallel tool calls (e.g. an LLM turn requesting 20
  tools at once):

  ```ts
  import { DynamicToolExecutorService, OpenApiSecurityInjector } from 'agentic-openapi-parser';

  const executor = new DynamicToolExecutorService(new OpenApiSecurityInjector(logger), logger, {
    maxConcurrency: 5, // extra calls queue instead of firing all at once
  });
  ```

  Pass this executor into `DynamicOpenApiAgent`'s constructor overrides (see
  [Overriding facade pieces](#overriding-facade-pieces)) to wire it into the facade.

---

## 🔒 Security & Logging

This library implements robust safety checks:
- **Zero Console.log:** Uses `pino` logger via DI to ensure structured, production-ready logging.
- **Token Masking:** Securely masks API keys and Bearer tokens in logs (`Bearer my-s******oken`) to prevent credential leakage.
- **Strict Null Checks:** Enforces strict array and object indexing to prevent runtime crashes from malformed specs.

---

## 🧩 Extending

The library is built around small, swappable pieces. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the
full walkthrough — the short version:

### Custom auth strategy

Security injection is a registry of `ISecurityStrategy` implementations keyed by OpenAPI
`securityScheme.type` (`apiKey`, `http`, `oauth2`, `basic`, ...). Add your own without touching the
built-in ones:

```typescript
import { OpenApiSecurityInjector, SecurityStrategyRegistry, createDefaultSecurityStrategyRegistry } from 'agentic-openapi/services';

class HmacSignatureStrategy /* implements ISecurityStrategy */ {
  schemeTypes = ['x-hmac'];
  supportsAuthType() { return true; }
  inject({ headers, accessToken }) {
    headers['X-Signature'] = signRequest(accessToken);
    return true;
  }
}

const registry = createDefaultSecurityStrategyRegistry().register(new HmacSignatureStrategy());
const securityInjector = new OpenApiSecurityInjector(logger, registry);
```

### Custom AI adapter

This is for contributors adding a new adapter inside the repo (see CONTRIBUTING.md) — extend
`BaseAiAdapter` (`src/adapters/shared/base-ai-adapter.ts`) to add support for another framework;
it already gives you schema generation, safe tool naming, and executor wiring:

```typescript
import { BaseAiAdapter } from '@/adapters/shared';

class MyFrameworkAdapter extends BaseAiAdapter<MyToolShape, MyToolShape[]> {
  getTools() {
    return this.toolsDef.map((toolDef) => ({
      name: this.safeToolName(toolDef.name),
      schema: this.buildSchema(toolDef.parameters),
      execute: (args) => this.run(toolDef.name, args),
    }));
  }
}
```

### Overriding facade pieces

`DynamicOpenApiAgent` accepts optional service overrides as a second constructor argument, so you
can swap in a custom parser/injector/executor without bypassing the facade:

```typescript
const agent = new DynamicOpenApiAgent(logger, { securityInjector });
```

## License
MIT
