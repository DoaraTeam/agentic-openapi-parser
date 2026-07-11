module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  // index.ts files are pure `export * from './x'` barrels with no logic of their own — measuring
  // "coverage" on them is noise, not a signal of test quality.
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/**/index.ts'],
  // Set with headroom below the actual coverage at the time this was added — a gate against real
  // regressions, not a ceiling to chase with low-value tests.
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 80,
      functions: 90,
      lines: 95,
    },
  },
};
