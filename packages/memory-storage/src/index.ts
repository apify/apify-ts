import type { storage } from '@crawlee/core';
import { Dictionary } from '@crawlee/utils';
import { s } from '@sapphire/shapeshift';
import { DatasetClient } from './resource-clients/dataset';
import { DatasetCollectionClient } from './resource-clients/dataset-collection';
import { KeyValueStoreClient } from './resource-clients/key-value-store';
import { KeyValueStoreCollectionClient } from './resource-clients/key-value-store-collection';

export class MemoryStorage implements storage.StorageClient {
    datasets(): storage.DatasetCollectionClient {
        return new DatasetCollectionClient();
    }

    dataset<Data extends Dictionary = Dictionary>(id: string): storage.DatasetClient<Data> {
        s.string.parse(id);

        return new DatasetClient({ id });
    }

    keyValueStores(): storage.KeyValueStoreCollectionClient {
        return new KeyValueStoreCollectionClient();
    }

    keyValueStore(id: string): storage.KeyValueStoreClient {
        s.string.parse(id);

        return new KeyValueStoreClient({ id });
    }

    requestQueues(): storage.RequestQueueCollectionClient {
        throw new Error('Method not implemented.');
    }

    requestQueue(id: string, options?: storage.RequestQueueOptions): storage.RequestQueueClient {
        throw new Error('Method not implemented.');
    }
}
