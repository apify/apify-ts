import { emptyDirSync, ensureDirSync, readdirSync, readFile, writeJsonSync } from 'fs-extra';
import { join } from 'path';
import { setTimeout } from 'node:timers/promises';
import { ApifyStorageLocal } from '@apify/storage-local';
import { STORAGE_NAMES } from '@apify/storage-local/dist/consts';
import { prepareTestDir, removeTestDir } from './_tools';

const TEST_DATASETS = {
    1: {
        name: 'first',
        itemCount: 5,
    },
    2: {
        name: 'second',
        itemCount: 35,
    },
};

interface TestDataset {
    name: string;
    itemCount: number;
}

let STORAGE_DIR: string;
let storageLocal: ApifyStorageLocal;
let datasetNameToDir: (datasetName: string) => string;
let counter: ReturnType<typeof createCounter>;
beforeEach(() => {
    STORAGE_DIR = prepareTestDir();
    storageLocal = new ApifyStorageLocal({
        storageDir: STORAGE_DIR,
    });
    const datasetsDir = join(STORAGE_DIR, STORAGE_NAMES.DATASETS);
    datasetNameToDir = (datasetName: string) => {
        return join(datasetsDir, datasetName);
    };
    counter = createCounter(datasetsDir);
    seed(datasetsDir);
});

afterAll(() => {
    removeTestDir(STORAGE_NAMES.DATASETS);
});

test('datasets directory exists', () => {
    const subDirs = readdirSync(STORAGE_DIR);
    expect(subDirs).toContain(STORAGE_NAMES.DATASETS);
});

describe('timestamps:', () => {
    const datasetName = 'first';
    const testInitTimestamp = Date.now();

    test('createdAt has a valid date', async () => {
        await setTimeout(30);
        const { createdAt } = (await storageLocal.dataset(datasetName).get())!;
        const createdAtTimestamp = createdAt.getTime();
        expect(createdAtTimestamp).toBeGreaterThan(testInitTimestamp);
        expect(createdAtTimestamp).toBeLessThan(Date.now());
    });

    test('get updated on item insert', async () => {
        const beforeUpdate = (await storageLocal.dataset(datasetName).get())!;
        await storageLocal.dataset(datasetName).pushItems({ foo: 'bar' });
        await setTimeout(30);
        const afterUpdate = (await storageLocal.dataset(datasetName).get())!;
        expect(afterUpdate.modifiedAt.getTime()).toBeGreaterThan(beforeUpdate.modifiedAt.getTime());
        expect(afterUpdate.accessedAt.getTime()).toBeGreaterThan(beforeUpdate.accessedAt.getTime());
    });

    test('listItems updates accessedAt', async () => {
        const beforeGet = (await storageLocal.dataset(datasetName).get())!;
        await storageLocal.dataset(datasetName).listItems();
        await setTimeout(30);
        const afterGet = (await storageLocal.dataset(datasetName).get())!;
        expect(beforeGet.modifiedAt.getTime()).toBe(afterGet.modifiedAt.getTime());
        // this assert is too flaky
        // expect(afterGet.accessedAt.getTime()).toBeGreaterThan(beforeGet.accessedAt.getTime());
    });
});

describe('get dataset', () => {
    test('returns correct dataset', async () => {
        let dataset = (await storageLocal.dataset('first').get())!;
        expect(dataset.id).toBe('first');
        expect(dataset.name).toBe('first');
        dataset = (await storageLocal.dataset('second').get())!;
        expect(dataset.id).toBe('second');
        expect(dataset.name).toBe('second');
    });

    test('returns undefined for non-existent datasets', async () => {
        const dataset = await storageLocal.dataset('3').get();
        expect(dataset).toBeUndefined();
    });
});

describe('getOrCreate', () => {
    test('returns existing dataset by name', async () => {
        const dataset = await storageLocal.datasets().getOrCreate('first');
        expect(dataset.id).toBe('first');
        const count = counter.datasets();
        expect(count).toBe(2);
    });

    test('creates a new dataset with name', async () => {
        const datasetName = 'third';
        const dataset = await storageLocal.datasets().getOrCreate(datasetName);
        expect(dataset.id).toBe('third');
        expect(dataset.name).toBe(datasetName);
        const count = counter.datasets();
        expect(count).toBe(3);
    });
});

describe('delete dataset', () => {
    test('deletes correct dataset', async () => {
        await storageLocal.dataset('first').delete();
        const count = counter.datasets();
        expect(count).toBe(1);
    });

    test('returns undefined for non-existent dataset', async () => {
        const result = await storageLocal.dataset('non-existent').delete();
        expect(result).toBeUndefined();
    });
});

describe('pushItems', () => {
    const datasetName = 'first';
    const startCount = TEST_DATASETS[1].itemCount;

    test('adds an object', async () => { /* eslint-disable no-shadow */
        const item = numToItem(startCount + 1);

        await storageLocal.dataset(datasetName).pushItems(item);
        expect(counter.items(datasetName)).toBe(startCount + 1);

        const itemPath = join(datasetNameToDir(datasetName), item.filename);
        const savedJson = await readFile(itemPath, 'utf8');
        const savedItem = JSON.parse(savedJson);
        expect(savedItem).toEqual(item);
    });

    test('adds multiple objects', async () => {
        const items = [];
        for (let i = 1; i <= 20; i++) {
            const item = numToItem(startCount + i);
            items.push(item);
        }

        await storageLocal.dataset(datasetName).pushItems(items);
        expect(counter.items(datasetName)).toBe(startCount + 20);

        for (const item of items) {
            const itemPath = join(datasetNameToDir(datasetName), item.filename);
            const savedJson = await readFile(itemPath, 'utf8');
            const savedItem = JSON.parse(savedJson);
            expect(savedItem).toEqual(item);
        }
    });

    test('adds a json', async () => {
        const item = numToItem(startCount + 1);

        await storageLocal.dataset(datasetName).pushItems(JSON.stringify(item));
        expect(counter.items(datasetName)).toBe(startCount + 1);

        const itemPath = join(datasetNameToDir(datasetName), item.filename);
        const savedJson = await readFile(itemPath, 'utf8');
        const savedItem = JSON.parse(savedJson);
        expect(savedItem).toEqual(item);
    });

    test('adds multiple jsons', async () => {
        const itemJsons = [];
        for (let i = 1; i <= 20; i++) {
            const item = numToItem(startCount + i);
            itemJsons.push(JSON.stringify(item));
        }

        await storageLocal.dataset(datasetName).pushItems(itemJsons);
        expect(counter.items(datasetName)).toBe(startCount + 20);

        for (const itemJson of itemJsons) {
            const item = JSON.parse(itemJson);
            const itemPath = join(datasetNameToDir(datasetName), item.filename);
            const savedJson = await readFile(itemPath, 'utf8');
            const savedItem = JSON.parse(savedJson);
            expect(savedItem).toEqual(item);
        }
    });

    test('adds JSON array as individual items', async () => {
        const items = [];
        for (let i = 1; i <= 20; i++) {
            const item = numToItem(startCount + i);
            items.push(item);
        }

        const jsonItems = JSON.stringify(items);

        await storageLocal.dataset(datasetName).pushItems(jsonItems);
        expect(counter.items(datasetName)).toBe(startCount + 20);

        for (const item of items) {
            const itemPath = join(datasetNameToDir(datasetName), item.filename);
            const savedJson = await readFile(itemPath, 'utf8');
            const savedItem = JSON.parse(savedJson);
            expect(savedItem).toEqual(item);
        }
    });

    describe('throws', () => {
        test('when dataset does not exist', async () => {
            const id = 'non-existent';
            try {
                await storageLocal.dataset(id).pushItems({ key: 'some-key', value: 'some-value' });
                throw new Error('wrong-error');
            } catch (err: any) {
                expect(err.message).toBe(`Dataset with id: ${id} does not exist.`);
            }
        });

        test('when individual items are arrays', async () => {
            const arrayOfArrays = [
                { foo: 'bar' },
                [{ one: 1 }, { two: 2 }],
            ];

            expect.hasAssertions();
            try {
                // @ts-expect-error Making sure datasets only allow a single JSON object
                await storageLocal.dataset(datasetName).pushItems(arrayOfArrays);
            } catch (err: any) {
                expect(err.message).toMatch('Each dataset item can only be a single JSON object, not an array. Received:');
            }
        });
    });
});

describe('listItems', () => {
    const dataset = TEST_DATASETS[2];

    test('fetches items in correct order', async () => {
        const expectedItems = createItems(dataset);
        const { items } = await storageLocal.dataset(dataset.name).listItems();
        expect(items).toEqual(expectedItems);
    });

    test('limit works', async () => {
        const limit = 10;
        const expectedItems = createItems(dataset).slice(0, limit);
        const { items } = await storageLocal.dataset(dataset.name).listItems({ limit });
        expect(items).toEqual(expectedItems);
    });

    test('offset works', async () => {
        const offset = 10;
        const expectedItems = createItems(dataset).slice(offset);
        const { items } = await storageLocal.dataset(dataset.name).listItems({ offset });
        expect(items).toEqual(expectedItems);
    });

    describe('throws', () => {
        test('when dataset does not exist', async () => {
            const id = 'non-existent';
            try {
                await storageLocal.dataset(id).listItems();
                throw new Error('wrong-error');
            } catch (err: any) {
                expect(err.message).toBe(`Dataset with id: ${id} does not exist.`);
            }
        });
    });
});

function seed(datasetsDir: string) {
    Object.values(TEST_DATASETS).forEach((dataset) => {
        const datasetDir = insertDataset(datasetsDir, dataset);
        const records = createItems(dataset);
        insertItems(datasetDir, records);
    });
}

function insertDataset(dir: string, dataset: TestDataset) {
    const datasetDir = join(dir, dataset.name);
    ensureDirSync(datasetDir);
    emptyDirSync(datasetDir);
    return datasetDir;
}

function insertItems(dir: string, items: DatasetRecord[]) {
    items.forEach((item) => {
        const filePath = join(dir, item.filename);
        writeJsonSync(filePath, item);
    });
}

function createItems(dataset: TestDataset) {
    const records = [];
    for (let i = 1; i <= dataset.itemCount; i++) {
        const record = numToItem(i);
        records.push(record);
    }
    return records;
}

interface DatasetRecord {
    key: string;
    value: string;
    filename: string;
    contentType: string;
    size: number;
    [K: string]: unknown;
}

function numToItem(num: number): DatasetRecord {
    const key = `object_${num}`;
    const paddedNum = `${num}`.padStart(9, '0');
    const filename = `${paddedNum}.json`;
    const value = JSON.stringify({ number: num, filename });
    return {
        key,
        value,
        filename,
        contentType: 'application/json; charset=utf-8',
        size: Buffer.byteLength(value),
    };
}

function createCounter(datasetsDir: string) {
    return {
        datasets() {
            return readdirSync(datasetsDir).length;
        },
        items(name: string) {
            return readdirSync(join(datasetsDir, name)).length;
        },
    };
}
