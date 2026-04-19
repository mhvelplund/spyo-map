/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^@spyro-map/shared$': '<rootDir>/../shared/src/types.ts',
    // Intercept ApiClient's '../config.js' before the generic .js-strip mapper
    '^\\.\\./config\\.js$': '<rootDir>/tests/__mocks__/config.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }],
  },
};

export default config;
