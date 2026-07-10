# Contributing to agentic-openapi

Thanks for considering a contribution. This project turns OpenAPI/Swagger specs into
AI-ready tools, with a small core (parser, security injector, executor) and pluggable
adapters on top.

## Local setup

```bash
pnpm install
pnpm dev      # tsup --watch
pnpm test     # jest
pnpm lint     # eslint src
pnpm typecheck
pnpm build
```

All four of `lint`, `typecheck`, `test`, and `build` must pass before a PR can merge — CI
runs them on every push and pull request.

## Adding a new AI adapter (e.g. OpenAI, Anthropic, MCP)

1. Create `src/adapters/<name>/<name>.adapter.ts`.
2. Extend `BaseAiAdapter` from `src/adapters/shared/base-ai-adapter.ts` — it gives you
   `this.buildSchema(parameters)`, `this.safeToolName(name)`, and `this.run(toolName, args)`.
   You only need to implement `getTools()` in the shape your target framework expects.
3. Add a barrel `src/adapters/<name>/index.ts` exporting your adapter.
4. Register a new build entry in `tsup.config.ts` and, if your adapter depends on a
   framework package (e.g. `openai`, `@anthropic-ai/sdk`), add it to `peerDependencies`
   **and** `peerDependenciesMeta` (as `optional: true`) in `package.json` — see the
   existing `ai`/`@langchain/core`/`@nestjs/common` entries as the pattern to copy.
5. Add a spec file next to your adapter covering schema generation and tool execution
   wiring.
6. Document the new adapter's usage in `README.md`.

## Adding a new auth/security strategy

Security injection is a registry of `ISecurityStrategy` implementations
(`src/services/impl/security/`), keyed by OpenAPI `securityScheme.type`. To add a new
scheme (e.g. HMAC signing, mTLS):

1. Create `src/services/impl/security/<name>.strategy.ts` implementing `ISecurityStrategy`
   (`schemeTypes`, `supportsAuthType()`, `inject()`).
2. Register it in `createDefaultSecurityStrategyRegistry()`
   (`src/services/impl/security/registry.ts`), or — if it shouldn't ship as a built-in —
   construct your own `SecurityStrategyRegistry` and pass it into
   `new OpenApiSecurityInjector(logger, myRegistry)`.
3. Add a unit test for the strategy in isolation (`supportsAuthType` gating + `inject`
   behavior), plus confirm the existing
   `src/services/impl/openapi-security.injector.spec.ts` suite still passes unmodified.

## Tests are required

New behavior must ship with a test. This repo has no coverage-threshold gate yet, so
CONTRIBUTING.md is the enforcement mechanism — PRs that add logic without a
corresponding spec file will be asked to add one before merge.

## Commit / PR expectations

- Keep PRs focused on one change; avoid bundling unrelated refactors.
- Don't change the public API surface documented in `README.md` without discussion —
  open an issue first if you think it needs to change.
