/* eslint-disable no-underscore-dangle */

import { ENV_VARS } from '@apify/consts';
import log from '@apify/log';
import { Configuration, EventType, Snapshotter } from '@crawlers/core';
import { MemoryInfo, sleep } from '@crawlers/utils';
import os from 'os';

const toBytes = (x: number) => x * 1024 * 1024;

describe('Snapshotter', () => {
    let logLevel: number;
    beforeAll(() => {
        logLevel = log.getLevel();
        log.setLevel(log.LEVELS.ERROR);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    afterAll(() => {
        log.setLevel(logLevel);
    });

    test('should collect snapshots with some values', async () => {
        // mock client data
        const apifyClient = Configuration.getStorageClient();
        const oldStats = apifyClient.stats;
        apifyClient.stats = {} as never;
        apifyClient.stats.rateLimitErrors = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        const snapshotter = new Snapshotter();
        await snapshotter.start();

        await sleep(625);
        apifyClient.stats.rateLimitErrors = [0, 0, 2, 0, 0, 0, 0, 0, 0, 0];
        await sleep(625);

        await snapshotter.stop();
        const memorySnapshots = snapshotter.getMemorySample();
        const eventLoopSnapshots = snapshotter.getEventLoopSample();
        const cpuSnapshots = snapshotter.getCpuSample();
        const clientSnapshots = snapshotter.getClientSample();

        expect(Array.isArray(cpuSnapshots)).toBe(true);
        expect(cpuSnapshots.length).toBeGreaterThanOrEqual(1);
        cpuSnapshots.forEach((ss) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(typeof ss.usedRatio).toBe('number');
        });

        expect(Array.isArray(memorySnapshots)).toBe(true);
        expect(memorySnapshots.length).toBeGreaterThanOrEqual(1);
        memorySnapshots.forEach((ss) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(typeof ss.usedBytes).toBe('number');
        });

        expect(Array.isArray(eventLoopSnapshots)).toBe(true);
        expect(eventLoopSnapshots.length).toBeGreaterThanOrEqual(2);
        eventLoopSnapshots.forEach((ss) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(typeof ss.exceededMillis).toBe('number');
        });

        expect(Array.isArray(clientSnapshots)).toBe(true);
        expect(clientSnapshots.length).toBeGreaterThanOrEqual(1);
        clientSnapshots.forEach((ss) => {
            expect(ss.createdAt).toBeInstanceOf(Date);
            expect(typeof ss.isOverloaded).toBe('boolean');
            expect(typeof ss.rateLimitErrorCount).toBe('number');
        });

        apifyClient.stats = oldStats;
    });

    // TODO this whole test is too flaky, especially on windows, often giving smaller numbers than it should in the asserts
    test.skip('should override default timers', async () => {
        const options = {
            eventLoopSnapshotIntervalSecs: 0.05,
            memorySnapshotIntervalSecs: 0.1,
            cpuSnapshotIntervalSecs: 0.1,
        };
        const snapshotter = new Snapshotter(options);
        await snapshotter.start();
        await new Promise((resolve) => setTimeout(resolve, 500));
        await snapshotter.stop();
        // const memorySnapshots = snapshotter.getMemorySample();
        // const eventLoopSnapshots = snapshotter.getEventLoopSample();
        const cpuSnapshots = snapshotter.getCpuSample();

        expect(cpuSnapshots.length).toBeGreaterThanOrEqual(5);
        // TODO memory snapshots are async and there's no way to wait for the promises
        // so I'm turning this off for now, because the test is flaky. We can rewrite
        // this when we fully migrate to TS and get rid of the import mess that we
        // have now in the built index.js which prevents reasonable mocking.
        // expect(memorySnapshots.length).toBeGreaterThanOrEqual(5);
        // TODO this test is too flaky on windows, often resulting in 9, sometimes even 8
        // expect(eventLoopSnapshots.length).toBeGreaterThanOrEqual(10);
    });

    test('correctly marks CPU overloaded using Platform event', async () => {
        process.env[ENV_VARS.IS_AT_HOME] = '1'; // TODO this should not be needed, snapshotter depends on this currently
        let count = 0;
        const emitAndWait = async (delay: number) => {
            Configuration.getGlobalConfig().getEvents().emit(EventType.SYSTEM_INFO, {
                isCpuOverloaded: count % 2 === 0,
                createdAt: new Date().toISOString(),
                cpuCurrentUsage: 66.6,
            });
            count++;
            await sleep(delay);
        };

        try {
            const snapshotter = new Snapshotter();
            await snapshotter.start();
            await emitAndWait(10);
            await emitAndWait(10);
            await emitAndWait(10);
            await emitAndWait(0);
            await snapshotter.stop();
            const cpuSnapshots = snapshotter.getCpuSample();

            expect(cpuSnapshots).toHaveLength(4);
            cpuSnapshots.forEach((ss, i) => {
                expect(ss.createdAt).toBeInstanceOf(Date);
                expect(typeof ss.isOverloaded).toBe('boolean');
                expect(ss.isOverloaded).toEqual(i % 2 === 0);
            });
        } finally {
            delete process.env[ENV_VARS.IS_AT_HOME];
        }
    });

    test('correctly marks CPU overloaded using OS metrics', () => {
        const cpusMock = jest.spyOn(os, 'cpus');
        const fakeCpu = [{
            times: {
                idle: 0,
                other: 0,
            },
        }];
        const { times } = fakeCpu[0];

        cpusMock.mockReturnValue(fakeCpu as any);

        const noop = () => {};
        const snapshotter = new Snapshotter({ maxUsedCpuRatio: 0.5 });

        // @ts-expect-error Calling private method
        snapshotter._snapshotCpuOnLocal(noop);

        times.idle++;
        times.other++;
        // @ts-expect-error Calling private method
        snapshotter._snapshotCpuOnLocal(noop);

        times.other += 2;
        // @ts-expect-error Calling private method
        snapshotter._snapshotCpuOnLocal(noop);

        times.idle += 2;
        // @ts-expect-error Calling private method
        snapshotter._snapshotCpuOnLocal(noop);

        times.other += 4;
        // @ts-expect-error Calling private method
        snapshotter._snapshotCpuOnLocal(noop);

        const loopSnapshots = snapshotter.getCpuSample();

        expect(loopSnapshots.length).toBe(5);
        expect(loopSnapshots[0].isOverloaded).toBe(false);
        expect(loopSnapshots[1].isOverloaded).toBe(false);
        expect(loopSnapshots[2].isOverloaded).toBe(true);
        expect(loopSnapshots[3].isOverloaded).toBe(false);
        expect(loopSnapshots[4].isOverloaded).toBe(true);
        expect(cpusMock).toBeCalledTimes(5);

        cpusMock.mockRestore();
    });

    test('correctly marks eventLoopOverloaded', () => {
        const clock = jest.useFakeTimers();
        try {
            const noop = () => {};
            const snapshotter = new Snapshotter({ maxBlockedMillis: 5, eventLoopSnapshotIntervalSecs: 0 });
            // @ts-expect-error Calling protected method
            snapshotter._snapshotEventLoop(noop);
            clock.advanceTimersByTime(1);
            // @ts-expect-error Calling protected method
            snapshotter._snapshotEventLoop(noop);
            clock.advanceTimersByTime(2);
            // @ts-expect-error Calling protected method
            snapshotter._snapshotEventLoop(noop);
            clock.advanceTimersByTime(7);
            // @ts-expect-error Calling protected method
            snapshotter._snapshotEventLoop(noop);
            clock.advanceTimersByTime(3);
            // @ts-expect-error Calling protected method
            snapshotter._snapshotEventLoop(noop);
            const loopSnapshots = snapshotter.getEventLoopSample();

            expect(loopSnapshots.length).toBe(5);
            expect(loopSnapshots[0].isOverloaded).toBe(false);
            expect(loopSnapshots[1].isOverloaded).toBe(false);
            expect(loopSnapshots[2].isOverloaded).toBe(false);
            expect(loopSnapshots[3].isOverloaded).toBe(true);
            expect(loopSnapshots[4].isOverloaded).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    test('correctly marks memoryOverloaded using OS metrics', async () => {
        const noop = () => {};
        const memoryData = {
            mainProcessBytes: toBytes(1000),
            childProcessesBytes: toBytes(1000),
        } as MemoryInfo;
        const spy = jest.spyOn(Snapshotter.prototype as any, '_getMemoryInfo');
        const getMemoryInfo = async () => {
            return ({ ...memoryData });
        };
        spy.mockImplementation(getMemoryInfo);
        process.env[ENV_VARS.MEMORY_MBYTES] = '10000';

        const snapshotter = new Snapshotter({ maxUsedMemoryRatio: 0.5 });
        // @ts-expect-error Calling private method
        await snapshotter._snapshotMemoryOnLocal(noop);
        memoryData.mainProcessBytes = toBytes(2000);
        // @ts-expect-error Calling private method
        await snapshotter._snapshotMemoryOnLocal(noop);
        memoryData.childProcessesBytes = toBytes(2000);
        // @ts-expect-error Calling private method
        await snapshotter._snapshotMemoryOnLocal(noop);
        memoryData.mainProcessBytes = toBytes(3001);
        // @ts-expect-error Calling private method
        await snapshotter._snapshotMemoryOnLocal(noop);
        memoryData.childProcessesBytes = toBytes(1999);
        // @ts-expect-error Calling private method
        await snapshotter._snapshotMemoryOnLocal(noop);
        const memorySnapshots = snapshotter.getMemorySample();

        expect(memorySnapshots.length).toBe(5);
        expect(memorySnapshots[0].isOverloaded).toBe(false);
        expect(memorySnapshots[1].isOverloaded).toBe(false);
        expect(memorySnapshots[2].isOverloaded).toBe(false);
        expect(memorySnapshots[3].isOverloaded).toBe(true);
        expect(memorySnapshots[4].isOverloaded).toBe(false);

        delete process.env[ENV_VARS.MEMORY_MBYTES];
    });

    test('correctly logs critical memory overload', () => {
        const memoryDataOverloaded = {
            memCurrentBytes: toBytes(7600),
        };
        const memoryDataNotOverloaded = {
            memCurrentBytes: toBytes(7500),
        };
        let logged = false;
        process.env[ENV_VARS.MEMORY_MBYTES] = '10000';
        const snapshotter = new Snapshotter({ maxUsedMemoryRatio: 0.5 });
        const warning = () => { logged = true; };
        const stub = jest.spyOn(snapshotter.log, 'warning');
        stub.mockImplementation(warning);

        // @ts-expect-error Calling private method
        snapshotter._memoryOverloadWarning(memoryDataOverloaded);
        expect(logged).toBe(true);

        logged = false;

        // @ts-expect-error Calling private method
        snapshotter._memoryOverloadWarning(memoryDataNotOverloaded);
        expect(logged).toBe(false);

        delete process.env[ENV_VARS.MEMORY_MBYTES];
        stub.mockRestore();
    });

    test('correctly marks clientOverloaded', () => {
        const noop = () => {};
        // mock client data
        const apifyClient = Configuration.getStorageClient();
        const oldStats = apifyClient.stats;
        apifyClient.stats = {} as never;
        apifyClient.stats.rateLimitErrors = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        const snapshotter = new Snapshotter({ maxClientErrors: 1 });
        // @ts-expect-error Calling protected method
        snapshotter._snapshotClient(noop);
        apifyClient.stats.rateLimitErrors = [1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
        // @ts-expect-error Calling protected method
        snapshotter._snapshotClient(noop);
        apifyClient.stats.rateLimitErrors = [10, 5, 2, 0, 0, 0, 0, 0, 0, 0];
        // @ts-expect-error Calling protected method
        snapshotter._snapshotClient(noop);
        apifyClient.stats.rateLimitErrors = [100, 24, 4, 2, 0, 0, 0, 0, 0, 0];
        // @ts-expect-error Calling protected method
        snapshotter._snapshotClient(noop);

        const clientSnapshots = snapshotter.getClientSample();

        expect(clientSnapshots.length).toBe(4);
        expect(clientSnapshots[0].isOverloaded).toBe(false);
        expect(clientSnapshots[1].isOverloaded).toBe(false);
        expect(clientSnapshots[2].isOverloaded).toBe(false);
        expect(clientSnapshots[3].isOverloaded).toBe(true);

        apifyClient.stats = oldStats;
    });

    test('.get[.*]Sample limits amount of samples', async () => {
        const SAMPLE_SIZE_MILLIS = 120;
        const options = {
            eventLoopSnapshotIntervalSecs: 0.01,
            memorySnapshotIntervalSecs: 0.01,
        };
        const snapshotter = new Snapshotter(options);
        await snapshotter.start();
        await sleep(300);
        await snapshotter.stop();
        const memorySnapshots = snapshotter.getMemorySample();
        const eventLoopSnapshots = snapshotter.getEventLoopSample();
        const memorySample = snapshotter.getMemorySample(SAMPLE_SIZE_MILLIS);
        const eventLoopSample = snapshotter.getEventLoopSample(SAMPLE_SIZE_MILLIS);

        expect(memorySnapshots.length).toBeGreaterThan(memorySample.length);
        expect(eventLoopSnapshots.length).toBeGreaterThan(eventLoopSample.length);
        for (let i = 0; i < eventLoopSample.length; i++) {
            const sample = eventLoopSample[eventLoopSample.length - 1 - i];
            const snapshot = eventLoopSnapshots[eventLoopSnapshots.length - 1 - i];
            expect(sample).toEqual(snapshot);
        }
        const diffBetween = eventLoopSample[eventLoopSample.length - 1].createdAt.getTime()
            - eventLoopSnapshots[eventLoopSnapshots.length - 1].createdAt.getTime();
        const diffWithin = eventLoopSample[0].createdAt.getTime() - eventLoopSample[eventLoopSample.length - 1].createdAt.getTime();
        expect(diffBetween).toBeLessThan(SAMPLE_SIZE_MILLIS);
        expect(diffWithin).toBeLessThan(SAMPLE_SIZE_MILLIS);
    });
});
