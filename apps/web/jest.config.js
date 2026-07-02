/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    setupFiles: ['<rootDir>/jest.setup.ts'],
    moduleNameMapper: {
        '^@/lib/db$': '<rootDir>/../../packages/api/src/db/index.ts',
        '^@/lib/db/(.*)$': '<rootDir>/../../packages/api/src/db/$1',
        '^@/lib/services/(.*)$': '<rootDir>/../../packages/api/src/services/$1',
        '^@/lib/validations$': '<rootDir>/../../packages/api/src/validations.ts',
        '^@/lib/config/limits$': '<rootDir>/../../packages/api/src/config/limits.ts',
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
            diagnostics: false,
        }],
    },
    collectCoverageFrom: [
        'src/lib/tenant/isolation.ts',
        'src/lib/observability/logger.ts',
        '../../packages/api/src/db/index.ts',
        '../../packages/api/src/validations.ts',
        '../../packages/api/src/services/storage.ts',
    ],
    coverageProvider: 'v8',
    coverageReporters: ['text', 'lcov', 'json-summary'],
    coverageDirectory: 'coverage',
};
