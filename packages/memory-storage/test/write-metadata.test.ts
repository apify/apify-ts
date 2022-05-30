import { MemoryStorage } from '@crawlee/memory-storage';
import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

describe('writeMetadata option', () => {
    const tmpLocation = resolve(__dirname, './tmp/write-metadata-tests');

    afterAll(async () => {
        await rm(tmpLocation, { force: true, recursive: true });
    });

    describe('when false', () => {
        const localDataDirectory = resolve(tmpLocation, './no-metadata');
        const storage = new MemoryStorage({
            localDataDirectory,
            writeMetadata: false,
        });

        test('creating a data store should not write __metadata__.json file', async () => {
            const keyValueStore = await storage.keyValueStores().getOrCreate();
            await setTimeout(10);

            const directoryFiles = await readdir(resolve(storage.keyValueStoresDirectory, `${keyValueStore.id}`));

            expect(directoryFiles).toHaveLength(0);
        });

        test('creating a key-value pair in a key-value store should not write __metadata__.json file for the value', async () => {
            const keyValueStoreInfo = await storage.keyValueStores().getOrCreate();

            const keyValueStore = storage.keyValueStore(keyValueStoreInfo.id);
            await keyValueStore.setRecord({ key: 'owo', value: 'test' });
            await setTimeout(10);

            const directoryFiles = await readdir(resolve(storage.keyValueStoresDirectory, `${keyValueStoreInfo.id}`));

            expect(directoryFiles).toHaveLength(1);
        });
    });

    describe('when true', () => {
        const localDataDirectory = resolve(tmpLocation, './metadata');
        const storage = new MemoryStorage({
            localDataDirectory,
            writeMetadata: true,
        });

        test('creating a data store should write __metadata__.json file', async () => {
            const keyValueStore = await storage.keyValueStores().getOrCreate();
            await setTimeout(10);

            const directoryFiles = await readdir(resolve(storage.keyValueStoresDirectory, `${keyValueStore.id}`));

            expect(directoryFiles).toHaveLength(1);
        });

        test('creating a key-value pair in a key-value store should write __metadata__.json file for the value', async () => {
            const keyValueStoreInfo = await storage.keyValueStores().getOrCreate();

            const keyValueStore = storage.keyValueStore(keyValueStoreInfo.id);
            await keyValueStore.setRecord({ key: 'owo', value: 'test' });
            await setTimeout(10);

            const directoryFiles = await readdir(resolve(storage.keyValueStoresDirectory, `${keyValueStoreInfo.id}`));

            expect(directoryFiles).toHaveLength(3);
        });
    });
});
