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

## 🔍 CLI — inspect a spec without writing code

```bash
npx agentic-openapi-parser inspect https://api.example.com/openapi.json
```

Prints every tool the spec would flatten into (method, derived name, path), with a warning if the
count is high enough to hurt LLM tool-selection accuracy. Useful for a quick sanity check before
wiring a spec into your code, or for deciding what to pass to `ToolFilterOptions`.

```bash
# Filter by OpenAPI tag, same as ToolFilterOptions.includeTags/excludeTags
npx agentic-openapi-parser inspect ./openapi.json --tag payments --exclude-tag internal

# Machine-readable output for piping into jq or other tooling
npx agentic-openapi-parser inspect ./openapi.json --json
```

`--tag`/`--exclude-tag` are repeatable. Run `npx agentic-openapi-parser --help` for the full list.

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

- **`executeMany` for parallel tool calls** — an LLM turn often returns several `tool_calls` at
  once (OpenAI and Anthropic both support this). `executeMany` runs them concurrently through the
  same `execute()` path — so retry, security injection, response processors, and the concurrency
  limit above all apply per call — and returns one outcome per call, in the same order they were
  given, without letting one failure affect the others:

  ```ts
  const outcomes = await agent.executeMany(spec, [
    { toolName: 'getInvoice', args: { id: 1 } },
    { toolName: 'getInvoice', args: { id: 2 } },
  ]);

  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') {
      console.log(outcome.toolName, outcome.value);
    } else {
      console.error(outcome.toolName, outcome.reason); // e.g. a ToolExecutionError
    }
  }
  ```

  This mirrors the shape of [`Promise.allSettled`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled)
  (`status`/`value`/`reason`) plus a `toolName` so you don't have to cross-reference the original
  call array by index.

---

## 📡 Observability Hooks

Production needs to know which tool is slow, which one keeps failing, and what's in flight right
now. `options.hooks` adds three synchronous callbacks, so you can wire this into OpenTelemetry,
Datadog, or a plain log line — the library has no opinion on which:

```ts
await agent.executeTool(spec, 'getInvoice', args, {
  hooks: {
    onRequestStart: ({ requestId, toolName }) => span.start(requestId, toolName),
    onRequestEnd: ({ requestId, durationMs, success, statusCode }) => span.end(requestId, { durationMs, success, statusCode }),
    onRetry: ({ toolName, attempt, statusCode, delayMs }) => metrics.increment('tool_retry', { toolName, attempt, statusCode, delayMs }),
  },
});
```

Every event for one call carries the same `requestId`, so `onRequestStart`/`onRequestEnd`/`onRetry`
can be correlated even when `executeMany` runs the same tool name concurrently more than once. A
hook that throws is caught and logged — it can never fail or slow down the actual tool call.

---

## 🔑 OAuth2 Token Management

Two `ExecuteToolOptions` hooks cover the two OAuth2 grant types this library supports end-to-end.
Both are deliberately narrow in scope — authorization_code/PKCE and refresh_token *rotation* are
left to the caller, since they involve app-specific concerns (user sessions, redirect handling)
this library has no business owning.

**`client_credentials`** (machine-to-machine, no user/redirect involved) — use
`ClientCredentialsTokenProvider` when the API itself issues short-lived tokens from a
client id/secret pair:

```ts
import { ClientCredentialsTokenProvider } from 'agentic-openapi-parser';

const accessTokenProvider = new ClientCredentialsTokenProvider({
  tokenUrl: 'https://provider.example.com/oauth/token',
  clientId: 'YOUR_CLIENT_ID',
  clientSecret: 'YOUR_CLIENT_SECRET',
  scope: 'read write', // optional
});

await agent.executeTool(spec, 'getInvoice', args, { accessTokenProvider });
```

It fetches a token on first use, caches it in memory, and transparently fetches a new one once the
cached token is within 5 minutes of expiry (`refreshThresholdMs`, configurable). Concurrent calls
while a fetch is in flight share the same request instead of hammering the token endpoint. If a
renewal fetch fails but a still-valid cached token exists, it keeps serving that token (and logs a
warning); if there's no usable token at all, `executeTool()` rejects with a clear error rather than
silently sending an unauthenticated request.

**`refresh_token`** (a user-specific token you already have, refreshed as it nears expiry) — use
`Oauth2RefreshTokenRefresher` together with `oauth2State`:

```ts
import { Oauth2RefreshTokenRefresher } from 'agentic-openapi-parser';

const tokenRefresher = new Oauth2RefreshTokenRefresher({
  onRefreshed: (newState) => saveTokenToYourDatabase(newState), // fire-and-forget
});

await agent.executeTool(spec, 'getInvoice', args, {
  accessToken: currentAccessToken,
  tokenRefresher,
  oauth2State: { accessToken: currentAccessToken, refreshToken, tokenUrl, tokenExpiresAt, clientId, clientSecret },
});
```

If both `accessTokenProvider` and `tokenRefresher`/`oauth2State` are set, `accessTokenProvider`
wins — they model different grant types and aren't meant to be combined on the same call.

---

## ✂️ Response Shaping

Two composable `ResponseProcessor`s (same pipeline as `TruncateResponseProcessor`) address the two
distinct causes of oversized tool responses:

**`JmesPathSelectProcessor`** — pick out / reshape only the fields the LLM actually needs, using a
[JMESPath](https://jmespath.org) expression:

```ts
import { JmesPathSelectProcessor } from 'agentic-openapi-parser';

await agent.executeTool(spec, 'listOrders', args, {
  responseProcessors: [new JmesPathSelectProcessor('orders[*].{id: id, total: total, status: status}')],
});
```

JMESPath, not JSONPath, on purpose: it's a fully declarative query language with no script/filter
syntax that can evaluate arbitrary code — this matters because the expression may end up coming
from semi-trusted, caller-supplied config rather than only from a developer's own source. A
malformed expression throws immediately (it's a configuration bug, not a transient failure) rather
than silently passing the response through unshaped.

**`MaxBytesResponseProcessor`** — a last-resort cap on the total serialized response size,
independent of `TruncateResponseProcessor` (which bounds individual strings/arrays, not the whole
payload):

```ts
import { MaxBytesResponseProcessor } from 'agentic-openapi-parser';

await agent.executeTool(spec, 'getReport', args, {
  responseProcessors: [new MaxBytesResponseProcessor(50 * 1024)], // default is 50 KB
});
```

Over the limit, it returns `{ truncated: true, originalSizeBytes, maxBytes, preview }` instead of
the raw value — `preview` is cut at a byte-accurate boundary that never splits a multi-byte UTF-8
character. Order processors deliberately: put `JmesPathSelectProcessor` first to shrink the payload
semantically, `MaxBytesResponseProcessor` last as the final safety net.

A processor that throws (a bad JMESPath expression, a bug in your own custom processor) surfaces as
its own error — it is never mislabeled as a failed HTTP request, since post-processing runs outside
the request/retry error handling.

---

## 🔎 Semantic Tool Search

`ToolFilterOptions` (see "Tool Filtering" above) is a *static* filter — the same rules
apply to every request. Once a spec is large enough (100-200+ tools) that no single static filter
serves every user intent well, `SemanticToolIndex` ranks tools by similarity to the specific query
at hand instead:

```ts
import { SemanticToolIndex } from 'agentic-openapi-parser';

// Bring your own embedding call — SemanticToolIndex has no opinion on which provider you use.
const embeddingProvider = {
  embed: async (texts: string[]) => {
    const response = await openai.embeddings.create({ model: 'text-embedding-3-small', input: texts });
    return response.data.map((d) => d.embedding);
  },
};

const { tools } = await agent.parseAndFlatten('https://api.example.com/openapi.json');
const index = new SemanticToolIndex(embeddingProvider);
await index.build(tools); // embeds every tool once

const relevantTools = await index.search('refund a customer payment', 10); // top 10 by cosine similarity
const adapter = new LangchainToolAdapter(agent.getExecutor(), spec, relevantTools);
```

`SemanticToolIndex` deliberately never calls an embedding API itself — `EmbeddingProvider` is the
same bring-your-own-X pattern used for OAuth2 tokens and response processors, so this library isn't
hard-wired to OpenAI, Cohere, or any specific model. It owns only what's genuinely fiddly to get
right: embedding each tool exactly once, and ranking many `search()` calls against that index by
cosine similarity without re-embedding anything. By default each tool is embedded as
`"name description tag1 tag2 ..."` — pass `buildText` to customize that.

---

## 🧪 Testing Helpers

Code that wires an adapter (Langchain, Vercel AI, MCP, OpenAI, Anthropic) to this library still
needs a `IDynamicToolExecutorService` to construct it. `createMockExecutor` fakes one from a plain
map of tool name → response, so a consumer's own tests don't need a real spec, a real HTTP call, or
mocking this library's internals directly:

```ts
import { createMockExecutor } from 'agentic-openapi-parser/testing';
import { LangchainToolAdapter } from 'agentic-openapi-parser/adapters/langchain';

const executor = createMockExecutor({
  getPet: { id: 1, name: 'Rex' },
  createPet: (args: Record<string, unknown>) => ({ id: 99, ...args }),
  deletePet: new Error('upstream 500'), // simulates a failed tool call
});

const adapter = new LangchainToolAdapter(executor, spec, tools);
// ...invoke a tool through the adapter, then assert on executor.calls:
expect(executor.calls).toEqual([{ toolName: 'getPet', args: { petId: 1 }, options: undefined }]);
```

A tool name missing from the response map throws the same `ToolNotFoundError` the real executor
would, so error-path tests stay realistic. A response can be a static value, a `(args, options) =>
value` function for dynamic responses, or an `Error` instance to simulate a failed call.

If instead you want to test this library's *own* HTTP behavior (retries, timeouts, real request
shape) rather than mock it away, intercept at the HTTP layer with
[`nock`](https://github.com/nock/nock), [`msw`](https://mswjs.io/), or
[`axios-mock-adapter`](https://github.com/ctimmerm/axios-mock-adapter) instead — `createMockExecutor`
is deliberately for the opposite case, where the executor itself is a dependency you want to stub out.

---

## 🚨 Error Handling

Every error this library throws deliberately extends `AgenticOpenApiError` (itself a real
`Error`), instead of a generic `new Error(message)` a consumer can only distinguish by parsing the
message string:

```ts
import { AgenticOpenApiError, ToolNotFoundError, ToolExecutionError } from 'agentic-openapi-parser';

try {
  await agent.executeTool(spec, 'getInvoice', args);
} catch (error) {
  if (error instanceof ToolNotFoundError) {
    console.error(`No such tool: ${error.toolName}`);
  } else if (error instanceof ToolExecutionError) {
    console.error(`API call failed with status ${error.statusCode}`, error.responseData);
  } else if (error instanceof AgenticOpenApiError) {
    console.error('Something else this library rejected on purpose:', error.message);
  } else {
    throw error; // a genuinely unexpected bug — don't swallow it
  }
}
```

| Class | Thrown by | Structured fields |
|---|---|---|
| `SpecParseError` | `parseAndFlatten()` when the spec can't be fetched/dereferenced | `apiSpecUrl` |
| `ToolNotFoundError` | `executeTool()` / a native adapter's `executeToolCall()`, unknown tool name | `toolName` |
| `ToolExecutionError` | `executeTool()`, the HTTP request itself failed | `statusCode`, `responseData` |
| `ResponseProcessingError` | `executeTool()`, a `ResponseProcessor` threw | `processorName` |
| `AccessTokenError` | `ClientCredentialsTokenProvider`, no usable token could be obtained | — |
| `EmbeddingProviderError` | `SemanticToolIndex`, the supplied `EmbeddingProvider` misbehaved | — |

Every subclass also carries the original failure via the standard [`cause`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause)
property (`error.cause`), so nothing is lost by wrapping.

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
