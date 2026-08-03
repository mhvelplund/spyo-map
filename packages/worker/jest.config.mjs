/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@spyo-map/shared$': '<rootDir>/../shared/src/types.ts',
    '^@cloudflare/workers-types$': '<rootDir>/../../node_modules/@cloudflare/workers-types/index.d.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      isolatedModules: true,
      tsconfig: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
        esModuleInterop: true,
        verbatimModuleSyntax: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
        isolatedModules: true
      }
    }],
  },
};

export default config;
