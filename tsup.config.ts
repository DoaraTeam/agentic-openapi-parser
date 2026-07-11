import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/services/index.ts',
    'src/types/index.ts',
    'src/utils/index.ts',
    'src/adapters/nestjs/index.ts',
    'src/adapters/langchain/index.ts',
    'src/adapters/vercel-ai/index.ts',
    'src/adapters/mcp/index.ts',
    'src/adapters/openai/index.ts',
    'src/adapters/anthropic/index.ts',
    'src/adapters/shared/index.ts',
    'src/cli/index.ts',
    'src/testing/index.ts'
  ],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  target: 'es2022',
  skipNodeModulesBundle: true,
});
