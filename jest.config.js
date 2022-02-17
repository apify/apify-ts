module.exports = {
    testTimeout: 60e3,
    maxWorkers: 3,
    preset: 'ts-jest',
    testEnvironment: 'node',
    collectCoverage: false,
    testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
    transform: {
        '^.+\\.ts$': 'ts-jest',
    },
    collectCoverageFrom: [
        '<rootDir>/packages/*/src/**/*.[jt]s',
    ],
    moduleNameMapper: {
        '^apify$': '<rootDir>/packages/apify/src',
        '^@apify/scraper-tools$': '<rootDir>/packages/scraper-tools/src',
        '^crawlers$': '<rootDir>/packages/crawlers/src',
        '^@crawlers/basic$': '<rootDir>/packages/basic-crawler/src',
        '^@crawlers/browser$': '<rootDir>/packages/browser-crawler/src',
        '^@crawlers/cheerio$': '<rootDir>/packages/cheerio-crawler/src',
        '^@crawlers/playwright$': '<rootDir>/packages/playwright-crawler/src',
        '^@crawlers/puppeteer$': '<rootDir>/packages/puppeteer-crawler/src',
        '^@crawlers/(.*)/(.*)$': '<rootDir>/packages/$1/$2',
        '^@crawlers/(.*)$': '<rootDir>/packages/$1/src',
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
