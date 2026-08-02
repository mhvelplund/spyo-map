/** @type {import('jest').Config} */
const config = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/**/*.test.ts', '!<rootDir>/tests/**/*.component.test.tsx'],
      preset: 'ts-jest/presets/default-esm',
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      moduleNameMapper: {
        '^@spyo-map/shared$': '<rootDir>/../shared/src/types.ts',
        '^\\.\\./config\\.js$': '<rootDir>/tests/__mocks__/config.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }],
      },
    },
    {
      displayName: 'components',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/**/*.test.tsx'],
      preset: 'ts-jest/presets/default-esm',
      extensionsToTreatAsEsm: ['.ts', '.tsx'],
      moduleNameMapper: {
        '^@spyo-map/shared$': '<rootDir>/../shared/src/types.ts',
        '^\\.\\./config\\.js$': '<rootDir>/tests/__mocks__/config.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '\\.css$': '<rootDir>/tests/__mocks__/styleMock.js',
      },
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.test.json' }],
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    },
  ],
};

export default config;
