import { ENV_VARS } from '@apify/consts';
import { addTimeoutToPromise } from '@apify/timeout';
import { Request, log } from '@crawlee/core';
import { tools } from '@apify/scraper-tools';
import { Actor } from 'apify';
import { printOutdatedSdkWarning } from 'apify/src/utils';
import semver from 'semver';
import { IncomingMessage } from 'node:http';

const { createRequestDebugInfo } = tools;

describe('Actor.isAtHome()', () => {
    test('works', () => {
        expect(Actor.isAtHome()).toBe(false);
        process.env[ENV_VARS.IS_AT_HOME] = '1';
        expect(Actor.isAtHome()).toBe(true);
        delete process.env[ENV_VARS.IS_AT_HOME];
        expect(Actor.isAtHome()).toBe(false);
    });
});

describe('Actor.newClient()', () => {
    test('reads environment variables correctly', () => {
        process.env[ENV_VARS.API_BASE_URL] = 'http://www.example.com:1234/path';
        process.env[ENV_VARS.TOKEN] = 'token';
        const client = Actor.newClient();

        expect(client.constructor.name).toBe('ApifyClient');
        expect(client.token).toBe('token');
        expect(client.baseUrl).toBe('http://www.example.com:1234/path/v2');
    });

    test('uses correct default if APIFY_API_BASE_URL is not defined', () => {
        delete process.env[ENV_VARS.API_BASE_URL];
        process.env[ENV_VARS.TOKEN] = 'token';
        const client = Actor.newClient();

        expect(client.token).toBe('token');
        expect(client.baseUrl).toBe('https://api.apify.com/v2');
    });
});

describe('printOutdatedSdkWarning()', () => {
    const currentVersion = require('../../packages/core/package.json').version; // eslint-disable-line

    test('should do nothing when ENV_VARS.SDK_LATEST_VERSION is not set', () => {
        const spy = jest.spyOn(log, 'warning');

        delete process.env[ENV_VARS.SDK_LATEST_VERSION];
        printOutdatedSdkWarning();

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    test('should do nothing when ENV_VARS.DISABLE_OUTDATED_WARNING is set', () => {
        const spy = jest.spyOn(log, 'warning');

        process.env[ENV_VARS.DISABLE_OUTDATED_WARNING] = '1';
        printOutdatedSdkWarning();

        expect(spy).not.toHaveBeenCalled();

        delete process.env[ENV_VARS.DISABLE_OUTDATED_WARNING];
        spy.mockRestore();
    });

    test('should correctly work when outdated', () => {
        const spy = jest.spyOn(log, 'warning');

        process.env[ENV_VARS.SDK_LATEST_VERSION] = semver.inc(currentVersion, 'minor');
        printOutdatedSdkWarning();

        expect(spy).toHaveBeenCalledTimes(1);

        delete process.env[ENV_VARS.SDK_LATEST_VERSION];
        spy.mockRestore();
    });

    test('should correctly work when up to date', () => {
        const spy = jest.spyOn(log, 'warning');

        process.env[ENV_VARS.SDK_LATEST_VERSION] = '0.13.0';
        printOutdatedSdkWarning();

        expect(spy).not.toHaveBeenCalled();

        delete process.env[ENV_VARS.SDK_LATEST_VERSION];
        spy.mockRestore();
    });
});

describe('addTimeoutToPromise()', () => {
    beforeAll(() => {
        jest.useFakeTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    test('should timeout', async () => {
        try {
            const p = addTimeoutToPromise(
                () => new Promise((r) => setTimeout(r, 500)),
                100,
                'Timed out.',
            );
            jest.advanceTimersByTime(101);
            await p;
            throw new Error('Wrong error.');
        } catch (err) {
            expect((err as Error).message).toBe('Timed out.');
        }
    });

    test('should not timeout too soon', async () => {
        try {
            const p = addTimeoutToPromise(
                () => new Promise((r) => setTimeout(() => r('Done'), 100)),
                500,
                'Timed out.',
            );
            jest.advanceTimersByTime(101);
            expect(await p).toBe('Done');
        } catch {
            throw new Error('This should not fail.');
        }
    });
});

describe('createRequestDebugInfo()', () => {
    test('handles Puppeteer response', () => {
        const request = {
            id: 'some-id',
            url: 'https://example.com',
            loadedUrl: 'https://example.com',
            method: 'POST',
            retryCount: 2,
            errorMessages: ['xxx'],
            someThingElse: 'xxx',
            someOther: 'yyy',
        } as unknown as Request;

        const response = {
            status: () => 201,
            another: 'yyy',
        };

        const additionalFields = {
            foo: 'bar',
        };

        expect(createRequestDebugInfo(request, response, additionalFields)).toEqual({
            requestId: 'some-id',
            url: 'https://example.com',
            loadedUrl: 'https://example.com',
            method: 'POST',
            retryCount: 2,
            errorMessages: ['xxx'],
            statusCode: 201,
            foo: 'bar',
        });
    });

    test('handles NodeJS response', () => {
        const request = {
            id: 'some-id',
            url: 'https://example.com',
            loadedUrl: 'https://example.com',
            method: 'POST',
            retryCount: 2,
            errorMessages: ['xxx'],
            someThingElse: 'xxx',
            someOther: 'yyy',
        } as unknown as Request;

        const response = {
            statusCode: 201,
            another: 'yyy',
        } as unknown as IncomingMessage;

        const additionalFields = {
            foo: 'bar',
        };

        expect(createRequestDebugInfo(request, response, additionalFields)).toEqual({
            requestId: 'some-id',
            url: 'https://example.com',
            loadedUrl: 'https://example.com',
            method: 'POST',
            retryCount: 2,
            errorMessages: ['xxx'],
            statusCode: 201,
            foo: 'bar',
        });
    });
});
