import { ACTOR_EVENT_NAMES, ENV_VARS } from '@apify/consts';
import { Log } from '@apify/log';
import { betterClearInterval, BetterIntervalID, betterSetInterval } from '@apify/utilities';
import { getMemoryInfo } from '@crawlers/utils';
import os from 'os';
import ow from 'ow';
import { Configuration } from '../configuration';
import { events } from '../events';
import { log as defaultLog } from '../log';
import { SystemInfo } from './system_status';

const RESERVE_MEMORY_RATIO = 0.5;
const CLIENT_RATE_LIMIT_ERROR_RETRY_COUNT = 2;
const CRITICAL_OVERLOAD_RATE_LIMIT_MILLIS = 10000;

export interface SnapshotterOptions {
    /**
     * Defines the interval of measuring the event loop response time.
     * @default 0.5
     */
    eventLoopSnapshotIntervalSecs?: number;

    /**
     * Defines the interval of checking the current state
     * of the remote API client.
     * @default 1
     */
    clientSnapshotIntervalSecs?: number;

    /**
     * Maximum allowed delay of the event loop in milliseconds.
     * Exceeding this limit overloads the event loop.
     * @default 50
     */
    maxBlockedMillis?: number;

    /**
     * Defines the interval of measuring CPU usage.
     * This is only used when running locally. On the Apify platform,
     * the statistics are provided externally at a fixed interval.
     * @default 1
     */
    cpuSnapshotIntervalSecs?: number;

    /**
     * Defines the maximum usage of CPU.
     * Exceeding this limit overloads the CPU.
     * @default 0.95
     */
    maxUsedCpuRatio?: number;

    /**
     * Defines the interval of measuring memory consumption.
     * This is only used when running locally. On the Apify platform,
     * the statistics are provided externally at a fixed interval.
     * The measurement itself is resource intensive (25 - 50ms async).
     * Therefore, setting this interval below 1 second is not recommended.
     * @default 1
     */
    memorySnapshotIntervalSecs?: number;

    /**
     * Defines the maximum ratio of total memory that can be used.
     * Exceeding this limit overloads the memory.
     * @default 0.7
     */
    maxUsedMemoryRatio?: number;

    /**
     * Defines the maximum number of new rate limit errors within
     * the given interval.
     * @default 1
     */
    maxClientErrors?: number;

    /**
     * Sets the interval in seconds for which a history of resource snapshots
     * will be kept. Increasing this to very high numbers will affect performance.
     * @default 60
     */
    snapshotHistorySecs?: number;

    log?: Log;
}

type MemorySnapshot = { createdAt: Date; isOverloaded: boolean; usedBytes?: number };
type CpuSnapshot = { createdAt: Date; isOverloaded: boolean; usedRatio: number; ticks?: { idle: number; total: number } };
type EventLoopSnapshot = { createdAt: Date; isOverloaded: boolean; exceededMillis: number };
type ClientSnapshot = { createdAt: Date; isOverloaded: boolean; rateLimitErrorCount: number };

/**
 * Creates snapshots of system resources at given intervals and marks the resource
 * as either overloaded or not during the last interval. Keeps a history of the snapshots.
 * It tracks the following resources: Memory, EventLoop, API and CPU.
 * The class is used by the {@link AutoscaledPool} class.
 *
 * When running on the Apify platform, the CPU and memory statistics are provided by the platform,
 * as collected from the running Docker container. When running locally, `Snapshotter`
 * makes its own statistics by querying the OS.
 *
 * CPU becomes overloaded locally when its current use exceeds the `maxUsedCpuRatio` option or
 * when Apify platform marks it as overloaded.
 *
 * Memory becomes overloaded if its current use exceeds the `maxUsedMemoryRatio` option.
 * It's computed using the total memory available to the container when running on
 * the Apify platform and a quarter of total system memory when running locally.
 * Max total memory when running locally may be overridden by using the `APIFY_MEMORY_MBYTES`
 * environment variable.
 *
 * Event loop becomes overloaded if it slows down by more than the `maxBlockedMillis` option.
 *
 * Client becomes overloaded when rate limit errors (429 - Too Many Requests),
 * typically received from the request queue, exceed the set limit within the set interval.
 * @category Scaling
 */
export class Snapshotter {
    log: Log;
    eventLoopSnapshotIntervalMillis: number;
    memorySnapshotIntervalMillis: number;
    clientSnapshotIntervalMillis: number;
    cpuSnapshotIntervalMillis: number;
    snapshotHistoryMillis: number;
    maxBlockedMillis: number;
    maxUsedMemoryRatio: number;
    maxUsedCpuRatio: number;
    maxClientErrors: number;
    maxMemoryBytes: number | null;

    cpuSnapshots: CpuSnapshot[] = [];
    eventLoopSnapshots: EventLoopSnapshot[] = [];
    memorySnapshots: MemorySnapshot[] = [];
    clientSnapshots: ClientSnapshot[] = [];

    eventLoopInterval: BetterIntervalID = null!;
    memoryInterval: BetterIntervalID = null!;
    clientInterval: BetterIntervalID = null!;
    cpuInterval: BetterIntervalID = null!;

    lastLoggedCriticalMemoryOverloadAt: Date | null = null;

    /**
     * @param [options] All `Snapshotter` configuration options.
     */
    constructor(options: SnapshotterOptions = {}) {
        ow(options, ow.object.exactShape({
            eventLoopSnapshotIntervalSecs: ow.optional.number,
            cpuSnapshotIntervalSecs: ow.optional.number,
            memorySnapshotIntervalSecs: ow.optional.number,
            clientSnapshotIntervalSecs: ow.optional.number,
            snapshotHistorySecs: ow.optional.number,
            maxBlockedMillis: ow.optional.number,
            maxUsedMemoryRatio: ow.optional.number,
            maxUsedCpuRatio: ow.optional.number,
            maxClientErrors: ow.optional.number,
            log: ow.optional.object,
        }));

        const {
            eventLoopSnapshotIntervalSecs = 0.5,
            cpuSnapshotIntervalSecs = 1,
            memorySnapshotIntervalSecs = 1,
            clientSnapshotIntervalSecs = 1,
            snapshotHistorySecs = 30,
            maxBlockedMillis = 50,
            maxUsedMemoryRatio = 0.7,
            maxUsedCpuRatio = 0.95,
            maxClientErrors = 3,
            log = defaultLog,
        } = options;

        this.log = log.child({ prefix: 'Snapshotter' });

        this.eventLoopSnapshotIntervalMillis = eventLoopSnapshotIntervalSecs * 1000;
        this.memorySnapshotIntervalMillis = memorySnapshotIntervalSecs * 1000;
        this.clientSnapshotIntervalMillis = clientSnapshotIntervalSecs * 1000;
        this.cpuSnapshotIntervalMillis = cpuSnapshotIntervalSecs * 1000;
        this.snapshotHistoryMillis = snapshotHistorySecs * 1000;
        this.maxBlockedMillis = maxBlockedMillis;
        this.maxUsedMemoryRatio = maxUsedMemoryRatio;
        this.maxUsedCpuRatio = maxUsedCpuRatio;
        this.maxClientErrors = maxClientErrors;
        this.maxMemoryBytes = (parseInt(process.env[ENV_VARS.MEMORY_MBYTES]!, 10) * 1024 * 1024) || null;

        // We need to pre-bind those functions to be able to successfully remove listeners.
        this._snapshotCpuOnPlatform = this._snapshotCpuOnPlatform.bind(this);
        this._snapshotMemoryOnPlatform = this._snapshotMemoryOnPlatform.bind(this);
    }

    /**
     * Starts capturing snapshots at configured intervals.
     */
    async start(): Promise<void> {
        await this._ensureCorrectMaxMemory();

        // Start snapshotting.
        this.eventLoopInterval = betterSetInterval(this._snapshotEventLoop.bind(this), this.eventLoopSnapshotIntervalMillis);
        this.clientInterval = betterSetInterval(this._snapshotClient.bind(this), this.clientSnapshotIntervalMillis);
        this.cpuInterval = betterSetInterval(this._snapshotCpuOnLocal.bind(this), this.cpuSnapshotIntervalMillis);
        this.memoryInterval = betterSetInterval(this._snapshotMemoryOnLocal.bind(this), this.memorySnapshotIntervalMillis);
    }

    /**
     * Stops all resource capturing.
     */
    async stop(): Promise<void> {
        betterClearInterval(this.eventLoopInterval);
        betterClearInterval(this.memoryInterval);
        betterClearInterval(this.cpuInterval);
        betterClearInterval(this.clientInterval);
        events.removeListener(ACTOR_EVENT_NAMES.SYSTEM_INFO, this._snapshotCpuOnPlatform);
        events.removeListener(ACTOR_EVENT_NAMES.SYSTEM_INFO, this._snapshotMemoryOnPlatform);
        // Allow microtask queue to unwind before stop returns.
        await new Promise((resolve) => setImmediate(resolve));
    }

    /**
     * Returns a sample of latest memory snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getMemorySample(sampleDurationMillis?: number) {
        return this._getSample(this.memorySnapshots, sampleDurationMillis);
    }

    /**
     * Returns a sample of latest event loop snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getEventLoopSample(sampleDurationMillis?: number) {
        return this._getSample(this.eventLoopSnapshots, sampleDurationMillis);
    }

    /**
     * Returns a sample of latest CPU snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getCpuSample(sampleDurationMillis?: number) {
        return this._getSample(this.cpuSnapshots, sampleDurationMillis);
    }

    /**
     * Returns a sample of latest Client snapshots, with the size of the sample defined
     * by the sampleDurationMillis parameter. If omitted, it returns a full snapshot history.
     */
    getClientSample(sampleDurationMillis?: number) {
        return this._getSample(this.clientSnapshots, sampleDurationMillis);
    }

    /**
     * Finds the latest snapshots by sampleDurationMillis in the provided array.
     */
    protected _getSample<T extends { createdAt: Date }>(snapshots: T[], sampleDurationMillis?: number): T[] {
        if (!sampleDurationMillis) return snapshots;

        const sample: T[] = [];
        let idx = snapshots.length;
        if (!idx) return sample;

        const latestTime = snapshots[idx - 1].createdAt;
        while (idx--) {
            const snapshot = snapshots[idx];
            if (+latestTime - +snapshot.createdAt <= sampleDurationMillis) {
                sample.unshift(snapshot);
            } else {
                break;
            }
        }

        return sample;
    }

    /**
     * Creates a snapshot of current memory usage
     * using the Apify platform `systemInfo` event.
     */
    protected _snapshotMemoryOnPlatform(systemInfo: SystemInfo) {
        const now = new Date();
        this._pruneSnapshots(this.memorySnapshots, now);
        const { memCurrentBytes } = systemInfo;
        const snapshot: MemorySnapshot = {
            createdAt: now,
            isOverloaded: memCurrentBytes! / this.maxMemoryBytes! > this.maxUsedMemoryRatio,
            usedBytes: memCurrentBytes,
        };

        this.memorySnapshots.push(snapshot);
        this._memoryOverloadWarning(systemInfo);
    }

    /**
     * Creates a snapshot of current memory usage using the Apify platform `systemInfo` event.
     */
    protected async _snapshotMemoryOnLocal(intervalCallback: () => unknown): Promise<void> {
        try {
            const now = new Date();
            const memInfo = await this._getMemoryInfo();
            const { mainProcessBytes, childProcessesBytes } = memInfo;
            this._pruneSnapshots(this.memorySnapshots, now);

            const usedBytes = mainProcessBytes + childProcessesBytes;
            const snapshot = {
                createdAt: now,
                isOverloaded: usedBytes / this.maxMemoryBytes! > this.maxUsedMemoryRatio,
                usedBytes,
            };

            this.memorySnapshots.push(snapshot);
        } catch (err) {
            this.log.exception(err as Error, 'Memory snapshot failed.');
        } finally {
            intervalCallback();
        }
    }

    /**
     * Checks for critical memory overload and logs it to the console.
     */
    protected _memoryOverloadWarning({ memCurrentBytes }: SystemInfo) {
        const now = new Date();
        if (this.lastLoggedCriticalMemoryOverloadAt && +now < +this.lastLoggedCriticalMemoryOverloadAt + CRITICAL_OVERLOAD_RATE_LIMIT_MILLIS) return;

        const maxDesiredMemoryBytes = this.maxUsedMemoryRatio * this.maxMemoryBytes!;
        const reserveMemory = this.maxMemoryBytes! * (1 - this.maxUsedMemoryRatio) * RESERVE_MEMORY_RATIO;
        const criticalOverloadBytes = maxDesiredMemoryBytes + reserveMemory;
        const isCriticalOverload = memCurrentBytes! > criticalOverloadBytes;

        if (isCriticalOverload) {
            const usedPercentage = Math.round((memCurrentBytes! / this.maxMemoryBytes!) * 100);
            const toMb = (bytes: number) => Math.round(bytes / (1024 ** 2));
            this.log.warning('Memory is critically overloaded. '
                + `Using ${toMb(memCurrentBytes!)} MB of ${toMb(this.maxMemoryBytes!)} MB (${usedPercentage}%). Consider increasing the actor memory.`);
            this.lastLoggedCriticalMemoryOverloadAt = now;
        }
    }

    /**
     * Creates a snapshot of current event loop delay.
     */
    protected _snapshotEventLoop(intervalCallback: () => unknown) {
        const now = new Date();
        this._pruneSnapshots(this.eventLoopSnapshots, now);

        const snapshot = {
            createdAt: now,
            isOverloaded: false,
            exceededMillis: 0,
        };

        const previousSnapshot = this.eventLoopSnapshots[this.eventLoopSnapshots.length - 1];
        if (previousSnapshot) {
            const { createdAt } = previousSnapshot;
            const delta = now.getTime() - +createdAt - this.eventLoopSnapshotIntervalMillis;

            if (delta > this.maxBlockedMillis) snapshot.isOverloaded = true;
            snapshot.exceededMillis = Math.max(delta - this.maxBlockedMillis, 0);
        }

        this.eventLoopSnapshots.push(snapshot);
        intervalCallback();
    }

    /**
     * Creates a snapshot of current CPU usage using the Apify platform `systemInfo` event.
     */
    protected _snapshotCpuOnPlatform(systemInfo: SystemInfo) {
        const { cpuCurrentUsage, isCpuOverloaded } = systemInfo;
        const createdAt = new Date(systemInfo.createdAt!);
        this._pruneSnapshots(this.cpuSnapshots, createdAt);

        this.cpuSnapshots.push({
            createdAt,
            isOverloaded: isCpuOverloaded!,
            usedRatio: Math.ceil(cpuCurrentUsage! / 100),
        });
    }

    /**
     * Creates a snapshot of current CPU usage using OS provided metrics.
     */
    protected _snapshotCpuOnLocal(intervalCallback: () => unknown): void {
        const now = new Date();
        this._pruneSnapshots(this.eventLoopSnapshots, now);

        const ticks = this._getCurrentCpuTicks();
        const snapshot = {
            createdAt: now,
            isOverloaded: false,
            ticks,
            usedRatio: 0,
        };

        const previousSnapshot = this.cpuSnapshots[this.cpuSnapshots.length - 1];

        if (previousSnapshot) {
            const { ticks: prevTicks } = previousSnapshot;
            const idleTicksDelta = ticks.idle - prevTicks!.idle;
            const totalTicksDelta = ticks.total - prevTicks!.total;
            const usedCpuRatio = 1 - (idleTicksDelta / totalTicksDelta);

            if (usedCpuRatio > this.maxUsedCpuRatio) snapshot.isOverloaded = true;
            snapshot.usedRatio = Math.ceil(usedCpuRatio);
        }

        this.cpuSnapshots.push(snapshot);
        intervalCallback();
    }

    protected _getCurrentCpuTicks() {
        const cpus = os.cpus();
        return cpus.reduce((acc, cpu) => {
            const cpuTimes = Object.values(cpu.times);
            return {
                idle: acc.idle + cpu.times.idle,
                total: acc.total + cpuTimes.reduce((sum, num) => sum + num),
            };
        }, { idle: 0, total: 0 });
    }

    /**
     * Creates a snapshot of current API state by checking for
     * rate limit errors. Only errors produced by a 2nd retry
     * of the API call are considered for snapshotting since
     * earlier errors may just be caused by a random spike in
     * number of requests and do not necessarily signify API
     * overloading.
     */
    protected _snapshotClient(intervalCallback: () => unknown) {
        const now = new Date();
        this._pruneSnapshots(this.clientSnapshots, now);

        const allErrorCounts = Configuration.getDefaultClient().stats.rateLimitErrors;
        const currentErrCount = allErrorCounts[CLIENT_RATE_LIMIT_ERROR_RETRY_COUNT] || 0;

        // Handle empty snapshots array
        const snapshot = {
            createdAt: now,
            isOverloaded: false,
            rateLimitErrorCount: currentErrCount,
        };
        const previousSnapshot = this.clientSnapshots[this.clientSnapshots.length - 1];
        if (previousSnapshot) {
            const { rateLimitErrorCount } = previousSnapshot;
            const delta = currentErrCount - rateLimitErrorCount;
            if (delta > this.maxClientErrors) snapshot.isOverloaded = true;
        }

        this.clientSnapshots.push(snapshot);
        intervalCallback();
    }

    /**
     * Removes snapshots that are older than the snapshotHistorySecs option
     * from the array (destructively - in place).
     */
    protected _pruneSnapshots(snapshots: MemorySnapshot[] | CpuSnapshot[] | EventLoopSnapshot[] | ClientSnapshot[], now: Date) {
        let oldCount = 0;
        for (let i = 0; i < snapshots.length; i++) {
            const { createdAt } = snapshots[i];
            if (now.getTime() - new Date(createdAt).getTime() > this.snapshotHistoryMillis) oldCount++;
            else break;
        }
        snapshots.splice(0, oldCount);
    }

    /**
     * Calculate max memory for platform or local usage.
     */
    protected async _ensureCorrectMaxMemory() {
        if (this.maxMemoryBytes) return;
        const { totalBytes } = await this._getMemoryInfo();
        this.maxMemoryBytes = Math.ceil(totalBytes / 4);
        // NOTE: Log as AutoscaledPool, so that users are not confused what "Snapshotter" is
        this.log.info(`Setting max memory of this run to ${Math.round(this.maxMemoryBytes / 1024 / 1024)} MB. Use the ${ENV_VARS.MEMORY_MBYTES} environment variable to override it.`); // eslint-disable-line max-len
    }

    /**
     * Helper method for easier mocking.
     */
    private async _getMemoryInfo() {
        return getMemoryInfo();
    }
}
