module.exports = {
    testTimeout: 60e3,
    maxWorkers: 3,
    preset: 'ts-jest',
    testEnvironment: 'node',
    testRunner: 'jest-circus/runner',
    collectCoverage: false,
    testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
    transform: {
        '^.+\\.ts$': 'ts-jest',
        '^.+\\.js$': 'babel-jest',
    },
    collectCoverageFrom: [
        '<rootDir>/packages/*/src/**/*.[jt]s',
    ],
    moduleNameMapper: {
    },
    modulePathIgnorePatterns: [
        'dist/package.json',
        '<rootDir>/package.json',
    ],
    globals: {
        'ts-jest': {
            tsconfig: 'test/tsconfig.json',
        },
    },
};
