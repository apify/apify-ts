import defaultLog from '@apify/log';
import type * as storage from '@crawlee/types';
import { Dictionary } from '@crawlee/utils';
import { s } from '@sapphire/shapeshift';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { DatasetClient } from './resource-clients/dataset';
import { DatasetCollectionClient } from './resource-clients/dataset-collection';
import { KeyValueStoreClient } from './resource-clients/key-value-store';
import { KeyValueStoreCollectionClient } from './resource-clients/key-value-store-collection';
import { RequestQueueClient } from './resource-clients/request-queue';
import { RequestQueueCollectionClient } from './resource-clients/request-queue-collection';
import { WorkerReceivedMessage } from './utils';
import { FileStorageWorkerEmulator } from './workers/file-storage-emulator';

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

    private fileStorageWorker!: Worker | FileStorageWorkerEmulator;
    private readonly log = defaultLog.child({ prefix: 'MemoryStorage' });

    constructor(options: MemoryStorageOptions = {}) {
        s.object({
            localDataDirectory: s.string.optional,
        }).parse(options);

        this.localDataDirectory = options.localDataDirectory ?? process.env.CRAWLEE_STORAGE_DIR ?? './memory_storage';
        this.datasetsDirectory = resolve(this.localDataDirectory, 'datasets');
        this.keyValueStoresDirectory = resolve(this.localDataDirectory, 'key_value_stores');
        this.requestQueuesDirectory = resolve(this.localDataDirectory, 'request_queues');

        this.createWorker();
    }

    datasets(): storage.DatasetCollectionClient {
        return new DatasetCollectionClient(this.datasetsDirectory, this);
    }

    dataset<Data extends Dictionary = Dictionary>(id: string): storage.DatasetClient<Data> {
        s.string.parse(id);

        return new DatasetClient({ id, baseStorageDirectory: this.datasetsDirectory, client: this });
    }

    keyValueStores(): storage.KeyValueStoreCollectionClient {
        return new KeyValueStoreCollectionClient(this.keyValueStoresDirectory, this);
    }

    keyValueStore(id: string): storage.KeyValueStoreClient {
        s.string.parse(id);

        return new KeyValueStoreClient({ id, baseStorageDirectory: this.keyValueStoresDirectory, client: this });
    }

    requestQueues(): storage.RequestQueueCollectionClient {
        return new RequestQueueCollectionClient(this.requestQueuesDirectory, this);
    }

    requestQueue(id: string, options: storage.RequestQueueOptions = {}): storage.RequestQueueClient {
        s.string.parse(id);
        s.object({
            clientKey: s.string.optional,
            timeoutSecs: s.number.optional,
        }).parse(options);

        return new RequestQueueClient({ id, baseStorageDirectory: this.requestQueuesDirectory, client: this, ...options });
    }

    private createWorker() {
        const directoryMap = {
            datasetsDirectory: this.datasetsDirectory,
            keyValueStoresDirectory: this.keyValueStoresDirectory,
            requestQueuesDirectory: this.requestQueuesDirectory,
        };

        const workerPath = resolve(__dirname, './workers/file-storage-worker.js');
        const exists = existsSync(workerPath);

        if (exists) {
            this.fileStorageWorker = new Worker(workerPath, {
                workerData: directoryMap,
            });

            this.fileStorageWorker.once('exit', (code) => {
                this.log.debug(`File storage worker exited with code ${code}`);
                this.createWorker();
            });
        } else {
            this.fileStorageWorker = new FileStorageWorkerEmulator(directoryMap);
        }
    }

    protected sendMessageToWorker(message: WorkerReceivedMessage) {
        this.fileStorageWorker.postMessage(message);
    }
}
