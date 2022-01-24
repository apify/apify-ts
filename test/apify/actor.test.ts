import path from 'path';
import _ from 'underscore';
import sinon from 'sinon';
import { ACT_JOB_STATUSES, ENV_VARS } from '@apify/consts';
import log from '@apify/log';
import { sleep } from '@crawlers/core';
import { Actor, ApifyEnv } from 'apify';
import { ApifyClient, WebhookUpdateData } from 'apify-client';

/**
 * Helper function that enables testing of main()
 */
const testMain = async ({ userFunc, exitCode }: { userFunc?: (sdk?: Actor) => void; exitCode: number }) => {
    const exitSpy = jest.spyOn(process, 'exit');
    exitSpy.mockImplementation();

    let error: Error = null;

    try {
        await Promise.resolve()
            .then(() => {
                return new Promise<void>((resolve, reject) => {
                    // Invoke main() function, the promise resolves after the user function is run
                    Actor.main(() => {
                        try {
                            // Wait for all tasks in Node.js event loop to finish
                            resolve();
                        } catch (err) {
                            reject(err);
                            return;
                        }
                        // Call user func to test other behavior (note that it can throw)
                        if (userFunc) return userFunc();
                    });
                })
                    .catch((err) => {
                        error = err;
                    });
            })
            .then(() => {
                // Waits max 1000 millis for process.exit() mock to be called
                return new Promise<void>((resolve) => {
                    const waitUntil = Date.now() + 1000;
                    const intervalId = setInterval(() => {
                        if (exitSpy.mock.calls.length === 0 && Date.now() < waitUntil) {
                            return;
                        }
                        clearInterval(intervalId);
                        resolve();
                    }, 10);
                });
            })
            .then(() => {
                if (error) throw error;
                expect(exitSpy).toBeCalledWith(exitCode);
            });
    } finally {
        console.log(exitSpy.mock.calls);
        expect(exitSpy).toBeCalledWith(exitCode);
        exitSpy.mockRestore();
    }
};

const getEmptyEnv = () => {
    return {
        // internalPort: null,
        actorId: null,
        actorRunId: null,
        userId: null,
        token: null,
        startedAt: null,
        timeoutAt: null,
        defaultKeyValueStoreId: null,
        defaultDatasetId: null,
        memoryMbytes: null,
    } as ApifyEnv;
};

const setEnv = (env: ApifyEnv) => {
    delete process.env.APIFY_ACTOR_ID;
    delete process.env.APIFY_ACTOR_RUN_ID;
    delete process.env.APIFY_USER_ID;
    delete process.env.APIFY_TOKEN;
    delete process.env.APIFY_STARTED_AT;
    delete process.env.APIFY_TIMEOUT_AT;
    delete process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;
    delete process.env.APIFY_DEFAULT_DATASET_ID;

    if (env.actorId) process.env.APIFY_ACTOR_ID = env.actorId;
    if (env.actorRunId) process.env.APIFY_ACTOR_RUN_ID = env.actorRunId;
    if (env.userId) process.env.APIFY_USER_ID = env.userId;
    if (env.token) process.env.APIFY_TOKEN = env.token;
    if (env.startedAt) process.env.APIFY_STARTED_AT = env.startedAt.toISOString();
    if (env.timeoutAt) process.env.APIFY_TIMEOUT_AT = env.timeoutAt.toISOString();
    if (env.defaultKeyValueStoreId) process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID = env.defaultKeyValueStoreId;
    if (env.defaultDatasetId) process.env.APIFY_DEFAULT_DATASET_ID = env.defaultDatasetId;
    if (env.memoryMbytes) process.env.APIFY_MEMORY_MBYTES = env.memoryMbytes.toString();
};

describe('Actor.getEnv()', () => {
    let prevEnv: ApifyEnv;

    beforeAll(() => {
        prevEnv = Actor.getEnv();
    });

    afterAll(() => {
        setEnv(prevEnv);
    });

    afterEach(() => jest.restoreAllMocks());

    test('works with null values', () => {
        const expectedEnv = getEmptyEnv();
        setEnv(expectedEnv);

        const env = Actor.getEnv();
        expect(env).toMatchObject(expectedEnv);
    });

    test('works with with non-null values', () => {
        const expectedEnv = _.extend(getEmptyEnv(), {
            // internalPort: 12345,
            actorId: 'test actId',
            actorRunId: 'test actId',
            userId: 'some user',
            token: 'auth token',
            startedAt: new Date('2017-01-01'),
            timeoutAt: new Date(),
            defaultKeyValueStoreId: 'some store',
            defaultDatasetId: 'some dataset',
            memoryMbytes: 1234,
        });
        setEnv(expectedEnv);

        const env = Actor.getEnv();
        expect(env).toMatchObject(expectedEnv);
    });
});

describe('Actor.main()', () => {
    test('throws on invalid args', () => {
        expect(() => {
            // @ts-expect-error callback parameter is required
            main();
        }).toThrowError(Error);
    });

    test('works with simple user function', () => {
        return testMain({
            userFunc: () => {},
            exitCode: 0,
        });
    });

    test('sets default APIFY_LOCAL_STORAGE_DIR', async () => {
        delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
        delete process.env[ENV_VARS.TOKEN];

        await testMain({
            userFunc: () => {
                expect(Actor.config.get('localStorageDir')).toEqual(path.join(process.cwd(), './apify_storage'));
            },
            exitCode: 0,
        });

        delete process.env[ENV_VARS.LOCAL_STORAGE_DIR];
    });

    test('works with promised user function', () => {
        let called = false;
        return testMain({
            userFunc: () => {
                return new Promise<void>((resolve) => {
                    setTimeout(() => {
                        called = true;
                        resolve();
                    }, 20);
                });
            },
            exitCode: 0,
        })
            .then(() => {
                expect(called).toBe(true);
            });
    });

    test('on exception in simple user function the process exits with code 91', () => {
        return testMain({
            userFunc: () => {
                throw new Error('Test exception I');
            },
            exitCode: 91,
        });
    });

    test('on exception in promised user function the process exits with code 91', () => {
        return testMain({
            userFunc: async () => {
                await sleep(20);
                throw new Error('Test exception II');
            },
            exitCode: 91,
        });
    });
});

// TODO we should remove the duplication if possible
describe.skip('Actor.call()', () => {
    const token = 'some-token';
    const actId = 'some-act-id';
    const defaultKeyValueStoreId = 'some-store-id';
    const input = 'something';
    const contentType = 'text/plain';
    const outputKey = 'OUTPUT';
    const outputValue = 'some-output';
    const build = 'xxx';

    const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
    const finishedRun = { ...run, status: ACT_JOB_STATUSES.SUCCEEDED };
    const failedRun = { ...run, status: ACT_JOB_STATUSES.ABORTED };
    const runningRun = { ...run, status: ACT_JOB_STATUSES.RUNNING };
    const readyRun = { ...run, status: ACT_JOB_STATUSES.READY };

    const output = { contentType, key: outputKey, value: outputValue };
    const expected = { ...finishedRun, output: { contentType, body: outputValue } };

    test('works as expected', async () => {
        const memory = 1024;
        const timeout = 60;
        const webhooks = [{ a: 'a' }, { b: 'b' }] as unknown as WebhookUpdateData[];

        const clientMock = sinon.mock(Actor.apifyClient);
        clientMock.expects('actor')
            .once()
            .withArgs('some-act-id')
            .returns({ call: async () => finishedRun });

        const callOutput = await Actor.call(actId, input, { contentType, build, memory, timeout, webhooks });

        expect(callOutput).toEqual(expected);
        clientMock.verify();
    });

    test('works as expected with fetchOutput = false', async () => {
        const clientMock = sinon.mock(Actor.apifyClient);
        clientMock.expects('actor')
            .once()
            .withArgs('some-act-id')
            .returns({ call: async () => finishedRun });

        clientMock.expects('keyValueStore')
            .never();

        const callOutput = await Actor.call(actId, undefined);

        expect(callOutput).toEqual(finishedRun);
        clientMock.restore();
    });

    test('works with token', async () => {
        const memory = 1024;
        const timeout = 60;
        const webhooks = [{ a: 'a' }, { b: 'b' }] as unknown as WebhookUpdateData[];

        // TODO spy on `Configuration.newClient()` probably?
        // const utilsMock = sinon.mock(utils);
        const callStub = sinon.stub().resolves(finishedRun);
        const getRecordStub = sinon.stub().resolves(output);
        const keyValueStoreStub = sinon.stub().returns({ getRecord: getRecordStub });
        const actorStub = sinon.stub().returns({ call: callStub });
        // utilsMock.expects('newClient')
        //     .once()
        //     .withArgs({ token })
        //     .returns({
        //         actor: actorStub,
        //         keyValueStore: keyValueStoreStub,
        //     });
        const callOutput = await Actor.call(actId, input, { contentType, token, build, memory, timeout, webhooks });

        expect(callOutput).toEqual(expected);
        expect(actorStub.calledOnceWith(actId));
        expect(callStub.args[0]).toEqual([input, {
            build,
            contentType: `${contentType}; charset=utf-8`,
            memory,
            timeout,
            webhooks,
        }]);
        expect(keyValueStoreStub.calledOnceWith(run.defaultKeyValueStoreId));
        expect(getRecordStub.calledOnceWith('OUTPUT', { buffer: true }));
        // utilsMock.verify();
    });

    test('works as expected with unfinished run', async () => {
        const waitForFinish = 1;

        const clientMock = sinon.mock(Actor.apifyClient);
        clientMock.expects('actor')
            .once()
            .withArgs('some-act-id')
            .returns({ call: async () => runningRun });

        clientMock.expects('keyValueStore')
            .never();

        const callOutput = await Actor.call(actId, undefined, { waitForFinish });

        expect(callOutput).toEqual(runningRun);
        clientMock.verify();
    });

    test('returns immediately with zero', async () => {
        const waitForFinish = 0;

        const clientMock = sinon.mock(Actor.apifyClient);
        clientMock.expects('actor')
            .once()
            .withArgs('some-act-id')
            .returns({ call: async () => readyRun });

        clientMock.expects('keyValueStore')
            .never();

        const callOutput = await Actor.call(actId, undefined, { waitForFinish });

        expect(callOutput).toEqual(readyRun);
        clientMock.restore();
    });

    test(`throws if run doesn't succeed`, async () => {
        const clientMock = sinon.mock(Actor.apifyClient);
        clientMock.expects('actor')
            .once()
            .withArgs('some-act-id')
            .returns({ call: async () => failedRun });

        try {
            await Actor.call(actId, null);
            throw new Error('This was suppose to fail!');
        } catch (err) {
            clientMock.restore();
        }
    });
});

// TODO we should remove the duplication if possible
describe.skip('Actor.callTask()', () => {
    const taskId = 'some-task-id';
    const actId = 'xxx';
    const token = 'some-token';
    const defaultKeyValueStoreId = 'some-store-id';
    const run = { id: 'some-run-id', actId, defaultKeyValueStoreId };
    const readyRun = { ...run, status: ACT_JOB_STATUSES.READY };
    const runningRun = { ...run, status: ACT_JOB_STATUSES.RUNNING };
    const finishedRun = { ...run, status: ACT_JOB_STATUSES.SUCCEEDED };
    const failedRun = { ...run, status: ACT_JOB_STATUSES.ABORTED };
    const contentType = 'application/json';
    const outputKey = 'OUTPUT';
    const outputValue = 'some-output';
    const output = { contentType, key: outputKey, value: outputValue };
    const expected = { ...finishedRun, output: { contentType, body: outputValue } };
    const input = { foo: 'bar' };
    const memory = 256; // mb
    const timeout = 60; // sec
    const build = 'beta';
    const webhooks = [{ a: 'a' }, { b: 'b' }] as unknown as WebhookUpdateData[];

    test('works as expected', async () => {
        const clientMock = sinon.mock(Actor.apifyClient);
        clientMock.expects('task')
            .once()
            .withArgs('some-task-id')
            .returns({ call: async () => finishedRun });

        clientMock.expects('keyValueStore')
            .once()
            .withArgs('some-store-id')
            .returns({ getRecord: async () => output });

        const callOutput = await Actor.callTask(taskId, input, { memory, timeout, build, webhooks });

        expect(callOutput).toEqual(expected);
        clientMock.restore();
    });

    test('works with token', async () => {
        // TODO spy on `Configuration.newClient()` probably?
        // const utilsMock = sinon.mock(utils);
        const callStub = sinon.stub().resolves(finishedRun);
        const getRecordStub = sinon.stub().resolves(output);
        const keyValueStoreStub = sinon.stub().returns({ getRecord: getRecordStub });
        const taskStub = sinon.stub().returns({ call: callStub });
        // utilsMock.expects('newClient')
        //     .once()
        //     .withArgs({ token })
        //     .returns({
        //         task: taskStub,
        //         keyValueStore: keyValueStoreStub,
        //     });
        const callOutput = await Actor.callTask(taskId, input, { token, build, memory, timeout, webhooks });

        expect(callOutput).toEqual(expected);
        expect(taskStub.calledOnceWith(taskId));
        expect(callStub.args[0]).toEqual([input, {
            build,
            memory,
            timeout,
            webhooks,
        }]);
        expect(keyValueStoreStub.calledOnceWith(run.defaultKeyValueStoreId));
        expect(getRecordStub.calledOnceWith('OUTPUT', { buffer: true }));
        // utilsMock.verify();
    });

    test('works as expected with fetchOutput = false', async () => {
        const clientMock = sinon.mock(Actor.apifyClient);
        clientMock.expects('task')
            .once()
            .withArgs('some-task-id')
            .returns({ call: async () => finishedRun });

        clientMock.expects('keyValueStore')
            .never();

        const callOutput = await Actor.callTask(taskId);

        expect(callOutput).toEqual(finishedRun);
        clientMock.restore();
    });

    test('works as expected with unfinished run', async () => {
        // ensure waitForFinish and waitSecs is the same, if not we have wrong types in client
        const waitForFinish = 1;

        const clientMock = sinon.mock(Actor.apifyClient);
        clientMock.expects('task')
            .once()
            .withArgs('some-task-id')
            .returns({ call: async () => runningRun });

        clientMock.expects('keyValueStore')
            .never();

        const callOutput = await Actor.callTask(taskId, undefined, { waitForFinish });

        expect(callOutput).toEqual(runningRun);
        clientMock.verify();
    });

    test('returns immediately with zero', async () => {
        const waitForFinish = 0;

        const clientMock = sinon.mock(Actor.apifyClient);
        clientMock.expects('task')
            .once()
            .withArgs('some-task-id')
            .returns({ call: async () => readyRun });

        clientMock.expects('keyValueStore')
            .never();

        const callOutput = await Actor.callTask(taskId, undefined, { waitForFinish });

        expect(callOutput).toEqual(readyRun);
        clientMock.restore();
    });

    test(`throws if run doesn't succeed`, async () => {
        const clientMock = sinon.mock(Actor.apifyClient);
        clientMock.expects('task')
            .once()
            .withArgs('some-task-id')
            .returns({ call: async () => failedRun });

        try {
            await Actor.callTask(taskId);
            throw new Error('This was suppose to fail!');
        } catch (err) {
            clientMock.restore();
        }
    });
});

// TODO we should remove the duplication if possible
describe.skip('Actor.metamorph()', () => {
    const runId = 'some-run-id';
    const actorId = 'some-actor-id';
    const targetActorId = 'some-target-actor-id';
    const contentType = 'application/json';
    const input = '{ "foo": "bar" }';
    const build = 'beta';
    const run = { id: runId, actId: actorId };

    beforeEach(() => {
        process.env[ENV_VARS.ACTOR_ID] = actorId;
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;
    });

    afterEach(() => {
        delete process.env[ENV_VARS.ACTOR_ID];
        delete process.env[ENV_VARS.ACTOR_RUN_ID];
    });

    test('works as expected', async () => {
        const metamorphMock = jest.fn();
        metamorphMock.mockResolvedValueOnce(run);
        const runSpy = jest.spyOn(ApifyClient.prototype, 'run');
        runSpy.mockReturnValueOnce({ metamorph: metamorphMock } as any);

        await Actor.metamorph(targetActorId, input, { contentType, build, customAfterSleepMillis: 1 });

        expect(metamorphMock).toBeCalledWith(targetActorId, input, {
            build,
            contentType: `${contentType}; charset=utf-8`,
        });
    });

    test('works without opts and input', async () => {
        const metamorphMock = jest.fn();
        metamorphMock.mockResolvedValueOnce(run);
        const runSpy = jest.spyOn(ApifyClient.prototype, 'run');
        runSpy.mockReturnValueOnce({ metamorph: metamorphMock } as any);

        await Actor.metamorph(targetActorId, undefined, { customAfterSleepMillis: 1 });

        expect(metamorphMock).toBeCalledWith(targetActorId, undefined, {});
    });
});

describe('Actor.addWebhook()', () => {
    const runId = 'my-run-id';
    const expectedEventTypes = ['ACTOR.RUN.SUCCEEDED'] as const;
    const expectedRequestUrl = 'http://example.com/api';
    const expectedPayloadTemplate = '{"hello":{{world}}';
    const expectedIdempotencyKey = 'some-key';
    const webhook = {
        isAdHoc: true,
        eventTypes: expectedEventTypes,
        condition: {
            actorRunId: runId,
        },
        requestUrl: expectedRequestUrl,
        payloadTemplate: expectedPayloadTemplate,
        idempotencyKey: expectedIdempotencyKey,
    };

    test('works', async () => {
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;
        process.env[ENV_VARS.IS_AT_HOME] = '1';

        const clientMock = sinon.mock(Actor.apifyClient);
        clientMock.expects('webhooks')
            .once()
            .returns({ create: async () => webhook });

        await Actor.addWebhook({
            eventTypes: expectedEventTypes,
            requestUrl: expectedRequestUrl,
            payloadTemplate: expectedPayloadTemplate,
            idempotencyKey: expectedIdempotencyKey,
        });

        delete process.env[ENV_VARS.ACTOR_RUN_ID];
        delete process.env[ENV_VARS.IS_AT_HOME];

        clientMock.verify();
    });

    test('on local logs warning and does nothing', async () => {
        const clientMock = sinon.mock(Actor.apifyClient);
        clientMock.expects('webhooks')
            .never();

        const logMock = sinon.mock(log);
        logMock.expects('warning').once();

        await Actor.addWebhook({ eventTypes: expectedEventTypes, requestUrl: expectedRequestUrl });

        clientMock.verify();
        logMock.verify();
    });

    test('should fail without actor run ID', async () => {
        process.env[ENV_VARS.IS_AT_HOME] = '1';

        let isThrow;
        try {
            await Actor.addWebhook({ eventTypes: expectedEventTypes, requestUrl: expectedRequestUrl });
        } catch (err) {
            isThrow = true;
        }
        expect(isThrow).toBe(true);

        delete process.env[ENV_VARS.IS_AT_HOME];
    });
});
