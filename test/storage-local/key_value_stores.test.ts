import { emptyDirSync, ensureDirSync, readdirSync, readFile, writeFileSync } from 'fs-extra';
import { join } from 'path';
import * as stream from 'stream';
import { ApifyStorageLocal } from '@apify/storage-local';
// TODO do we want to export those symbols?
import { STORAGE_NAMES } from '@apify/storage-local/dist/consts';
import type { KeyValueStoreClient } from '@apify/storage-local/dist/resource_clients/key_value_store';
import { prepareTestDir, removeTestDir } from './_tools';

const TEST_STORES = {
    1: {
        name: 'first',
        recordCount: 5,
    },
    2: {
        name: 'second',
        recordCount: 35,
    },
};

interface TestStore {
    name: string;
    recordCount: number;
}

let STORAGE_DIR: string;
let storageLocal: ApifyStorageLocal;
let counter: ReturnType<typeof createCounter>;
let storeNameToDir: (storeName: string) => string;
beforeEach(() => {
    STORAGE_DIR = prepareTestDir();
    storageLocal = new ApifyStorageLocal({
        storageDir: STORAGE_DIR,
    });
    const keyValueStoresDir = join(STORAGE_DIR, STORAGE_NAMES.KEY_VALUE_STORES);
    storeNameToDir = (storeName) => {
        return join(keyValueStoresDir, storeName);
    };
    counter = createCounter(keyValueStoresDir);
    seed(keyValueStoresDir);
});

afterAll(() => {
    removeTestDir(STORAGE_NAMES.KEY_VALUE_STORES);
});

test('stores directory exists', () => {
    const subDirs = readdirSync(STORAGE_DIR);
    expect(subDirs).toContain(STORAGE_NAMES.KEY_VALUE_STORES);
});

describe('get store', () => {
    test('returns correct store', async () => {
        let store = (await storageLocal.keyValueStore('first').get())!;
        expect(store.id).toBe('first');
        expect(store.name).toBe('first');
        store = (await storageLocal.keyValueStore('second').get())!;
        expect(store.id).toBe('second');
        expect(store.name).toBe('second');
    });

    test('returns undefined for non-existent stores', async () => {
        const store = await storageLocal.keyValueStore('3').get();
        expect(store).toBeUndefined();
    });
});

describe('getOrCreate', () => {
    test('returns existing store by name', async () => {
        const store = await storageLocal.keyValueStores().getOrCreate('first');
        expect(store.id).toBe('first');
        const count = counter.stores();
        expect(count).toBe(2);
    });

    test('creates a new store with name', async () => {
        const storeName = 'third';
        const store = await storageLocal.keyValueStores().getOrCreate(storeName);
        expect(store.id).toBe('third');
        expect(store.name).toBe(storeName);
        const count = counter.stores();
        expect(count).toBe(3);
    });
});

describe('delete store', () => {
    test('deletes correct store', async () => {
        await storageLocal.keyValueStore('first').delete();
        const count = counter.stores();
        expect(count).toBe(1);
    });

    test('returns undefined for non-existent store', async () => {
        const result = await storageLocal.keyValueStore('non-existent').delete();
        expect(result).toBeUndefined();
    });
});

describe('setRecord', () => {
    const storeName = 'first';
    const startCount = TEST_STORES[1].recordCount;

    test('adds a value', async () => { /* eslint-disable no-shadow */
        const record = numToRecord(startCount + 1);

        await storageLocal.keyValueStore(storeName).setRecord(stripRecord(record));
        expect(counter.records(storeName)).toBe(startCount + 1);

        const recordPath = join(storeNameToDir(storeName), record.filename);
        const savedData = await readFile(recordPath);
        expect(savedData).toEqual(Buffer.from(record.value));
    });

    test('updates when key is already present', async () => {
        const seededRecord = numToRecord(1);
        const newRecord = stripRecord(seededRecord);
        newRecord.value = Buffer.from('abc');

        await storageLocal.keyValueStore(storeName).setRecord(newRecord);
        expect(counter.records(storeName)).toBe(startCount);
        const recordPath = join(storeNameToDir(storeName), seededRecord.filename);
        const savedData = await readFile(recordPath);
        expect(savedData).toEqual(newRecord.value);
    });

    test('setRecord() works with text', async () => {
        const key = 'some-key';
        const value = 'someValue';
        const expectedExtension = '.txt';

        const res = await storageLocal.keyValueStore(storeName).setRecord({ key, value });
        expect(res).toBeUndefined();

        const recordPath = join(storeNameToDir(storeName), key + expectedExtension);
        const savedData = await readFile(recordPath, 'utf8');
        expect(savedData).toEqual(value);
    });

    test('setRecord() works with object', async () => {
        const key = 'some-key';
        const value = { foo: 'bar', one: 1 };
        const expectedExtension = '.json';

        const res = await storageLocal.keyValueStore(storeName).setRecord({ key, value });
        expect(res).toBeUndefined();

        const recordPath = join(storeNameToDir(storeName), key + expectedExtension);
        const savedData = await readFile(recordPath, 'utf8');
        expect(JSON.parse(savedData)).toEqual(value);
    });

    test('setRecord() works with buffer', async () => {
        const key = 'some-key';
        const string = 'special chars 🤖✅';
        const value = Buffer.from(string);
        const expectedExtension = '.bin';

        const res = await storageLocal.keyValueStore(storeName).setRecord({ key, value });
        expect(res).toBeUndefined();

        const recordPath = join(storeNameToDir(storeName), key + expectedExtension);
        const savedData = await readFile(recordPath);
        expect(savedData).toEqual(value);
    });

    test('setRecord() works with pre-stringified JSON', async () => {
        const key = 'some-key';
        const contentType = 'application/json; charset=utf-8';
        const value = JSON.stringify({ foo: 'bar', one: 1 });
        const expectedExtension = '.json';

        const res = await storageLocal.keyValueStore(storeName).setRecord({ key, value, contentType });
        expect(res).toBeUndefined();

        const recordPath = join(storeNameToDir(storeName), key + expectedExtension);
        const savedData = await readFile(recordPath, 'utf8');
        expect(savedData).toEqual(value);
    });

    test('setRecord() works with Readable streams', async () => {
        const key = 'stream-test';
        const contentType = 'application/octet-stream';
        const rawData = Array.from({ length: 5000 }, () => '👋').join('');
        const value = stream.Readable.from(rawData, { encoding: 'utf8' });
        const expectedExtension = '.bin';

        const res = await storageLocal.keyValueStore(storeName).setRecord({ key, value, contentType });
        expect(res).toBeUndefined();

        const recordPath = join(storeNameToDir(storeName), key + expectedExtension);
        const savedData = await readFile(recordPath, 'utf8');
        expect(savedData).toEqual(rawData);
    });

    describe('throws', () => {
        test('when store does not exist', async () => {
            const id = 'non-existent';
            try {
                await storageLocal.keyValueStore(id).setRecord({ key: 'some-key', value: 'some-value' });
                throw new Error('wrong-error');
            } catch (err: any) {
                expect(err.message).toBe(`Key-value store with id: ${id} does not exist.`);
            }
        });
    });
});

describe('getRecord', () => {
    const storeName = 'first';
    const startCount = TEST_STORES[1].recordCount;

    test('gets values', async () => {
        let savedRecord = numToRecord(3);
        let record = await storageLocal.keyValueStore(storeName).getRecord(savedRecord.key);
        expect(record).toEqual(stripRecord(savedRecord));
        savedRecord = numToRecord(30);
        record = await storageLocal.keyValueStore('second').getRecord(savedRecord.key);
        expect(record).toEqual(stripRecord(savedRecord));
    });

    test('returns undefined for non-existent records', async () => {
        const savedRecord = numToRecord(startCount + 1);
        const record = await storageLocal.keyValueStore('first').getRecord(savedRecord.key);
        expect(record).toBeUndefined();
    });

    test('parses JSON', async () => {
        let savedRecord = numToRecord(1);
        let expectedRecord = stripRecord(savedRecord);
        expectedRecord.value = JSON.parse(expectedRecord.value as string);
        let record = await storageLocal.keyValueStore(storeName).getRecord(savedRecord.key);
        expect(record).toEqual(expectedRecord);

        savedRecord = numToRecord(10);
        expectedRecord = stripRecord(savedRecord);
        expectedRecord.value = JSON.parse(expectedRecord.value as string);
        record = await storageLocal.keyValueStore('second').getRecord(savedRecord.key);
        expect(record).toEqual(expectedRecord);
    });

    test('returns buffer when selected', async () => {
        const savedRecord = numToRecord(1);
        const expectedRecord = stripRecord(savedRecord);
        expectedRecord.value = Buffer.from(savedRecord.value);
        const record = await storageLocal.keyValueStore(storeName).getRecord(savedRecord.key, { buffer: true });
        expect(record).toEqual(expectedRecord);
    });

    test('returns buffer for non-text content-types', async () => {
        const savedRecord = numToRecord(7);
        const expectedRecord = stripRecord(savedRecord);
        expectedRecord.value = Buffer.from(savedRecord.value);
        const record = (await storageLocal.keyValueStore('second').getRecord(savedRecord.key))!;
        expect(record).toEqual(expectedRecord);
        expect(record.value).toBeInstanceOf(Buffer);
    });

    test('returns stream when selected', async () => {
        const savedRecord = numToRecord(1);
        const expectedRecord = stripRecord(savedRecord);

        const record = (await storageLocal.keyValueStore(storeName).getRecord(savedRecord.key, { stream: true }))!;
        expect(record.value).toBeInstanceOf(stream.Readable);
        const chunks = [];
        for await (const chunk of record.value) {
            chunks.push(chunk);
        }
        record.value = Buffer.concat(chunks).toString();
        expect(record).toEqual(expectedRecord);
    });

    describe('throws', () => {
        test('when store does not exist', async () => {
            const id = 'non-existent';
            try {
                await storageLocal.keyValueStore(id).getRecord('some-key');
                throw new Error('wrong-error');
            } catch (err: any) {
                expect(err.message).toBe(`Key-value store with id: ${id} does not exist.`);
            }
        });
    });
});

describe('deleteRecord', () => {
    const storeName = 'first';
    const startCount = TEST_STORES[1].recordCount;

    test('deletes record', async () => {
        const record = numToRecord(3);
        const recordPath = join(storeNameToDir(storeName), record.filename);
        await readFile(recordPath);
        await storageLocal.keyValueStore(storeName).deleteRecord(record.key);
        try {
            await readFile(recordPath);
            throw new Error('wrong error');
        } catch (err: any) {
            expect(err.code).toBe('ENOENT');
        }
    });

    test('returns undefined for non-existent records', async () => {
        const savedRecord = numToRecord(startCount + 1);
        const record = await storageLocal.keyValueStore('first').deleteRecord(savedRecord.key);
        expect(record).toBeUndefined();
    });

    describe('throws', () => {
        test('when store does not exist', async () => {
            const id = 'non-existent';
            try {
                await storageLocal.keyValueStore(id).deleteRecord('some-key');
                throw new Error('wrong-error');
            } catch (err: any) {
                expect(err.message).toBe(`Key-value store with id: ${id} does not exist.`);
            }
        });
    });
});

describe('listKeys', () => {
    const store = TEST_STORES[2];

    test('fetches keys in correct order', async () => {
        const records = createRecords(store);
        const expectedKeys = records
            .map((r) => ({ key: r.key, size: r.size }))
            .sort((a, b) => {
                if (a.key < b.key) return -1;
                if (a.key > b.key) return 1;
                return 0;
            });

        const { items } = await storageLocal.keyValueStore(store.name).listKeys();
        expect(items).toEqual(expectedKeys);
    });

    test('limit works', async () => {
        const limit = 10;
        const records = createRecords(store);
        const expectedItems = records
            .map((r) => ({ key: r.key, size: r.size }))
            .sort((a, b) => {
                if (a.key < b.key) return -1;
                if (a.key > b.key) return 1;
                return 0;
            })
            .slice(0, limit);

        const { items } = await storageLocal.keyValueStore(store.name).listKeys({ limit });
        expect(items).toEqual(expectedItems);
    });

    test('exclusive start key works', async () => {
        const records = createRecords(store);
        const expectedItems = records
            .map((r) => ({ key: r.key, size: r.size }))
            .sort((a, b) => {
                if (a.key < b.key) return -1;
                if (a.key > b.key) return 1;
                return 0;
            });
        const idx = 10;
        const exclusiveStartKey = expectedItems[idx].key;
        const exclusiveItems = expectedItems.slice(idx + 1);

        const { items } = await storageLocal.keyValueStore(store.name).listKeys({ exclusiveStartKey });
        expect(items).toEqual(exclusiveItems);
    });

    test('correctly sets isTruncated', async () => {
        const records = createRecords(store);
        let list = await storageLocal.keyValueStore(store.name).listKeys();
        expect(list.isTruncated).toBe(false);
        list = await storageLocal.keyValueStore(store.name).listKeys({ limit: records.length - 1 });
        expect(list.isTruncated).toBe(true);
    });

    describe('throws', () => {
        test('when store does not exist', async () => {
            const id = 'non-existent';
            try {
                await storageLocal.keyValueStore(id).listKeys();
                throw new Error('wrong-error');
            } catch (err: any) {
                expect(err.message).toBe(`Key-value store with id: ${id} does not exist.`);
            }
        });
    });
});

describe('timestamps:', () => {
    const storeName = 'first';
    const testInitTimestamp = Date.now();
    let client: KeyValueStoreClient;
    let spy: ReturnType<typeof jest.spyOn>;

    beforeEach(() => {
        jest.clearAllMocks();
        client = storageLocal.keyValueStore(storeName);
        // @ts-expect-error Spying on a private function
        spy = jest.spyOn(client, '_updateTimestamps');
    });

    test('createdAt has a valid date', async () => {
        await wait10ms();
        const { createdAt } = (await client.get())!;
        const createdAtTimestamp = createdAt.getTime();
        expect(createdAtTimestamp).toBeGreaterThan(testInitTimestamp);
        expect(createdAtTimestamp).toBeLessThan(Date.now());
    });

    test('get updated on record update', async () => {
        const record = numToRecord(1);
        await client.setRecord(stripRecord(record));
        expect(spy).toHaveBeenCalledWith({ mtime: true });
    });

    test('get updated on record insert', async () => {
        const record = numToRecord(100);
        await client.setRecord(stripRecord(record));
        expect(spy).toHaveBeenCalledWith({ mtime: true });
    });

    test('get updated on record delete', async () => {
        const record = numToRecord(1);
        await client.deleteRecord(record.key);
        expect(spy).toHaveBeenCalledWith({ mtime: true });
    });

    test('getRecord updates accessedAt', async () => {
        const { key } = numToRecord(1);
        await client.getRecord(key);
        expect(spy).toHaveBeenCalledWith();
    });

    test('listKeys updates accessedAt', async () => {
        await client.listKeys();
        expect(spy).toHaveBeenCalledWith();
    });
});

function wait10ms() {
    return new Promise((r) => setTimeout(r, 100));
}

function seed(keyValueStoresDir: string) {
    Object.values(TEST_STORES).forEach((store) => {
        const storeDir = insertStore(keyValueStoresDir, store);
        const records = createRecords(store);
        insertRecords(storeDir, records);
    });
}

function insertStore(dir: string, store: TestStore) {
    const storeDir = join(dir, store.name);
    ensureDirSync(storeDir);
    emptyDirSync(storeDir);
    return storeDir;
}

function insertRecords(dir: string, records: ReturnType<typeof numToRecord>[]) {
    records.forEach((record) => {
        const filePath = join(dir, record.filename);
        writeFileSync(filePath, record.value);
    });
}

function createRecords(store: TestStore) {
    const records: ReturnType<typeof numToRecord>[] = [];
    for (let i = 0; i < store.recordCount; i++) {
        const record = numToRecord(i);
        records.push(record);
    }
    return records;
}

function numToRecord(num: number) {
    if (num % 3 === 0) {
        const key = `markup_${num}`;
        const value = `<html><body>${num}: ✅</body></html>`;
        return {
            key,
            value,
            filename: `${key}.html`,
            contentType: 'text/html; charset=utf-8',
            size: Buffer.byteLength(value),
        };
    }
    if (num % 7 === 0) {
        const key = `buffer_${num}`;
        const chunks = Array(5000).fill(`${num}🚀🎯`);
        const value = Buffer.from(chunks);
        return {
            key,
            value,
            filename: `${key}.bin`,
            contentType: 'application/octet-stream',
            size: value.byteLength,
        };
    }
    const key = `object_${num}`;
    const filename = `${key}.json`;
    const value = JSON.stringify({ number: num, filename });
    return {
        key,
        value,
        filename,
        contentType: 'application/json; charset=utf-8',
        size: Buffer.byteLength(value),
    };
}

function stripRecord(record: ReturnType<typeof numToRecord>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Because we strip these variables from the record
    const { filename, size, ...strippedRecord } = record;
    return strippedRecord;
}

function createCounter(keyValueStoresDir: string) {
    return {
        stores() {
            return readdirSync(keyValueStoresDir).length;
        },
        records(name: string) {
            return readdirSync(join(keyValueStoresDir, name)).length;
        },
    };
}
