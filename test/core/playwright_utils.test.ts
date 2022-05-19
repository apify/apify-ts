import playwright from 'playwright';
import express from 'express';
import log from '@apify/log';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { Configuration, Request, playwrightUtils } from '@crawlee/playwright';
import { StorageTestCases } from 'test/shared/test-cases';
import { startExpressAppPromise } from '../shared/_helper';

const HOSTNAME = '127.0.0.1';
let port: number;
let server: Server;

beforeAll(async () => {
    const app = express();

    app.get('/getRawHeaders', (req, res) => {
        res.send(JSON.stringify(req.rawHeaders));
    });

    app.all('/foo', (req, res) => {
        res.json({
            headers: req.headers,
            method: req.method,
            bodyLength: +req.headers['content-length'] || 0,
        });
    });

    server = await startExpressAppPromise(app, 0);
    port = (server.address() as AddressInfo).port;
});

afterAll(() => {
    server.close();
});

describe.each(StorageTestCases)('Apify.utils.playwright - %s', (Emulator) => {
    let ll: number;
    const localStorageEmulator = new Emulator();

    beforeAll(async () => {
        ll = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    beforeEach(async () => {
        await localStorageEmulator.init();
    });

    afterAll(async () => {
        log.setLevel(ll);
        await localStorageEmulator.destroy();
    });

    test('gotoExtended() works', async () => {
        const browser = await playwright.chromium.launch({ headless: true });

        try {
            const page = await browser.newPage();
            const request = new Request({
                url: `http://${HOSTNAME}:${port}/foo`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                },
                payload: '{ "foo": "bar" }',
            });

            const response = await playwrightUtils.gotoExtended(page, request);

            const { method, headers, bodyLength } = JSON.parse(await response.text());
            expect(method).toBe('POST');
            expect(bodyLength).toBe(16);
            expect(headers['content-type']).toBe('application/json; charset=utf-8');
        } finally {
            await browser.close();
        }
    }, 60_000);
});
