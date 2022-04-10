import { ACT_JOB_STATUSES, ENV_VARS } from '@apify/consts';
import log from '@apify/log';
import { sleep } from '@crawlee/utils';
import { Actor, ApifyEnv } from 'apify';
import { ApifyClient, ActorClient, TaskClient, WebhookUpdateData } from 'apify-client';
import { Configuration, EventType } from '@crawlee/core';

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
                    return Actor.main(() => {
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

const globalOptions = {
    token: 'some-token',
    actId: 'some-act-id',
    defaultKeyValueStoreId: 'some-store-id',
    input: { foo: 'bar' },
    contentType: 'application/json',
    outputKey: 'OUTPUT',
    outputValue: 'some-output',
    build: 'xxx',
    taskId: 'some-task-id',
    runId: 'some-run-id',
    targetActorId: 'some-target-actor-id',
};

const runKeys = ['run', 'output', 'finishedRun', 'failedRun', 'runningRun', 'readyRun', 'expected'] as const;

// @ts-expect-error
const runConfigs : Record<typeof runKeys[number], any> = {
    run: { id: globalOptions.runId, actId: globalOptions.actId, defaultKeyValueStoreId: globalOptions.defaultKeyValueStoreId },
    output: { contentType: globalOptions.contentType, key: globalOptions.outputKey, value: globalOptions.outputValue },
    init() {
        // @ts-expect-error
        this.finishedRun = { ...this.run, status: ACT_JOB_STATUSES.SUCCEEDED };
        // @ts-expect-error
        this.failedRun = { ...this.run, status: ACT_JOB_STATUSES.ABORTED };
        // @ts-expect-error
        this.runningRun = { ...this.run, status: ACT_JOB_STATUSES.RUNNING };
        // @ts-expect-error
        this.readyRun = { ...this.run, status: ACT_JOB_STATUSES.READY };
        // @ts-expect-error
        this.expected = { ...this.finishedRun, output: { contentType: globalOptions.contentType, body: globalOptions.outputValue } };
        return this;
    },
}.init();

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
        const expectedEnv = {
            ...getEmptyEnv(),
            ...{
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
            } };
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
describe('Actor.call()', () => {
    afterEach(() => jest.restoreAllMocks());

    const { contentType, build, actId, input, token } = globalOptions;

    test('works as expected', async () => {
        const memory = 1024;
        const timeout = 60;
        const webhooks = [{ a: 'a' }, { b: 'b' }] as unknown as WebhookUpdateData[];

        const options = { contentType, build, memory, timeout, webhooks };

        const actorSpy = jest.spyOn(ApifyClient.prototype, 'actor');
        const callSpy = jest.spyOn(ActorClient.prototype, 'call').mockReturnValue(runConfigs.finishedRun);
        await Actor.call(actId, input, options);

        expect(actorSpy).toBeCalledWith(actId);
        expect(callSpy).toBeCalledWith(input, options);
    });

    test('works with token', async () => {
        const memory = 1024;
        const timeout = 60;
        const webhooks = [{ a: 'a' }, { b: 'b' }] as unknown as WebhookUpdateData[];

        const newClientSpy = jest.spyOn(Actor.prototype, 'newClient');
        const actorSpy = jest.spyOn(ApifyClient.prototype, 'actor');
        const callSpy = jest.spyOn(ActorClient.prototype, 'call').mockReturnValue(runConfigs.finishedRun);
        await Actor.call(actId, input, { contentType, build, token, memory, timeout, webhooks });

        expect(newClientSpy).toBeCalledWith({ token });
        expect(actorSpy).toBeCalledWith(actId);
        expect(callSpy).toBeCalledWith(input, {
            build,
            contentType,
            memory,
            timeout,
            webhooks,
        });
    });
});

// TODO we should remove the duplication if possible
describe('Actor.callTask()', () => {
    afterEach(() => jest.restoreAllMocks());

    const memory = 256; // m
    const timeout = 60; // se
    const webhooks = [{ a: 'a' }, { b: 'b' }] as unknown as WebhookUpdateData[];

    const { input, taskId, token, build } = globalOptions;
    const { finishedRun } = runConfigs;

    test('works as expected', async () => {
        const taskSpy = jest.spyOn(ApifyClient.prototype, 'task');
        const callSpy = jest.spyOn(TaskClient.prototype, 'call').mockReturnValue(finishedRun);

        const options = { memory, timeout, build, webhooks };
        const callOutput = await Actor.callTask(taskId, input, options);

        expect(callOutput).toEqual(finishedRun);

        expect(taskSpy).toBeCalledTimes(1);
        expect(taskSpy).toBeCalledWith(taskId);

        expect(callSpy).toBeCalledTimes(1);
        expect(callSpy).toBeCalledWith(input, options);
    });

    test('works with token', async () => {
        const options = { memory, timeout, build, webhooks };

        const newClientSpy = jest.spyOn(Actor.prototype, 'newClient');
        const taskSpy = jest.spyOn(ApifyClient.prototype, 'task');
        const callSpy = jest.spyOn(TaskClient.prototype, 'call').mockReturnValue(finishedRun);
        const callOutput = await Actor.callTask(taskId, input, { token, ...options });

        expect(newClientSpy).toBeCalledWith({ token });
        expect(taskSpy).toBeCalledWith(taskId);
        expect(callSpy).toBeCalledWith(input, options);

        expect(callOutput).toEqual(finishedRun);
    });
});

// TODO we should remove the duplication if possible
describe('Actor.metamorph()', () => {
    const { actId, runId, targetActorId, input, contentType, build } = globalOptions;

    const { run } = runConfigs;

    beforeEach(() => {
        process.env[ENV_VARS.ACTOR_ID] = actId;
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;
        process.env[ENV_VARS.IS_AT_HOME] = '1';
    });

    afterEach(() => {
        delete process.env[ENV_VARS.ACTOR_ID];
        delete process.env[ENV_VARS.ACTOR_RUN_ID];
        delete process.env[ENV_VARS.IS_AT_HOME];
        jest.restoreAllMocks();
    });

    test('works as expected', async () => {
        const metamorphMock = jest.fn();
        metamorphMock.mockResolvedValueOnce(run);

        const runSpy = jest.spyOn(ApifyClient.prototype, 'run');
        runSpy.mockReturnValueOnce({ metamorph: metamorphMock } as any);

        await Actor.metamorph(targetActorId, input, { contentType, build, customAfterSleepMillis: 1 });

        expect(runSpy).toBeCalledTimes(1);

        expect(metamorphMock).toBeCalledWith(targetActorId, input, {
            build,
            contentType,
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

describe('Actor.reboot()', () => {
    const { actId, runId } = globalOptions;

    beforeEach(() => {
        process.env[ENV_VARS.IS_AT_HOME] = '1';
        process.env[ENV_VARS.ACTOR_ID] = actId;
        process.env[ENV_VARS.ACTOR_RUN_ID] = runId;
    });

    afterEach(() => {
        delete process.env[ENV_VARS.IS_AT_HOME];
        delete process.env[ENV_VARS.ACTOR_ID];
        delete process.env[ENV_VARS.ACTOR_RUN_ID];
        jest.restoreAllMocks();
    });

    test('metamorphs to the same actor', async () => {
        const metamorphSpy = jest.spyOn(Actor.prototype, 'metamorph');
        metamorphSpy.mockResolvedValueOnce();

        await Actor.reboot();

        expect(metamorphSpy).toBeCalledTimes(1);
        expect(metamorphSpy).toBeCalledWith(actId);
    });

    test('reboot waits for persistState/migrating listeners before morphing', async () => {
        const metamorphSpy = jest.spyOn(Actor.prototype, 'metamorph');
        metamorphSpy.mockResolvedValueOnce();

        const persistenceStore = [];

        const persistResource = (delay: number) => async () : Promise<void> => {
            await new Promise((res) => setTimeout(res, delay));
            persistenceStore.push('PERSISTED ITEM');
        };

        const migratingSpy = jest.fn(persistResource(50));
        const persistStateSpy = jest.fn(persistResource(50));
        const events = Configuration.getEventManager();

        events.on(EventType.PERSIST_STATE, persistStateSpy);
        events.on(EventType.MIGRATING, migratingSpy);

        await Actor.reboot();

        events.off(EventType.PERSIST_STATE, persistStateSpy);
        events.off(EventType.MIGRATING, migratingSpy);

        // Do the listeners get called?
        expect(migratingSpy).toBeCalledTimes(1);
        expect(persistStateSpy).toBeCalledTimes(1);

        // Do the listeners finish?
        expect(persistenceStore.length).toBe(2);
    });
});

describe('Actor.addWebhook()', () => {
    afterEach(() => jest.restoreAllMocks());

    const { runId } = globalOptions;
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

        const clientMock = jest.spyOn(Actor.apifyClient, 'webhooks')
            .mockReturnValueOnce({ create: async () => webhook } as any);

        await Actor.addWebhook({
            eventTypes: expectedEventTypes,
            requestUrl: expectedRequestUrl,
            payloadTemplate: expectedPayloadTemplate,
            idempotencyKey: expectedIdempotencyKey,
        });

        delete process.env[ENV_VARS.ACTOR_RUN_ID];
        delete process.env[ENV_VARS.IS_AT_HOME];

        expect(clientMock).toBeCalledTimes(1);
    });

    test('on local logs warning and does nothing', async () => {
        const clientMock = jest.spyOn(Actor.apifyClient, 'webhooks')
            .mockImplementation();

        const warningStub = jest.spyOn(log, 'warning').mockImplementation();

        await Actor.addWebhook({ eventTypes: expectedEventTypes, requestUrl: expectedRequestUrl });

        expect(warningStub).toBeCalledTimes(1);
        expect(clientMock).toBeCalledTimes(0);
    });

    test('should fail without actor run ID', async () => {
        process.env[ENV_VARS.IS_AT_HOME] = '1';

        await expect(async () => Actor.addWebhook({ eventTypes: expectedEventTypes, requestUrl: expectedRequestUrl }))
            .rejects
            .toThrow();

        delete process.env[ENV_VARS.IS_AT_HOME];
    });
});
