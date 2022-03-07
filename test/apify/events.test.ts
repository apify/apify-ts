import { ENV_VARS } from '@apify/consts';
import { ACTOR_EVENT_NAMES_EX, events, initializeEvents, stopEvents } from '@crawlers/core';
import { Dictionary, sleep } from '@crawlers/utils';
import { Actor } from 'apify';
import WebSocket from 'ws';

describe('events', () => {
    let wss: WebSocket.Server = null;

    beforeEach(() => {
        wss = new WebSocket.Server({ port: 9099 });
        jest.useFakeTimers();
        process.env[ENV_VARS.ACTOR_EVENTS_WS_URL] = 'ws://localhost:9099/someRunId';
        process.env[ENV_VARS.TOKEN] = 'dummy';
    });
    afterEach((done) => {
        jest.useRealTimers();
        delete process.env[ENV_VARS.ACTOR_EVENTS_WS_URL];
        delete process.env[ENV_VARS.TOKEN];
        events.removeAllListeners();
        wss.close(done);
    });

    test('is there and works as EventEmitter', async () => {
        const arg = await new Promise((resolve, reject) => {
            try {
                events.on('foo', resolve);
                events.emit('foo', 'test event');
            } catch (e) {
                reject(e);
            }
        });
        expect(arg).toBe('test event');
    });

    test('should work in main()', (done) => {
        let wsClosed = false;
        const isWsConnected = new Promise((resolve) => {
            wss.on('connection', (ws, req) => {
                ws.on('close', () => {
                    wsClosed = true;
                });
                resolve(ws);

                expect(req.url).toBe('/someRunId');

                const send = (obj: Dictionary) => ws.send(JSON.stringify(obj));

                setTimeout(() => send({ name: 'name-1', data: [1, 2, 3] }), 50);
                setTimeout(() => send({ name: 'name-1', data: { foo: 'bar' } }), 100);
                setTimeout(() => send({ name: 'name-2', data: [1] }), 50);
                setTimeout(() => send({ name: 'name-2', data: [2] }), 50);
            });
        });

        const eventsReceived: unknown[] = [];
        // Run main and store received events
        expect(wsClosed).toBe(false);
        Actor.main(async () => {
            await isWsConnected;
            events.on('name-1', (data) => eventsReceived.push(data));
            jest.advanceTimersByTime(150);
            jest.useRealTimers();
            await sleep(10);
        });

        // Main will call process.exit() so we must stub it.
        const exitSpy = jest.spyOn(process, 'exit');
        exitSpy.mockImplementationOnce((code?: number) => {
            expect(code).toBe(0);
            expect(eventsReceived).toEqual([[1, 2, 3], { foo: 'bar' }]);

            // Cleanup.
            jest.useRealTimers();
            wss.close(async () => {
                await sleep(10); // Here must be short sleep to get following line to later tick
                expect(wsClosed).toBe(true);
                done();
            });

            return 0 as never;
        });
    }, 60e3);

    test('should work without main()', async () => {
        let wsClosed = false;
        let finish: (value?: unknown) => void;
        const closePromise = new Promise((resolve) => {
            finish = resolve;
        });
        const isWsConnected = new Promise((resolve) => {
            wss.on('connection', (ws, req) => {
                ws.on('close', () => {
                    wsClosed = true;
                    finish();
                });
                resolve(ws);

                expect(req.url).toBe('/someRunId');

                const send = (obj: Dictionary) => ws.send(JSON.stringify(obj));

                setTimeout(() => send({ name: 'name-1', data: [1, 2, 3] }), 50);
                setTimeout(() => send({ name: 'name-1', data: { foo: 'bar' } }), 100);
                setTimeout(() => send({ name: 'name-2', data: [1] }), 50);
                setTimeout(() => send({ name: 'name-2', data: [2] }), 50);
            });
        });

        const eventsReceived: unknown[] = [];
        // Connect to websocket and receive events.
        expect(wsClosed).toBe(false);
        await initializeEvents();
        await isWsConnected;
        events.on('name-1', (data) => eventsReceived.push(data));
        jest.advanceTimersByTime(150);
        jest.useRealTimers();
        await sleep(10);

        expect(eventsReceived).toEqual([[1, 2, 3], { foo: 'bar' }]);

        expect(wsClosed).toBe(false);
        stopEvents();
        await closePromise;
        expect(wsClosed).toBe(true);

        // Due to some race condition or leaks in this test implementation with shared static register of events,
        // this test sometimes ends without actually closing the WS connection, resulting in failures of the following
        // test that will reuse the existing ws connection instead of new one. Short wait helps to mitigate that.
        await sleep(10);
    });

    test('should send persist state events in regular interval', () => {
        const eventsReceived = [];
        events.on(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, (data) => eventsReceived.push(data));
        initializeEvents();
        jest.advanceTimersByTime(60001);
        jest.advanceTimersByTime(60001);
        jest.advanceTimersByTime(60001);
        stopEvents();
        expect(eventsReceived.length).toBe(3);
    });
});
