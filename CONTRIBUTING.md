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

A git `pre-commit` hook (via husky, installed automatically by `pnpm install`'s `prepare`
script) runs `typecheck`, `lint`, and `test` on every commit — a commit is rejected if any of
them fail, including on unused/dead imports (`@typescript-eslint/no-unused-vars` is an error,
not a warning). There's no way to skip this locally except `git commit --no-verify`, which
should not be used routinely.

## Commit messages

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat: ...`, `fix: ...`, `refactor: ...`, `test: ...`, `docs: ...`, `chore: ...`), enforced by
a `commit-msg` hook via commitlint. Examples already in this repo's history:

```
feat: add MCP adapter (McpToolAdapter)
fix: match slack-be's exact description text for type:file with no prior description
refactor: restructure services/ by domain instead of by layer
test: add security-injector parity cases matching slack-be orchestration
```

## Publishing

Publishing is automated via `.github/workflows/publish.yml` — it triggers on any pushed tag
matching `v*.*.*`, re-runs lint/typecheck/test/build, verifies the tag matches
`package.json`'s version, then runs `npm publish` using the `NPM_TOKEN` repo secret. Nobody
should run `npm publish` by hand.

To release a new version:

```bash
git checkout main && git pull
npm version patch   # or minor / major — bumps package.json, commits, and tags
git push && git push --tags
```

A `prepublishOnly` script (`scripts/assert-main-branch.js`) also blocks a manual/local
`npm publish` unless run from `main`, as a second line of defense.

## Adding a new AI adapter (e.g. OpenAI, Anthropic, MCP)

There are two base classes depending on what the target actually needs:

- **`BaseAiAdapter`** (`src/adapters/shared/base-ai-adapter.ts`) — for frameworks that consume a
  Zod schema (Langchain, Vercel AI). Gives you `this.buildSchema(toolDef)`,
  `this.safeToolName(name)`, and `this.run(toolName, args)`; implement `getTools()`.
- **`BaseNativeToolAdapter<TTool>`** (`src/adapters/shared/base-native-tool-adapter.ts`) — for
  providers whose tool format is plain JSON with no SDK types needed (OpenAI, Anthropic). It
  already implements `getTools()` and `executeToolCall(name, args)` (mapping the provider's
  echoed tool name back to the right OpenAPI operation); you only implement
  `buildTool(name, toolDef)` to serialize one tool into the provider's wire format. If your
  target genuinely needs no SDK import, this base class means the adapter needs **no new peer
  dependency at all** — see `src/adapters/openai/openai.adapter.ts` for the pattern.

Either way:

1. Create `src/adapters/<name>/<name>.adapter.ts`.
2. Add a barrel `src/adapters/<name>/index.ts` exporting your adapter.
3. Register a new build entry in `tsup.config.ts` and, if (and only if) your adapter depends on
   a framework package (e.g. `@langchain/core`, `@modelcontextprotocol/sdk`), add it to
   `peerDependencies` **and** `peerDependenciesMeta` (as `optional: true`) in `package.json` —
   see the existing `ai`/`@langchain/core`/`@nestjs/common` entries as the pattern to copy.
4. Add a spec file next to your adapter covering schema generation and tool execution
   wiring.
5. Document the new adapter's usage in `README.md`.

## Adding a new auth/security strategy

Security injection is a registry of `ISecurityStrategy` implementations
(`src/services/security/strategies/`), keyed by OpenAPI `securityScheme.type`. To add a new
scheme (e.g. HMAC signing, mTLS):

1. Create `src/services/security/strategies/<name>.strategy.ts` implementing `ISecurityStrategy`
   (`schemeTypes`, `supportsAuthType()`, `inject()`).
2. Register it in `createDefaultSecurityStrategyRegistry()`
   (`src/services/security/registry.ts`), or — if it shouldn't ship as a built-in —
   construct your own `SecurityStrategyRegistry` and pass it into
   `new OpenApiSecurityInjector(logger, myRegistry)`.
3. Add a unit test for the strategy in isolation (`supportsAuthType` gating + `inject`
   behavior), plus confirm the existing
   `src/services/security/openapi-security.injector.spec.ts` suite still passes unmodified.

## Tests are required

New behavior must ship with a test. This repo has no coverage-threshold gate yet, so
CONTRIBUTING.md is the enforcement mechanism — PRs that add logic without a
corresponding spec file will be asked to add one before merge.

## Commit / PR expectations

- Keep PRs focused on one change; avoid bundling unrelated refactors.
- Don't change the public API surface documented in `README.md` without discussion —
  open an issue first if you think it needs to change.
