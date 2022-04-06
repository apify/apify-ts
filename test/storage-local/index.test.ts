import log from '@apify/log';
import { join } from 'path';
import { ensureDirSync, statSync, writeFileSync } from 'fs-extra';
import { ApifyStorageLocal } from '@apify/storage-local';
import { STORAGE_NAMES } from '@apify/storage-local/dist/consts';
import { prepareTestDir, removeTestDir } from './_tools';

let STORAGE_DIR: string;
beforeEach(() => {
    STORAGE_DIR = prepareTestDir();
});

afterAll(() => {
    removeTestDir(STORAGE_DIR);
});

test('does not create folders immediately', () => {
    // eslint-disable-next-line no-new -- Testing to make sure creating an instance won't immediately create folders
    new ApifyStorageLocal({
        storageDir: STORAGE_DIR,
    });
    const requestQueueDir = join(STORAGE_DIR, STORAGE_NAMES.REQUEST_QUEUES);
    const keyValueStoreDir = join(STORAGE_DIR, STORAGE_NAMES.KEY_VALUE_STORES);
    const datasetDir = join(STORAGE_DIR, STORAGE_NAMES.DATASETS);
    for (const dir of [requestQueueDir, keyValueStoreDir, datasetDir]) {
        expect(() => statSync(dir)).toThrow('ENOENT');
    }
});

test('creates folders lazily', () => {
    const storageLocal = new ApifyStorageLocal({
        storageDir: STORAGE_DIR,
    });
    const requestQueueDir = join(STORAGE_DIR, STORAGE_NAMES.REQUEST_QUEUES);
    storageLocal.requestQueues();
    const keyValueStoreDir = join(STORAGE_DIR, STORAGE_NAMES.KEY_VALUE_STORES);
    storageLocal.keyValueStores();
    const datasetDir = join(STORAGE_DIR, STORAGE_NAMES.DATASETS);
    storageLocal.datasets();
    for (const dir of [requestQueueDir, keyValueStoreDir, datasetDir]) {
        expect(statSync(dir).isDirectory()).toBe(true);
    }
});

test('warning is shown when storage is non-empty', () => {
    const storageLocal = new ApifyStorageLocal({
        storageDir: STORAGE_DIR,
    });

    const requestQueueDir = join(STORAGE_DIR, STORAGE_NAMES.REQUEST_QUEUES);
    const keyValueStoreDir = join(STORAGE_DIR, STORAGE_NAMES.KEY_VALUE_STORES);
    const datasetDir = join(STORAGE_DIR, STORAGE_NAMES.DATASETS);

    const fileData = JSON.stringify({ foo: 'bar' });
    const innerDirName = 'default';

    const innerRequestQueueDir = join(requestQueueDir, innerDirName);
    ensureDirSync(innerRequestQueueDir);
    writeFileSync(join(innerRequestQueueDir, '000000001.json'), fileData);

    const innerKeyValueStoreDir = join(keyValueStoreDir, innerDirName);
    ensureDirSync(innerKeyValueStoreDir);
    writeFileSync(join(innerKeyValueStoreDir, 'INPUT.json'), fileData);

    const innerDatasetDir = join(datasetDir, innerDirName);
    ensureDirSync(innerDatasetDir);
    writeFileSync(join(innerDatasetDir, '000000001.json'), fileData);

    const warnings = jest.spyOn(log, 'warning');

    storageLocal.keyValueStores();
    storageLocal.requestQueues();
    storageLocal.datasets();

    // warning is expected to be shown 2 times only (for Dataset and Request queue)
    // as it should not be shown when INPUT.json in the only file in Key-value store
    expect(warnings).toHaveBeenCalledTimes(2);
});
