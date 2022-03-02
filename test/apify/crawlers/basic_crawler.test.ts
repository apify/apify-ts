import _ from 'underscore';
import sinon from 'sinon';
import { ACTOR_EVENT_NAMES } from '@apify/consts';
import log from '@apify/log';
import {
    CrawlingContext,
    Dictionary,
    FailedRequestHandler,
    RequestHandler,
    Request,
    QueueOperationInfo,
    RequestQueue,
    RequestList,
    events,
    Configuration,
    BasicCrawler,
    KeyValueStore,
} from 'crawlers';
import { sleep } from '@crawlers/utils';
import LocalStorageDirEmulator from '../local_storage_dir_emulator';

describe('BasicCrawler', () => {
    let logLevel: number;
    let localStorageEmulator: LocalStorageDirEmulator;

    beforeAll(async () => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.OFF);
        localStorageEmulator = new LocalStorageDirEmulator();
    });

    beforeEach(async () => {
        const storageDir = await localStorageEmulator.init();
        Configuration.getGlobalConfig().set('localStorageDir', storageDir);
    });

    afterAll(async () => {
        await localStorageEmulator.destroy();
        log.setLevel(logLevel);
    });

    test('should run in parallel thru all the requests', async () => {
        const sources = _.range(0, 500).map((index) => ({ url: `https://example.com/${index}` }));
        const sourcesCopy = JSON.parse(JSON.stringify(sources));

        const processed: { url: string }[] = [];
        const requestList = new RequestList({ sources });
        const handleRequestFunction: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed.push(_.pick(request, 'url'));
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            minConcurrency: 25,
            maxConcurrency: 25,
            handleRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(basicCrawler.autoscaledPool.minConcurrency).toBe(25);
        expect(processed).toEqual(sourcesCopy);
        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
    });

    const { MIGRATING, ABORTING } = ACTOR_EVENT_NAMES;

    test.each([MIGRATING, ABORTING])('should pause on %s event and persist RequestList state', async (event) => {
        const sources = _.range(500).map((index) => ({ url: `https://example.com/${index + 1}` }));

        let persistResolve: (value?: unknown) => void;
        const persistPromise = new Promise((res) => { persistResolve = res; });

        // Mock the calls to persist sources.
        const getValueSpy = jest.spyOn(KeyValueStore.prototype, 'getValue');
        const setValueSpy = jest.spyOn(KeyValueStore.prototype, 'setValue');
        getValueSpy.mockResolvedValue(null);

        const processed: { url: string }[] = [];
        const requestList = await RequestList.open('reqList', sources);
        const handleRequestFunction: RequestHandler = async ({ request }) => {
            if (request.url.endsWith('200')) events.emit(event);
            processed.push(_.pick(request, 'url'));
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            minConcurrency: 25,
            maxConcurrency: 25,
            handleRequestFunction,
        });

        let finished = false;
        // Mock the call to persist state.
        setValueSpy.mockImplementationOnce(persistResolve as any);
        // The crawler will pause after 200 requests
        const runPromise = basicCrawler.run();
        runPromise.then(() => { finished = true; });

        // need to monkeypatch the stats class, otherwise it will never finish
        basicCrawler.stats.persistState = () => Promise.resolve();
        await persistPromise;

        expect(finished).toBe(false);
        expect(await requestList.isFinished()).toBe(false);
        expect(await requestList.isEmpty()).toBe(false);
        expect(processed.length).toBe(200);

        expect(getValueSpy).toBeCalled();
        expect(setValueSpy).toBeCalled();

        // clean up
        // @ts-expect-error Accessing private method
        await basicCrawler.autoscaledPool._destroy(); // eslint-disable-line no-underscore-dangle
        getValueSpy.mockRestore();
        setValueSpy.mockRestore();
    });

    test('should retry failed requests', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
        ];
        const processed: Dictionary<Request> = {};
        const requestList = new RequestList({ sources });

        const handleRequestFunction: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;

            if (request.url === 'http://example.com/2') {
                throw Error(`This is ${request.retryCount}th error!`);
            }

            request.userData.foo = 'bar';
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            maxRequestRetries: 10,
            minConcurrency: 3,
            maxConcurrency: 3,
            handleRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(processed['http://example.com/1'].userData.foo).toBe('bar');
        expect(processed['http://example.com/1'].errorMessages).toEqual([]);
        expect(processed['http://example.com/1'].retryCount).toBe(0);
        expect(processed['http://example.com/3'].userData.foo).toBe('bar');
        expect(processed['http://example.com/3'].errorMessages).toEqual([]);
        expect(processed['http://example.com/3'].retryCount).toBe(0);

        expect(processed['http://example.com/2'].userData.foo).toBeUndefined();
        expect(processed['http://example.com/2'].errorMessages).toHaveLength(11);
        expect(processed['http://example.com/2'].retryCount).toBe(10);

        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
    });

    test('should not retry requests with noRetry set to true ', async () => {
        const noRetryRequest = new Request({ url: 'http://example.com/3' });
        noRetryRequest.noRetry = true;

        const sources = [
            { url: 'http://example.com/1', noRetry: true },
            { url: 'http://example.com/2' },
            noRetryRequest,
        ];
        const processed: Dictionary<Request> = {};
        const requestList = new RequestList({ sources });

        const handleRequestFunction: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;
            request.userData.foo = 'bar';
            throw Error(`This is ${request.retryCount}th error!`);
        };

        let handleFailedRequestFunctionCalls = 0;
        const handleFailedRequestFunction = async () => {
            handleFailedRequestFunctionCalls++;
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            maxRequestRetries: 10,
            minConcurrency: 3,
            maxConcurrency: 3,
            handleRequestFunction,
            handleFailedRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(processed['http://example.com/1'].userData.foo).toBe('bar');
        expect(processed['http://example.com/1'].errorMessages).toHaveLength(1);
        expect(processed['http://example.com/1'].retryCount).toBe(0);
        expect(processed['http://example.com/3'].userData.foo).toBe('bar');
        expect(processed['http://example.com/3'].errorMessages).toHaveLength(1);
        expect(processed['http://example.com/3'].retryCount).toBe(0);

        expect(processed['http://example.com/2'].userData.foo).toBe('bar');
        expect(processed['http://example.com/2'].errorMessages).toHaveLength(11);
        expect(processed['http://example.com/2'].retryCount).toBe(10);

        expect(handleFailedRequestFunctionCalls).toBe(3);

        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
    });

    test('should allow to handle failed requests', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
        ];
        const processed: Dictionary<Request> = {};
        const failed: Dictionary<Request> = {};
        const errors: Error[] = [];
        const requestList = new RequestList({ sources });

        const handleRequestFunction: RequestHandler = async ({ request }) => {
            await Promise.reject(new Error('some-error'));
            processed[request.url] = request;
        };

        const handleFailedRequestFunction: FailedRequestHandler = async ({ request, error }) => {
            failed[request.url] = request;
            errors.push(error);
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            handleRequestFunction,
            handleFailedRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(failed['http://example.com/1'].errorMessages).toHaveLength(4);
        expect(failed['http://example.com/1'].retryCount).toBe(3);
        expect(failed['http://example.com/2'].errorMessages).toHaveLength(4);
        expect(failed['http://example.com/2'].retryCount).toBe(3);
        expect(failed['http://example.com/3'].errorMessages).toHaveLength(4);
        expect(failed['http://example.com/3'].retryCount).toBe(3);
        expect(Object.values(failed)).toHaveLength(3);
        expect(Object.values(processed)).toHaveLength(0);
        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);
        errors.forEach((error) => expect(error).toBeInstanceOf(Error));
    });

    test('should require at least one of RequestQueue and RequestList', () => {
        const requestList = new RequestList({ sources: [] });
        const requestQueue = new RequestQueue({ id: 'xxx', client: Configuration.getDefaultClient() });
        const handleRequestFunction = async () => {};

        expect(() => new BasicCrawler({ handleRequestFunction })).toThrowError();
        expect(() => new BasicCrawler({ handleRequestFunction, requestList })).not.toThrowError();
        expect(() => new BasicCrawler({ handleRequestFunction, requestQueue })).not.toThrowError();
        expect(() => new BasicCrawler({ handleRequestFunction, requestQueue, requestList })).not.toThrowError();
    });

    test('should correctly combine RequestList and RequestQueue', async () => {
        const sources = [
            { url: 'http://example.com/0' },
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
        ];
        const processed: Dictionary<Request> = {};
        const requestList = new RequestList({ sources });
        const requestQueue = new RequestQueue({ id: 'xxx', client: Configuration.getDefaultClient() });

        const handleRequestFunction: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;

            if (request.url === 'http://example.com/1') {
                throw Error(`This is ${request.retryCount}th error!`);
            }

            request.userData.foo = 'bar';
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            requestQueue,
            maxRequestRetries: 3,
            minConcurrency: 1,
            maxConcurrency: 1,
            handleRequestFunction,
        });

        // It enqueues all requests from RequestList to RequestQueue.
        const mock = sinon.mock(requestQueue);
        mock.expects('handledCount')
            .once()
            .returns(Promise.resolve(0));
        mock.expects('addRequest')
            .once()
            .withArgs(new Request(sources[0]), { forefront: true })
            .returns(Promise.resolve({ requestId: 'id-0' }));
        mock.expects('addRequest')
            .once()
            .withArgs(new Request(sources[1]), { forefront: true })
            .returns(Promise.resolve({ requestId: 'id-1' }));
        mock.expects('addRequest')
            .once()
            .withArgs(new Request(sources[2]), { forefront: true })
            .returns(Promise.resolve({ requestId: 'id-2' }));

        const request0 = new Request({ id: 'id-0', ...sources[0] });
        const request1 = new Request({ id: 'id-1', ...sources[1] });
        const request2 = new Request({ id: 'id-2', ...sources[2] });

        // 1st try
        mock.expects('fetchNextRequest').once().returns(Promise.resolve(request0));
        mock.expects('fetchNextRequest').once().returns(Promise.resolve(request1));
        mock.expects('fetchNextRequest').once().returns(Promise.resolve(request2));
        mock.expects('markRequestHandled')
            .once()
            .withArgs(request0)
            .returns(Promise.resolve());
        mock.expects('reclaimRequest')
            .once()
            .withArgs(request1)
            .returns(Promise.resolve());
        mock.expects('markRequestHandled')
            .once()
            .withArgs(request2)
            .returns(Promise.resolve());

        // 2nd try
        mock.expects('fetchNextRequest')
            .once()
            .returns(Promise.resolve(request1));
        mock.expects('reclaimRequest')
            .once()
            .withArgs(request1)
            .returns(Promise.resolve());

        // 3rd try
        mock.expects('fetchNextRequest')
            .once()
            .returns(Promise.resolve(request1));
        mock.expects('reclaimRequest')
            .once()
            .withArgs(request1)
            .returns(Promise.resolve());

        // 4rd try
        mock.expects('fetchNextRequest')
            .once()
            .returns(Promise.resolve(request1));
        mock.expects('markRequestHandled')
            .once()
            .withArgs(request1)
            .returns(Promise.resolve());

        mock.expects('isEmpty')
            .exactly(3)
            .returns(Promise.resolve(false));
        mock.expects('isEmpty')
            .once()
            .returns(Promise.resolve(true));
        mock.expects('isFinished')
            .once()
            .returns(Promise.resolve(true));

        await requestList.initialize();
        await basicCrawler.run();

        expect(processed['http://example.com/0'].userData.foo).toBe('bar');
        expect(processed['http://example.com/0'].errorMessages).toEqual([]);
        expect(processed['http://example.com/0'].retryCount).toBe(0);
        expect(processed['http://example.com/2'].userData.foo).toBe('bar');
        expect(processed['http://example.com/2'].errorMessages).toEqual([]);
        expect(processed['http://example.com/2'].retryCount).toBe(0);

        expect(processed['http://example.com/1'].userData.foo).toBeUndefined();
        expect(processed['http://example.com/1'].errorMessages).toHaveLength(4);
        expect(processed['http://example.com/1'].retryCount).toBe(3);

        expect(await requestList.isFinished()).toBe(true);
        expect(await requestList.isEmpty()).toBe(true);

        mock.verify();
    });

    test('should say that task is not ready requestList is not set and requestQueue is empty', async () => {
        const requestQueue = new RequestQueue({ id: 'xxx', client: Configuration.getDefaultClient() });
        requestQueue.isEmpty = () => Promise.resolve(true);

        const crawler = new BasicCrawler({
            requestQueue,
            handleRequestFunction: async () => {},
        });

        // @ts-expect-error Accessing private prop
        expect(await crawler._isTaskReadyFunction()).toBe(false); // eslint-disable-line no-underscore-dangle
    });

    test('should be possible to override isFinishedFunction of underlying AutoscaledPool', async () => {
        const requestQueue = new RequestQueue({ id: 'xxx', client: Configuration.getDefaultClient() });
        const processed: Request[] = [];
        const queue: Request[] = [];
        let isFinished = false;

        const basicCrawler = new BasicCrawler({
            requestQueue,
            autoscaledPoolOptions: {
                minConcurrency: 1,
                maxConcurrency: 1,
                isFinishedFunction: () => {
                    return Promise.resolve(isFinished);
                },
            },
            handleRequestFunction: async ({ request }) => {
                await sleep(10);
                processed.push(request);
            },
        });

        // Speed up the test
        // @ts-expect-error Accessing private prop
        basicCrawler.autoscaledPoolOptions.maybeRunIntervalSecs = 0.05;

        const request0 = new Request({ url: 'http://example.com/0' });
        const request1 = new Request({ url: 'http://example.com/1' });

        const mock = sinon.mock(requestQueue);
        mock.expects('handledCount').once().returns(Promise.resolve());
        mock.expects('markRequestHandled').once().withArgs(request0).returns(Promise.resolve());
        mock.expects('markRequestHandled').once().withArgs(request1).returns(Promise.resolve());
        mock.expects('isFinished').never();
        requestQueue.fetchNextRequest = () => Promise.resolve(queue.pop());
        requestQueue.isEmpty = () => Promise.resolve(!queue.length);

        setTimeout(() => queue.push(request0), 10);
        setTimeout(() => queue.push(request1), 100);
        setTimeout(() => { isFinished = true; }, 150);

        await basicCrawler.run();

        // TODO: see why the request1 was passed as a second parameter to includes
        expect(processed.includes(request0)).toBe(true);

        mock.verify();
        sinon.restore();
    });

    test('should support maxRequestsPerCrawl parameter', async () => {
        const sources = [
            { url: 'http://example.com/1' },
            { url: 'http://example.com/2' },
            { url: 'http://example.com/3' },
            { url: 'http://example.com/4' },
            { url: 'http://example.com/5' },
        ];
        const processed: Dictionary<Request> = {};
        const requestList = new RequestList({ sources });

        const handleRequestFunction: RequestHandler = async ({ request }) => {
            await sleep(10);
            processed[request.url] = request;
            if (request.url === 'http://example.com/2') throw Error();
            request.userData.foo = 'bar';
        };

        let handleFailedRequestFunctionCalls = 0;
        const handleFailedRequestFunction = async () => {
            handleFailedRequestFunctionCalls++;
        };

        const basicCrawler = new BasicCrawler({
            requestList,
            maxRequestRetries: 3,
            maxRequestsPerCrawl: 3,
            maxConcurrency: 1,
            handleRequestFunction,
            handleFailedRequestFunction,
        });

        await requestList.initialize();
        await basicCrawler.run();

        expect(processed['http://example.com/1'].userData.foo).toBe('bar');
        expect(processed['http://example.com/1'].errorMessages).toEqual([]);
        expect(processed['http://example.com/1'].retryCount).toBe(0);
        expect(processed['http://example.com/3'].userData.foo).toBe('bar');
        expect(processed['http://example.com/3'].errorMessages).toEqual([]);
        expect(processed['http://example.com/3'].retryCount).toBe(0);

        expect(processed['http://example.com/2'].userData.foo).toEqual(undefined);
        expect(processed['http://example.com/2'].errorMessages).toHaveLength(4);
        expect(processed['http://example.com/2'].retryCount).toBe(3);

        expect(handleFailedRequestFunctionCalls).toBe(1);

        expect(await requestList.isFinished()).toBe(false);
        expect(await requestList.isEmpty()).toBe(false);
    });

    test('should load handledRequestCount from storages', async () => {
        const requestQueue = new RequestQueue({ id: 'id', client: Configuration.getDefaultClient() });
        requestQueue.isEmpty = async () => false;
        requestQueue.isFinished = async () => false;

        requestQueue.fetchNextRequest = async () => (new Request({ id: 'id', url: 'http://example.com' }));
        // @ts-expect-error Overriding the method for testing purposes
        requestQueue.markRequestHandled = async () => {};
        const requestQueueStub = sinon
            .stub(requestQueue, 'handledCount')
            .returns(Promise.resolve(33));

        let count = 0;
        let crawler = new BasicCrawler({
            requestQueue,
            maxConcurrency: 1,
            handleRequestFunction: async () => {
                await sleep(1);
                count++;
            },
            maxRequestsPerCrawl: 40,
        });

        await crawler.run();
        sinon.assert.called(requestQueueStub);
        expect(count).toBe(7);
        sinon.restore();

        const sources = _.range(1, 10).map((i) => ({ url: `http://example.com/${i}` }));
        const sourcesCopy = JSON.parse(JSON.stringify(sources));
        let requestList = new RequestList({ sources });
        await requestList.initialize();
        const requestListStub = sinon
            .stub(requestList, 'handledCount')
            .returns(33);

        count = 0;
        crawler = new BasicCrawler({
            requestList,
            maxConcurrency: 1,
            handleRequestFunction: async () => {
                await sleep(1);
                count++;
            },
            maxRequestsPerCrawl: 40,
        });

        await crawler.run();
        sinon.assert.called(requestListStub);
        expect(count).toBe(7);
        sinon.restore();

        requestList = new RequestList({ sources: sourcesCopy });
        await requestList.initialize();
        const listStub = sinon
            .stub(requestList, 'handledCount')
            .returns(20);

        const queueStub = sinon
            .stub(requestQueue, 'handledCount')
            .returns(Promise.resolve(33));

        const addRequestStub = sinon
            .stub(requestQueue, 'addRequest')
            .returns(Promise.resolve() as unknown as Promise<QueueOperationInfo>);

        count = 0;
        crawler = new BasicCrawler({
            requestList,
            requestQueue,
            maxConcurrency: 1,
            handleRequestFunction: async () => {
                await sleep(1);
                count++;
            },
            maxRequestsPerCrawl: 40,
        });

        await crawler.run();
        sinon.assert.called(queueStub);
        sinon.assert.notCalled(listStub);
        sinon.assert.callCount(addRequestStub, 7);
        expect(count).toBe(7);
        sinon.restore();
    });

    test('should timeout after handleRequestTimeoutSecs', async () => {
        const url = 'https://example.com';
        const requestList = new RequestList({ sources: [{ url }] });
        await requestList.initialize();

        const results: Request[] = [];
        const crawler = new BasicCrawler({
            requestList,
            handleRequestTimeoutSecs: 0.01,
            maxRequestRetries: 1,
            handleRequestFunction: () => sleep(1000),
            handleFailedRequestFunction: async ({ request }) => {
                results.push(request);
            },
        });

        await crawler.run();
        expect(results).toHaveLength(1);
        expect(results[0].url).toEqual(url);
        results[0].errorMessages.forEach((msg) => expect(msg).toMatch('handleRequestFunction timed out'));
    });

    test('limits handleRequestTimeoutSecs to a valid value', async () => {
        const url = 'https://example.com';
        const requestList = new RequestList({ sources: [{ url }] });
        await requestList.initialize();

        const results = [];
        const crawler = new BasicCrawler({
            requestList,
            handleRequestTimeoutSecs: Infinity,
            maxRequestRetries: 1,
            handleRequestFunction: () => sleep(1000),
            handleFailedRequestFunction: async ({ request }) => {
                results.push(request);
            },
        });

        const maxSignedInteger = 2 ** 31 - 1;
        // @ts-expect-error Accessing private prop
        expect(crawler.handleRequestTimeoutMillis).toBe(maxSignedInteger);
    });

    describe('Uses SessionPool', () => {
        it('should use SessionPool when useSessionPool is true ', async () => {
            const url = 'https://example.com';
            const requestList = new RequestList({ sources: [{ url }] });
            await requestList.initialize();
            const results: Request[] = [];

            const crawler = new BasicCrawler({
                requestList,
                handleRequestTimeoutSecs: 0.01,
                maxRequestRetries: 1,
                useSessionPool: true,
                sessionPoolOptions: {
                    maxPoolSize: 10,
                    persistStateKey: 'POOL',
                },
                handleRequestFunction: async ({ session }) => {
                    expect(session.constructor.name).toEqual('Session');
                    expect(session.id).toBeDefined();
                },
                handleFailedRequestFunction: async ({ request }) => {
                    results.push(request);
                },
            });

            await crawler.run();
            expect(crawler.sessionPool).toBeDefined();
            expect(results).toHaveLength(0);
        });

        it('should use pass options to sessionPool', async () => {
            const url = 'https://example.com';
            const requestList = new RequestList({ sources: [{ url }] });
            await requestList.initialize();

            const crawler = new BasicCrawler({
                requestList,
                handleRequestTimeoutSecs: 0.01,
                maxRequestRetries: 1,
                useSessionPool: true,
                sessionPoolOptions: {
                    maxPoolSize: 10,
                    persistStateKey: 'POOL',
                },
                handleRequestFunction: async () => {},
                handleFailedRequestFunction: async () => {},
            });
            await crawler.run();

            expect(crawler.sessionPool.maxPoolSize).toEqual(10);
        });

        it('should destroy Session pool after it is finished', async () => {
            const url = 'https://example.com';
            const requestList = new RequestList({ sources: [{ url }] });
            await requestList.initialize();
            events.removeAllListeners(ACTOR_EVENT_NAMES.PERSIST_STATE);

            const crawler = new BasicCrawler({
                requestList,
                handleRequestTimeoutSecs: 0.01,
                maxRequestRetries: 1,
                useSessionPool: true,
                sessionPoolOptions: {
                    maxPoolSize: 10,
                },
                handleRequestFunction: async () => {},
                handleFailedRequestFunction: async () => {},
            });

            // @ts-expect-error Accessing private prop
            crawler._loadHandledRequestCount = () => { // eslint-disable-line
                expect(crawler.sessionPool).toBeDefined();
                expect(events.listenerCount(ACTOR_EVENT_NAMES.PERSIST_STATE)).toEqual(1);
            };

            await crawler.run();
            expect(events.listenerCount(ACTOR_EVENT_NAMES.PERSIST_STATE)).toEqual(0);
            expect(crawler.sessionPool.maxPoolSize).toEqual(10);
        });
    });

    describe('CrawlingContext', () => {
        test('should be kept and later deleted', async () => {
            const urls = [
                'https://example.com/0',
                'https://example.com/1',
                'https://example.com/2',
                'https://example.com/3',
            ];
            const requestList = await RequestList.open(null, urls);
            let counter = 0;
            let finish: (value?: unknown) => void;
            const allFinishedPromise = new Promise((resolve) => {
                finish = resolve;
            });
            const mainContexts: CrawlingContext[] = [];
            const otherContexts: CrawlingContext[][] = [];
            const crawler = new BasicCrawler({
                requestList,
                minConcurrency: 4,
                async handleRequestFunction(crawlingContext) {
                    // @ts-expect-error Accessing private prop
                    mainContexts[counter] = crawler.crawlingContexts.get(crawlingContext.id);
                    // @ts-expect-error Accessing private prop
                    otherContexts[counter] = Array.from(crawler.crawlingContexts).map(([, v]) => v);
                    counter++;
                    if (counter === 4) finish();
                    await allFinishedPromise;
                },
            });
            await crawler.run();

            expect(counter).toBe(4);
            expect(mainContexts).toHaveLength(4);
            expect(otherContexts).toHaveLength(4);
            // @ts-expect-error Accessing private prop
            expect(crawler.crawlingContexts.size).toBe(0);
            mainContexts.forEach((ctx, idx) => {
                expect(typeof ctx.id).toBe('string');
                expect(otherContexts[idx]).toContain(ctx);
            });
            otherContexts.forEach((list, idx) => {
                expect(list).toHaveLength(idx + 1);
            });
        });
    });
});
