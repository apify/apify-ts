import { storage } from '@crawlee/core';
import { s } from '@sapphire/shapeshift';
import { keyValueStores } from '../memory-stores';
import { KeyValueStoreClient } from './key-value-store';

export class KeyValueStoreCollectionClient implements storage.KeyValueStoreCollectionClient {
    async list(): ReturnType<storage.KeyValueStoreCollectionClient['list']> {
        return {
            total: keyValueStores.length,
            count: keyValueStores.length,
            offset: 0,
            limit: keyValueStores.length,
            desc: false,
            items: keyValueStores.map(
                (store) => store.toKeyValueStoreInfo())
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        };
    }

    async getOrCreate(name?: string): Promise<storage.KeyValueStoreInfo> {
        s.string.optional.parse(name);

        if (name) {
            const found = keyValueStores.find((store) => store.name === name);

            if (found) {
                return found.toKeyValueStoreInfo();
            }
        }

        const newStore = new KeyValueStoreClient({ name });
        keyValueStores.push(newStore);

        return newStore.toKeyValueStoreInfo();
    }
}
