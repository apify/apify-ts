import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import { resolve } from 'node:path';
import { MemoryStorage } from '../index';
import { KeyValueStoreClient } from './key-value-store';

export class KeyValueStoreCollectionClient implements storage.KeyValueStoreCollectionClient {
    private readonly keyValueStoresDirectory: string;

    constructor(storageDirectory: string, private readonly client: MemoryStorage) {
        this.keyValueStoresDirectory = resolve(storageDirectory);
    }

    async list(): ReturnType<storage.KeyValueStoreCollectionClient['list']> {
        return {
            total: this.client.keyValueStoresHandled.length,
            count: this.client.keyValueStoresHandled.length,
            offset: 0,
            limit: this.client.keyValueStoresHandled.length,
            desc: false,
            items: this.client.keyValueStoresHandled.map(
                (store) => store.toKeyValueStoreInfo())
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        };
    }

    async getOrCreate(name?: string): Promise<storage.KeyValueStoreInfo> {
        s.string.optional.parse(name);

        if (name) {
            const found = this.client.keyValueStoresHandled.find((store) => store.name === name);

            if (found) {
                return found.toKeyValueStoreInfo();
            }
        }

        const newStore = new KeyValueStoreClient({ name, baseStorageDirectory: this.keyValueStoresDirectory, client: this.client });
        this.client.keyValueStoresHandled.push(newStore);

        // Schedule the worker to write to the disk
        const kvStoreInfo = newStore.toKeyValueStoreInfo();
        // eslint-disable-next-line dot-notation
        this.client['sendMessageToWorker']({
            action: 'update-metadata',
            entityType: 'keyValueStores',
            id: kvStoreInfo.name ?? kvStoreInfo.id,
            data: kvStoreInfo,
        });

        return kvStoreInfo;
    }
}
