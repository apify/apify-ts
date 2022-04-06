import { ensureDirSync, readdirSync } from 'fs-extra';
import { ArgumentError } from 'ow';
import { join } from 'path';
import type { Database, Statement } from 'better-sqlite3-with-prebuilds';
import { storage } from '@crawlers/core';
import { ApifyStorageLocal } from '@apify/storage-local';
import { STORAGE_NAMES, DATABASE_FILE_NAME } from '@apify/storage-local/dist/consts';
import { RequestQueueEmulator } from '@apify/storage-local/dist/emulators/request_queue_emulator';
import { uniqueKeyToRequestId } from '@apify/storage-local/dist/utils';
import type { DatabaseConnectionCache } from '@apify/storage-local/dist/database_connection_cache';
import type { RequestModel } from '@apify/storage-local/dist/resource_clients/request_queue';
import { prepareTestDir, removeTestDir } from './_tools';

const REQUESTS_TABLE_NAME = `${STORAGE_NAMES.REQUEST_QUEUES}_requests`;

/**
 * Queue ID must always be 1, because we keep only a single
 * queue per DB file and SQLite starts indexing at 1.
 */
const QUEUE_ID = 1;

const TEST_QUEUES = {
    1: {
        name: 'first',
        requestCount: 15,
    },
    2: {
        name: 'second',
        requestCount: 35,
    },
    3: {
        name: 'batch-requests',
        requestCount: 0,
    },
};

export interface TestQueue {
    name: string;
    requestCount: number;
}

let STORAGE_DIR: string;
let storageLocal: ApifyStorageLocal;
let counter: ReturnType<typeof createCounter>;
let queueNameToDb: (name: string) => Database;
let markRequestHandled: (db: Database, requestId: string) => void;
beforeEach(() => {
    STORAGE_DIR = prepareTestDir();
    storageLocal = new ApifyStorageLocal({
        storageDir: STORAGE_DIR,
    });
    const requestQueuesDir = join(STORAGE_DIR, STORAGE_NAMES.REQUEST_QUEUES);
    queueNameToDb = (name: string) => {
        const dbPath = join(requestQueuesDir, name, DATABASE_FILE_NAME);
        return storageLocal.dbConnections.openConnection(dbPath);
    };
    counter = createCounter(requestQueuesDir, storageLocal.dbConnections);
    markRequestHandled = (db: Database, rId: string) => {
        db.transaction((requestId: string) => {
            db.prepare(`
                UPDATE ${REQUESTS_TABLE_NAME}
                SET orderNo = null
                WHERE queueId = ${QUEUE_ID} AND id = ?
            `).run(requestId);
            db.prepare(`
                UPDATE ${STORAGE_NAMES.REQUEST_QUEUES}
                SET handledRequestCount = handledRequestCount + 1
                WHERE id = ${QUEUE_ID}
            `).run();
        })(rId);
    };
    seed(requestQueuesDir, storageLocal.dbConnections);
});

afterEach(() => {
    storageLocal.dbConnections.closeAllConnections();
});

afterAll(() => {
    removeTestDir(STORAGE_NAMES.REQUEST_QUEUES);
});

describe('sanity checks for seeded data', () => {
    test('queues directory exists', () => {
        const subDirs = readdirSync(STORAGE_DIR);
        expect(subDirs).toContain(STORAGE_NAMES.REQUEST_QUEUES);
    });

    test('seeded queues exist', () => {
        expect(counter.queues()).toBe(3);
    });

    Object.values(TEST_QUEUES).forEach((queue) => {
        test('queues table exists', () => {
            const db = queueNameToDb(queue.name);
            const { name } = db.prepare(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='${STORAGE_NAMES.REQUEST_QUEUES}';
            `).get();
            expect(name).toBe(STORAGE_NAMES.REQUEST_QUEUES);
        });

        test('requests table exists', () => {
            const db = queueNameToDb(queue.name);
            const { name } = db.prepare(`
                SELECT name FROM sqlite_master
                WHERE type='table' AND name='${REQUESTS_TABLE_NAME}';
            `).get();
            expect(name).toBe(REQUESTS_TABLE_NAME);
        });

        test('queues have requests', () => {
            const count = counter.requests(queue.name);
            expect(count).toBe(queue.requestCount);
        });
    });
});

describe('timestamps:', () => {
    const testInitTimestamp = Date.now();
    const queueName = 'first';
    let db: Database;
    let selectTimestamps: Statement;
    beforeEach(() => {
        db = queueNameToDb(queueName);
        selectTimestamps = db.prepare(`
            SELECT modifiedAt, accessedAt, createdAt FROM ${STORAGE_NAMES.REQUEST_QUEUES}
            WHERE id = ${QUEUE_ID}
        `);
    });

    test('createdAt has a valid date', () => {
        const { createdAt } = selectTimestamps.get();
        const createdAtTimestamp = new Date(createdAt).getTime();
        expect(createdAtTimestamp).toBeGreaterThan(testInitTimestamp);
        expect(createdAtTimestamp).toBeLessThan(Date.now());
    });

    test('get updated on request UPDATE', () => {
        const beforeUpdate = selectTimestamps.get();
        const request = numToRequest(1);
        db.prepare(`
            UPDATE ${REQUESTS_TABLE_NAME}
            SET retryCount = 10
            WHERE queueId = ${QUEUE_ID} AND id = ?
        `).run(request.id);
        const afterUpdate = selectTimestamps.get();
        expect(new Date(afterUpdate.modifiedAt).getTime()).toBeGreaterThan(new Date(beforeUpdate.modifiedAt).getTime());
        expect(new Date(afterUpdate.accessedAt).getTime()).toBeGreaterThan(new Date(beforeUpdate.accessedAt).getTime());
    });

    test('get updated on request INSERT', () => {
        const beforeUpdate = selectTimestamps.get();
        const request = numToRequest(100);
        request.json = 'x';
        request.queueId = `${QUEUE_ID}`;
        db.prepare(`
            INSERT INTO ${REQUESTS_TABLE_NAME}(queueId, id, url, uniqueKey, json)
            VALUES(:queueId, :id, :url, :uniqueKey, :json)
        `).run(request);
        const afterUpdate = selectTimestamps.get();
        expect(new Date(afterUpdate.modifiedAt).getTime()).toBeGreaterThan(new Date(beforeUpdate.modifiedAt).getTime());
        expect(new Date(afterUpdate.accessedAt).getTime()).toBeGreaterThan(new Date(beforeUpdate.accessedAt).getTime());
    });

    test('get updated on request DELETE', () => {
        const beforeUpdate = selectTimestamps.get();
        const request = numToRequest(1);
        db.prepare(`
            DELETE FROM ${REQUESTS_TABLE_NAME}
            WHERE queueId = ${QUEUE_ID} AND id = ?
        `).run(request.id);
        const afterUpdate = selectTimestamps.get();
        expect(new Date(afterUpdate.modifiedAt).getTime()).toBeGreaterThan(new Date(beforeUpdate.modifiedAt).getTime());
        expect(new Date(afterUpdate.accessedAt).getTime()).toBeGreaterThan(new Date(beforeUpdate.accessedAt).getTime());
    });

    test('getRequest updates accessedAt', async () => {
        const beforeGet = selectTimestamps.get();
        const requestId = numToRequest(1).id;
        await storageLocal.requestQueue(queueName).getRequest(requestId!);
        const afterGet = selectTimestamps.get();
        expect(beforeGet.modifiedAt).toBe(afterGet.modifiedAt);
        expect(new Date(afterGet.accessedAt).getTime()).toBeGreaterThan(new Date(beforeGet.accessedAt).getTime());
    });

    test('listHead updates accessedAt', async () => {
        const beforeGet = selectTimestamps.get();
        await storageLocal.requestQueue(queueName).listHead();
        const afterGet = selectTimestamps.get();
        expect(beforeGet.modifiedAt).toBe(afterGet.modifiedAt);
        expect(new Date(afterGet.accessedAt).getTime()).toBeGreaterThan(new Date(beforeGet.accessedAt).getTime());
    });
});

describe('request counts:', () => {
    const queueName = 'first';
    const startCount = TEST_QUEUES[1].requestCount;
    let db: Database;
    let selectRequestCounts: Statement;
    beforeEach(() => {
        db = queueNameToDb(queueName);
        selectRequestCounts = db.prepare(`
            SELECT totalRequestCount, handledRequestCount, pendingRequestCount FROM ${STORAGE_NAMES.REQUEST_QUEUES}
            WHERE id = ${QUEUE_ID}
        `);
    });
    test('stay the same after get functions', async () => {
        const requestId = numToRequest(1).id;

        await storageLocal.requestQueue(queueName).getRequest(requestId!);
        let counts = selectRequestCounts.get();
        expect(counts.totalRequestCount).toBe(startCount);
        expect(counts.handledRequestCount).toBe(0);
        expect(counts.pendingRequestCount).toBe(startCount);

        await storageLocal.requestQueue(queueName).listHead();
        counts = selectRequestCounts.get();
        expect(counts.totalRequestCount).toBe(startCount);
        expect(counts.handledRequestCount).toBe(0);
        expect(counts.pendingRequestCount).toBe(startCount);
    });

    test('adding request increments totalRequestCount', async () => {
        const request = numToRequest(startCount + 5);
        request.id = undefined;

        await storageLocal.requestQueue(queueName).addRequest(request);
        const counts = selectRequestCounts.get();
        expect(counts.totalRequestCount).toBe(startCount + 1);
        expect(counts.handledRequestCount).toBe(0);
        expect(counts.pendingRequestCount).toBe(startCount + 1);
    });

    test('adding handled request increments handledRequestCount', async () => {
        const request = numToRequest(startCount + 5);
        request.id = undefined;
        request.handledAt = new Date();

        await storageLocal.requestQueue(queueName).addRequest(request);
        const counts = selectRequestCounts.get();
        expect(counts.totalRequestCount).toBe(startCount + 1);
        expect(counts.handledRequestCount).toBe(1);
        expect(counts.pendingRequestCount).toBe(startCount);
    });

    test('handling of unhandled request increments handledRequestCount', async () => {
        const request = numToRequest(1);
        request.handledAt = new Date();

        await storageLocal.requestQueue(queueName).updateRequest(request);
        const counts = selectRequestCounts.get();
        expect(counts.totalRequestCount).toBe(startCount);
        expect(counts.handledRequestCount).toBe(1);
        expect(counts.pendingRequestCount).toBe(startCount - 1);
    });

    test('handling of a handled request is a no-op', async () => {
        const request = numToRequest(1);
        markRequestHandled(db, request.id!);
        let counts = selectRequestCounts.get();
        expect(counts.handledRequestCount).toBe(1);
        request.handledAt = new Date();

        await storageLocal.requestQueue(queueName).updateRequest(request);
        counts = selectRequestCounts.get();
        expect(counts.totalRequestCount).toBe(startCount);
        expect(counts.handledRequestCount).toBe(1);
        expect(counts.pendingRequestCount).toBe(startCount - 1);
    });

    test('un-handling of a handled request decrements handledRequestCount', async () => {
        const request = numToRequest(1);
        request.handledAt = undefined;
        markRequestHandled(db, request.id!);
        let counts = selectRequestCounts.get();
        expect(counts.handledRequestCount).toBe(1);

        await storageLocal.requestQueue(queueName).updateRequest(request);
        counts = selectRequestCounts.get();
        expect(counts.totalRequestCount).toBe(startCount);
        expect(counts.handledRequestCount).toBe(0);
        expect(counts.pendingRequestCount).toBe(startCount);
    });

    test('un-handling of a not handled request is a no-op', async () => {
        const request = numToRequest(1);
        request.handledAt = undefined;

        await storageLocal.requestQueue(queueName).updateRequest(request);
        const counts = selectRequestCounts.get();
        expect(counts.totalRequestCount).toBe(startCount);
        expect(counts.handledRequestCount).toBe(0);
        expect(counts.pendingRequestCount).toBe(startCount);
    });

    /* eslint-disable @typescript-eslint/no-empty-function */
    test.skip('deleting a request decrements totalRequestCount', async () => {

    });

    test.skip('deleting a handled request decrements handledRequestCount', async () => {

    });

    test.skip('deleting an pending request does not decrement handledRequestCount', async () => {

    });
    /* eslint-enable @typescript-eslint/no-empty-function */
});

describe('get queue', () => {
    test('returns correct queue', async () => {
        let queue = (await storageLocal.requestQueue('first').get())!;
        expect(queue.id).toBe('first');
        expect(queue.name).toBe('first');
        queue = (await storageLocal.requestQueue('second').get())!;
        expect(queue.id).toBe('second');
        expect(queue.name).toBe('second');
    });

    test('returns undefined for non-existent queues', async () => {
        const queue = await storageLocal.requestQueue('third').get();
        expect(queue).toBeUndefined();
    });
});

describe('getOrCreate', () => {
    test('returns existing queue by name', async () => {
        const queue = await storageLocal.requestQueues().getOrCreate('first');
        expect(queue.id).toBe('first');
        const count = counter.queues();
        expect(count).toBe(3);
    });

    test('creates a new queue with name', async () => {
        const queueName = 'third';
        const queue = await storageLocal.requestQueues().getOrCreate(queueName);
        expect(queue.id).toBe(queueName);
        expect(queue.name).toBe(queueName);
        const count = counter.queues();
        expect(count).toBe(4);
    });
});

describe('deleteQueue', () => {
    test('deletes correct queue', async () => {
        await storageLocal.requestQueue('first').delete();
        const count = counter.queues();
        expect(count).toBe(2);
    });
});

describe('addRequest', () => {
    const queueName = 'first';
    const startCount = TEST_QUEUES[1].requestCount;

    let db: Database;
    let request: RequestModel;
    let requestId: string;
    beforeEach(() => {
        db = queueNameToDb(queueName);
        request = numToRequest(1);
        requestId = request.id!;
        request.id = undefined;
    });

    test('adds a request', async () => { /* eslint-disable no-shadow */
        const newRequest = numToRequest(startCount + 1);
        const newRequestId = newRequest.id;
        newRequest.id = undefined;

        const queueOperationInfo = await storageLocal.requestQueue(queueName).addRequest(newRequest);
        expect(queueOperationInfo).toEqual({
            requestId: newRequestId,
            wasAlreadyPresent: false,
            wasAlreadyHandled: false,
        });
        expect(counter.requests(queueName)).toBe(startCount + 1);

        const requestModel = db.prepare(`
            SELECT * FROM ${REQUESTS_TABLE_NAME}
            WHERE queueId = ${QUEUE_ID} AND id = ?
        `).get(newRequestId);
        expect(requestModel.queueId).toBe(QUEUE_ID);
        expect(requestModel.id).toBe(newRequestId);
        expect(requestModel.url).toBe(newRequest.url);
        expect(requestModel.uniqueKey).toBe(newRequest.uniqueKey);
        expect(requestModel.retryCount).toBe(0);
        expect(requestModel.method).toBe('GET');
        expect(typeof requestModel.orderNo).toBe('number');

        const savedRequest = JSON.parse(requestModel.json);
        expect(savedRequest.id).toBe(newRequestId);
        expect(savedRequest).toMatchObject({ ...newRequest, id: newRequestId });
    });

    test('succeeds when request is already present', async () => {
        const queueOperationInfo = await storageLocal.requestQueue(queueName).addRequest(request);
        expect(queueOperationInfo).toEqual({
            requestId,
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
        });
        expect(counter.requests(queueName)).toBe(startCount);
    });

    test('does not update request values when present', async () => {
        const newRequest = {
            ...request,
            handledAt: new Date(),
            method: 'POST',
        } as const;

        await storageLocal.requestQueue(queueName).addRequest(newRequest);
        const requestModel = db.prepare(`
            SELECT * FROM ${REQUESTS_TABLE_NAME}
            WHERE queueId = ${QUEUE_ID} AND id = ?
        `).get(requestId);
        expect(requestModel.id).toBe(requestId);
        expect(requestModel.method).toBe('GET');
        expect(typeof requestModel.orderNo).toBe('number');

        const savedRequest = JSON.parse(requestModel.json);
        expect(savedRequest.id).toBe(requestId);
        expect(savedRequest).toMatchObject({ ...request, id: requestId });
    });

    test('succeeds when request is already handled', async () => {
        markRequestHandled(db, requestId);

        const queueOperationInfo = await storageLocal.requestQueue(queueName).addRequest(request);
        expect(queueOperationInfo).toEqual({
            requestId,
            wasAlreadyPresent: true,
            wasAlreadyHandled: true,
        });
        expect(counter.requests(queueName)).toBe(startCount);
    });

    test('returns wasAlreadyHandled: false when request is added handled', async () => {
        request.handledAt = new Date();

        const queueOperationInfo = await storageLocal.requestQueue(queueName).addRequest(request);
        expect(queueOperationInfo).toEqual({
            requestId,
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
        });
        expect(counter.requests(queueName)).toBe(startCount);
    });

    test('forefront adds request to queue head', async () => { /* eslint-disable no-shadow */
        const newRequest = numToRequest(startCount + 1);
        const newRequestId = newRequest.id;
        newRequest.id = undefined;

        await storageLocal.requestQueue(queueName).addRequest(newRequest, { forefront: true });
        expect(counter.requests(queueName)).toBe(startCount + 1);
        const firstId = db.prepare(`
            SELECT id FROM ${REQUESTS_TABLE_NAME}
            WHERE queueId = ${QUEUE_ID} AND orderNo IS NOT NULL
            LIMIT 1
        `).pluck().get();
        expect(firstId).toBe(newRequestId);
    });

    describe('throws', () => {
        let throwRequest: RequestModel;
        beforeEach(() => {
            throwRequest = numToRequest(startCount + 1);
            throwRequest.id = undefined;
        });

        test('on missing url', async () => {
            Reflect.deleteProperty(throwRequest, 'url');

            try {
                await storageLocal.requestQueue(queueName).addRequest(throwRequest);
                throw new Error('wrong-error');
            } catch (err) {
                expect(err).toBeInstanceOf(ArgumentError);
            }
        });
        test('on missing uniqueKey', async () => {
            Reflect.deleteProperty(throwRequest, 'uniqueKey');

            try {
                await storageLocal.requestQueue(queueName).addRequest(throwRequest);
                throw new Error('wrong-error');
            } catch (err) {
                expect(err).toBeInstanceOf(ArgumentError);
            }
        });
        test('when id is provided', async () => {
            throwRequest.id = uniqueKeyToRequestId(throwRequest.uniqueKey);
            try {
                await storageLocal.requestQueue(queueName).addRequest(throwRequest);
                throw new Error('wrong-error');
            } catch (err) {
                expect(err).toBeInstanceOf(ArgumentError);
            }
        });
        test('when queue does not exist', async () => {
            const nonExistantQueueName = 'this-queue-does-not-exist';
            try {
                await storageLocal.requestQueue(nonExistantQueueName).addRequest(throwRequest);
                throw new Error('wrong-error');
            } catch (err: any) {
                expect(err.message).toBe(`Request queue with id: ${nonExistantQueueName} does not exist.`);
            }
        });
    });
});

test('addRequests', async () => {
    const queueName = 'batch-requests';
    const db = queueNameToDb(queueName);
    const startCount = 0;
    const queue = storageLocal.requestQueue(queueName);

    const requestA = numToRequest(startCount + 1);
    const requestAId = requestA.id!;
    requestA.id = undefined;

    // Test adding 1 request
    const firstRequestAdded = {
        requestId: requestAId,
        wasAlreadyHandled: false,
        wasAlreadyPresent: false,
        uniqueKey: requestA.uniqueKey,
    };

    const addRequestsResult1 = await queue.batchAddRequests([requestA]);

    expect(addRequestsResult1.processedRequests).toHaveLength(1);
    expect(addRequestsResult1.processedRequests[0]).toEqual({
        ...firstRequestAdded,
    });

    // Try to add a request with the same URL again, expecting cached
    const addRequestsResult2 = await queue.batchAddRequests([requestA]);
    expect(addRequestsResult2.unprocessedRequests).toHaveLength(1);
    expect(addRequestsResult2.unprocessedRequests[0]).toEqual<storage.UnprocessedRequest>({
        uniqueKey: requestAId,
        url: requestA.url,
        method: requestA.method,
    });

    // Adding more requests, forefront
    const requestB = numToRequest(startCount + 2);
    const requestBId = requestB.id!;
    requestB.id = undefined;

    const requestC = numToRequest(startCount + 3);
    const requestCId = requestC.id!;
    requestC.id = undefined;

    const addRequestsResult3 = await queue.batchAddRequests([requestB, requestC], { forefront: true });
    expect(addRequestsResult3.processedRequests).toHaveLength(2);
    expect(addRequestsResult3.processedRequests[0]).toEqual<storage.ProcessedRequest>({
        requestId: requestBId,
        uniqueKey: requestB.uniqueKey,
        wasAlreadyHandled: false,
        wasAlreadyPresent: false,
    });
    expect(addRequestsResult3.processedRequests[1]).toEqual<storage.ProcessedRequest>({
        requestId: requestCId,
        uniqueKey: requestC.uniqueKey,
        wasAlreadyHandled: false,
        wasAlreadyPresent: false,
    });

    const requestModels = db.prepare(`
        SELECT * FROM ${REQUESTS_TABLE_NAME}
        WHERE queueId = ${QUEUE_ID};
    `).all();

    expect(requestModels).toHaveLength(3);
});

describe('getRequest', () => {
    const queueName = 'first';
    const startCount = TEST_QUEUES[1].requestCount;

    test('gets requests', async () => {
        let expectedReq = numToRequest(3);
        let request = await storageLocal.requestQueue(queueName).getRequest(expectedReq.id!);
        expect(request).toEqual(expectedReq);
        expectedReq = numToRequest(30);
        request = await storageLocal.requestQueue('second').getRequest(expectedReq.id!);
        expect(request).toEqual(expectedReq);
    });

    test('returns undefined for non-existent requests', async () => {
        const expectedReq = numToRequest(startCount + 1);
        const request = await storageLocal.requestQueue('first').getRequest(expectedReq.id!);
        expect(request).toBeUndefined();
    });

    describe('throws', () => {
        let request: RequestModel;
        beforeEach(() => {
            request = numToRequest(1);
        });

        test('when queue does not exist', async () => {
            const nonExistentQueueName = 'this-queue-does-not-exist';
            try {
                await storageLocal.requestQueue(nonExistentQueueName).getRequest(request.id!);
                throw new Error('wrong-error');
            } catch (err: any) {
                expect(err.message).toBe(`Request queue with id: ${nonExistentQueueName} does not exist.`);
            }
        });
    });
});

describe('updateRequest', () => {
    const queueName = 'first';
    const startCount = TEST_QUEUES[1].requestCount;
    const retryCount = 2;
    const method = 'POST';

    let db: Database;
    let request: RequestModel;
    beforeEach(() => {
        db = queueNameToDb(queueName);
        request = {
            ...numToRequest(1),
            retryCount,
            method,
        };
    });

    test('updates a request and its info', async () => {
        const queueOperationInfo = await storageLocal.requestQueue(queueName).updateRequest(request);
        expect(queueOperationInfo).toEqual({
            requestId: request.id,
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
        });

        const requestModel = db.prepare(`
            SELECT * FROM ${REQUESTS_TABLE_NAME}
            WHERE queueId = ${QUEUE_ID} AND id = ?
        `).get(request.id);

        expect(requestModel.method).toBe(method);
        expect(requestModel.retryCount).toBe(retryCount);
        const requestInstance = JSON.parse(requestModel.json);
        expect(requestInstance).toEqual(request);
        expect(counter.requests(queueName)).toBe(startCount);
    });

    test('adds request when not present', async () => {
        const updatedRequest = numToRequest(startCount + 1);

        const queueOperationInfo = await storageLocal.requestQueue(queueName).updateRequest(updatedRequest);
        expect(queueOperationInfo).toEqual({
            requestId: updatedRequest.id,
            wasAlreadyPresent: false,
            wasAlreadyHandled: false,
        });
        expect(counter.requests(queueName)).toBe(startCount + 1);
    });

    test('succeeds when request is already handled', async () => {
        markRequestHandled(db, request.id!);

        const queueOperationInfo = await storageLocal.requestQueue(queueName).updateRequest(request);
        expect(queueOperationInfo).toEqual({
            requestId: request.id,
            wasAlreadyPresent: true,
            wasAlreadyHandled: true,
        });
        expect(counter.requests(queueName)).toBe(startCount);
    });

    test('returns wasAlreadyHandled: false when request is updated to handled', async () => {
        request.handledAt = new Date();

        const queueOperationInfo = await storageLocal.requestQueue(queueName).updateRequest(request);
        expect(queueOperationInfo).toEqual({
            requestId: request.id,
            wasAlreadyPresent: true,
            wasAlreadyHandled: false,
        });
        expect(counter.requests(queueName)).toBe(startCount);
    });

    test('forefront moves request to queue head', async () => {
        await storageLocal.requestQueue(queueName).updateRequest(request, { forefront: true });
        expect(counter.requests(queueName)).toBe(startCount);
        const requestId = db.prepare(`
            SELECT id FROM ${REQUESTS_TABLE_NAME}
            WHERE queueId = ${QUEUE_ID} AND orderNo IS NOT NULL
            LIMIT 1
        `).pluck().get();
        expect(requestId).toBe(request.id);
    });

    describe('throws', () => {
        test('on missing url', async () => {
            Reflect.deleteProperty(request, 'url');

            try {
                await storageLocal.requestQueue(queueName).updateRequest(request);
            } catch (err) {
                expect(err).toBeInstanceOf(ArgumentError);
            }
        });
        test('on missing uniqueKey', async () => {
            Reflect.deleteProperty(request, 'uniqueKey');

            try {
                await storageLocal.requestQueue(queueName).updateRequest(request);
                throw new Error('wrong-error');
            } catch (err) {
                expect(err).toBeInstanceOf(ArgumentError);
            }
        });
        test('when id is not provided', async () => {
            request.id = undefined;
            try {
                await storageLocal.requestQueue(queueName).updateRequest(request);
                throw new Error('wrong-error');
            } catch (err) {
                expect(err).toBeInstanceOf(ArgumentError);
            }
        });
        test('when queue does not exist', async () => {
            const nonExistantQueueName = 'this-queue-does-not-exist';
            try {
                await storageLocal.requestQueue(nonExistantQueueName).updateRequest(request);
                throw new Error('wrong-error');
            } catch (err: any) {
                expect(err.message).toBe(`Request queue with id: ${nonExistantQueueName} does not exist.`);
            }
        });
    });
});

describe.skip('deleteRequest', () => {
    const queueName = 'first';
    const startCount = TEST_QUEUES[1].requestCount;
    let db: Database;
    let request: RequestModel;
    beforeEach(() => {
        db = queueNameToDb(queueName);
        request = numToRequest(5);
    });

    test('deletes request', async () => {
        await storageLocal.requestQueue(queueName).deleteRequest(request.id!);
        const requestModel = db.prepare(`
            SELECT * FROM ${REQUESTS_TABLE_NAME}
            WHERE queueId = ${QUEUE_ID} AND id = ?
        `).get(request.id);
        expect(requestModel).toBeUndefined();
        expect(counter.requests(queueName)).toBe(startCount - 1);
    });

    test('returns undefined for non-existent request', async () => {
        const newRequest = numToRequest(startCount + 1);
        const result = await storageLocal.requestQueue(queueName).deleteRequest(newRequest.id!);
        expect(result).toBeUndefined();
    });

    describe('throws', () => {
        test('when queue does not exist', async () => {
            const nonExistantQueueName = 'this-queue-does-not-exist';
            try {
                await storageLocal.requestQueue(nonExistantQueueName).deleteRequest(request.id!);
                throw new Error('wrong-error');
            } catch (err: any) {
                expect(err.message).toBe(`Request queue with id: ${nonExistantQueueName} does not exist.`);
            }
        });
    });
});

describe('listHead', () => {
    const queueName = 'second';
    const startCount = TEST_QUEUES[2].requestCount;

    let db: Database;
    beforeEach(() => {
        db = queueNameToDb(queueName);
    });

    test('fetches requests in correct order', async () => {
        const models = createRequestModels(queueName, startCount);
        const expectedItems = models
            .sort((a, b) => a.orderNo - b.orderNo)
            .map((m) => JSON.parse(m.json));

        const { items } = await storageLocal.requestQueue(queueName).listHead();
        expect(items).toEqual(expectedItems);
    });

    test('limit works', async () => {
        const limit = 10;
        const models = createRequestModels(queueName, startCount);
        const expectedItems = models
            .sort((a, b) => a.orderNo - b.orderNo)
            .slice(0, limit)
            .map((m) => JSON.parse(m.json));

        const { items } = await storageLocal.requestQueue(queueName).listHead({ limit });
        expect(items).toEqual(expectedItems);
    });

    test('handled requests are not shown', async () => {
        const handledCount = 10;
        const models = createRequestModels(queueName, startCount).sort((a, b) => a.orderNo - b.orderNo);
        const modelsToHandle = models.slice(0, handledCount);
        modelsToHandle.forEach((m) => markRequestHandled(db, m.id!));
        const expectedItems = models.slice(handledCount).map((m) => JSON.parse(m.json));

        const { items } = await storageLocal.requestQueue(queueName).listHead();
        expect(items).toEqual(expectedItems);
    });

    describe('throws', () => {
        test('when queue does not exist', async () => {
            const nonExistantQueueName = 'this-queue-does-not-exist';
            try {
                await storageLocal.requestQueue(nonExistantQueueName).listHead();
                throw new Error('wrong-error');
            } catch (err: any) {
                expect(err.message).toBe(`Request queue with id: ${nonExistantQueueName} does not exist.`);
            }
        });
    });
});

function seed(requestQueuesDir: string, dbConnections: DatabaseConnectionCache) {
    Object.values(TEST_QUEUES).forEach((queue) => {
        const queueDir = join(requestQueuesDir, queue.name);
        ensureDirSync(queueDir);

        const emulator = new RequestQueueEmulator({ queueDir, dbConnections });
        const id = insertQueue(emulator.db, queue);
        expect(id).toBe(QUEUE_ID);
        const models = createRequestModels(id, queue.requestCount);
        insertRequests(emulator.db, models);
    });
}

function insertQueue(db: Database, queue: TestQueue) {
    return db.prepare(`
        INSERT INTO ${STORAGE_NAMES.REQUEST_QUEUES}(name, totalRequestCount)
        VALUES(?, ?)
    `).run(queue.name, queue.requestCount).lastInsertRowid as number;
}

function insertRequests(db: Database, models: RequestModel[]) {
    const insert = db.prepare(`
        INSERT INTO ${REQUESTS_TABLE_NAME}(
            id, queueId, orderNo, url, uniqueKey, method, retryCount, json
        )
        VALUES(
            :id, :queueId, :orderNo, :url, :uniqueKey, :method, :retryCount, :json
        )
    `);
    models.forEach((model) => insert.run(model));
}

function createRequestModels(queueId: string | number, count: number) {
    const requestModels = [];
    for (let i = 0; i < count; i++) {
        const request = numToRequest(i);
        requestModels.push({
            ...request,
            orderNo: i % 4 === 0 ? -i : i,
            queueId: `${queueId}`,
            json: JSON.stringify(request),
        });
    }
    return requestModels;
}

function numToRequest(num: number): RequestModel {
    const url = `https://example.com/${num}`;
    return {
        id: uniqueKeyToRequestId(url),
        url,
        uniqueKey: url,
        method: 'GET',
        retryCount: 0,
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- Disable the rule
        // @ts-ignore Honestly, this data doesn't seem used, but I'll need someone to explain it to me
        userData: {
            label: 'detail',
            foo: 'bar',
        },
    };
}

function createCounter(requestQueuesDir: string, dbConnections: DatabaseConnectionCache) {
    return {
        queues() {
            let count = 0;
            const queueFolders = readdirSync(requestQueuesDir);
            queueFolders.forEach((queueName) => {
                const emulator = new RequestQueueEmulator({
                    queueDir: join(requestQueuesDir, queueName),
                    dbConnections,
                });
                const selectQueueCount = emulator.db.prepare(`SELECT COUNT(*) FROM ${STORAGE_NAMES.REQUEST_QUEUES}`).pluck();
                const queuesInDb = selectQueueCount.get();
                if (queuesInDb !== 1) throw new Error('We have a queue database with more than 1 queue.');
                count++;
            });
            return count;
        },
        requests(queueName: string) {
            const queueDir = join(requestQueuesDir, queueName);
            const emulator = new RequestQueueEmulator({ queueDir, dbConnections });
            const selectRequestCount = emulator.db.prepare(`SELECT COUNT(*) FROM ${REQUESTS_TABLE_NAME} WHERE queueId = ${QUEUE_ID}`).pluck();
            return selectRequestCount.get();
        },
    };
}
