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

If you plan to use the AI Adapters, install the peer dependencies:
```bash
npm install zod @langchain/core ai
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

---

## 🔒 Security & Logging

This library implements robust safety checks:
- **Zero Console.log:** Uses `pino` logger via DI to ensure structured, production-ready logging.
- **Token Masking:** Securely masks API keys and Bearer tokens in logs (`Bearer my-s******oken`) to prevent credential leakage.
- **Strict Null Checks:** Enforces strict array and object indexing to prevent runtime crashes from malformed specs.

## License
MIT
