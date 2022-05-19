import type * as storage from '@crawlee/types';
import { Dictionary } from '@crawlee/utils';
import { s } from '@sapphire/shapeshift';
import { resolve } from 'node:path';
import { DatasetClient } from './resource-clients/dataset';
import { DatasetCollectionClient } from './resource-clients/dataset-collection';
import { KeyValueStoreClient } from './resource-clients/key-value-store';
import { KeyValueStoreCollectionClient } from './resource-clients/key-value-store-collection';
import { RequestQueueClient } from './resource-clients/request-queue';
import { RequestQueueCollectionClient } from './resource-clients/request-queue-collection';
import { initWorkerIfNeeded } from './workers/instance';

export interface MemoryStorageOptions {
    /**
     * Path to directory where the data will also be saved.
     * @default process.env.CRAWLEE_STORAGE_DIR ?? './memory_storage'
     */
    localDataDirectory?: string;
}

export class MemoryStorage implements storage.StorageClient {
    readonly localDataDirectory: string;
    readonly datasetsDirectory: string;
    readonly keyValueStoresDirectory: string;
    readonly requestQueuesDirectory: string;

    readonly keyValueStoresHandled: KeyValueStoreClient[] = [];
    readonly datasetClientsHandled: DatasetClient[] = [];
    readonly requestQueuesHandled: RequestQueueClient[] = [];

    constructor(options: MemoryStorageOptions = {}) {
        s.object({
            localDataDirectory: s.string.optional,
        }).parse(options);

        this.localDataDirectory = options.localDataDirectory ?? process.env.CRAWLEE_STORAGE_DIR ?? './memory_storage';
        this.datasetsDirectory = resolve(this.localDataDirectory, 'datasets');
        this.keyValueStoresDirectory = resolve(this.localDataDirectory, 'key_value_stores');
        this.requestQueuesDirectory = resolve(this.localDataDirectory, 'request_queues');

        initWorkerIfNeeded();
    }

    datasets(): storage.DatasetCollectionClient {
        return new DatasetCollectionClient({
            baseStorageDirectory: this.datasetsDirectory,
            client: this,
        });
    }

    dataset<Data extends Dictionary = Dictionary>(id: string): storage.DatasetClient<Data> {
        s.string.parse(id);

        return new DatasetClient({ id, baseStorageDirectory: this.datasetsDirectory, client: this });
    }

    keyValueStores(): storage.KeyValueStoreCollectionClient {
        return new KeyValueStoreCollectionClient({
            baseStorageDirectory: this.keyValueStoresDirectory,
            client: this,
        });
    }

    keyValueStore(id: string): storage.KeyValueStoreClient {
        s.string.parse(id);

        return new KeyValueStoreClient({ id, baseStorageDirectory: this.keyValueStoresDirectory, client: this });
    }

    requestQueues(): storage.RequestQueueCollectionClient {
        return new RequestQueueCollectionClient({
            baseStorageDirectory: this.requestQueuesDirectory,
            client: this,
        });
    }

    requestQueue(id: string, options: storage.RequestQueueOptions = {}): storage.RequestQueueClient {
        s.string.parse(id);
        s.object({
            clientKey: s.string.optional,
            timeoutSecs: s.number.optional,
        }).parse(options);

        return new RequestQueueClient({ id, baseStorageDirectory: this.requestQueuesDirectory, client: this, ...options });
    }
}
