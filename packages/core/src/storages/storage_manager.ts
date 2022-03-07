import { ENV_VARS } from '@apify/consts';
import { LruCache } from '@apify/datastructures';
import { ApifyStorageLocal } from '@crawlers/storage';
import { ApifyClient } from 'apify-client';
import { Configuration } from '../configuration';
import { Constructor } from '../typedefs';

const MAX_OPENED_STORAGES = 1000;

const DEFAULT_ID_ENV_VAR_NAMES = {
    Dataset: ENV_VARS.DEFAULT_DATASET_ID,
    KeyValueStore: ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID,
    RequestQueue: ENV_VARS.DEFAULT_REQUEST_QUEUE_ID,
} as const;

const DEFAULT_ID_CONFIG_KEYS = {
    Dataset: 'defaultDatasetId',
    KeyValueStore: 'defaultKeyValueStoreId',
    RequestQueue: 'defaultRequestQueueId',
} as const;

export interface IStorage {
    id: string;
    name?: string;
    isLocal?: boolean;
}

/**
 * StorageManager takes care of opening remote or local storages.
 * @ignore
 */
export class StorageManager<T extends IStorage = IStorage> {
    private readonly name: 'Dataset' | 'KeyValueStore' | 'RequestQueue';
    private readonly StorageConstructor: Constructor<T> & { name: string };
    private readonly cache: LruCache<T>;

    constructor(
        StorageConstructor: Constructor<T>,
        private readonly config = Configuration.getGlobalConfig(),
    ) {
        this.StorageConstructor = StorageConstructor;
        this.name = this.StorageConstructor.name as 'Dataset' | 'KeyValueStore' | 'RequestQueue';
        this.cache = new LruCache({ maxLength: MAX_OPENED_STORAGES });
    }

    async openStorage(idOrName?: string, options: { forceCloud?: boolean } = {}): Promise<T> {
        const isLocal = !!(this.config.get('localStorageDir') && !options.forceCloud);

        if (!idOrName) {
            const defaultIdEnvVarName = DEFAULT_ID_ENV_VAR_NAMES[this.name];
            const defaultIdConfigKey = DEFAULT_ID_CONFIG_KEYS[this.name];
            idOrName = this.config.get(defaultIdConfigKey) as string;
            if (!idOrName) throw new Error(`The '${defaultIdEnvVarName}' environment variable is not defined.`);
        }

        const cacheKey = this._createCacheKey(idOrName, isLocal);
        let storage = this.cache.get(cacheKey);

        if (!storage) {
            const client = isLocal ? this.config.getStorageLocal() : this.config.getClient();
            const storageObject = await this._getOrCreateStorage(idOrName, this.name, client);
            storage = new this.StorageConstructor({
                id: storageObject.id,
                name: storageObject.name,
                client,
                isLocal,
            });
            this._addStorageToCache(storage);
        }

        return storage;
    }

    closeStorage(storage: { id: string; name?: string; isLocal?: boolean }): void {
        const idKey = this._createCacheKey(storage.id, storage.isLocal);
        this.cache.remove(idKey);

        if (storage.name) {
            const nameKey = this._createCacheKey(storage.name, storage.isLocal);
            this.cache.remove(nameKey);
        }
    }

    protected _createCacheKey(idOrName: string, isLocal?: boolean): string {
        return isLocal
            ? `LOCAL:${idOrName}`
            : `REMOTE:${idOrName}`;
    }

    /**
     * Helper function that first requests storage by ID and if storage doesn't exist then gets it by name.
     */
    protected async _getOrCreateStorage(storageIdOrName: string, storageConstructorName: string, apiClient: ApifyClient | ApifyStorageLocal) {
        const {
            createStorageClient,
            createStorageCollectionClient,
        } = this._getStorageClientFactories(apiClient, storageConstructorName);

        const storageClient = createStorageClient(storageIdOrName);
        const existingStorage = await storageClient.get();
        if (existingStorage) return existingStorage;

        const storageCollectionClient = createStorageCollectionClient();
        return storageCollectionClient.getOrCreate(storageIdOrName);
    }

    protected _getStorageClientFactories(client: ApifyClient | ApifyStorageLocal, storageConstructorName: string) {
        // Dataset => dataset
        const clientName = storageConstructorName[0].toLowerCase() + storageConstructorName.slice(1) as ClientNames;
        // dataset => datasets
        const collectionClientName = `${clientName}s` as ClientCollectionNames;

        return {
            createStorageClient: client[clientName!].bind(client),
            createStorageCollectionClient: client[collectionClientName!].bind(client),
        };
    }

    protected _addStorageToCache(storage: T): void {
        const idKey = this._createCacheKey(storage.id, storage.isLocal);
        this.cache.add(idKey, storage);

        if (storage.name) {
            const nameKey = this._createCacheKey(storage.name, storage.isLocal);
            this.cache.add(nameKey, storage);
        }
    }
}

type ClientNames = 'dataset' | 'keyValueStore' | 'requestQueue';
type ClientCollectionNames = 'datasets' | 'keyValueStores' | 'requestQueues';

export interface StorageManagerOptions {
    /**
     * If set to `true` then the cloud storage is used even if the `APIFY_LOCAL_STORAGE_DIR`
     * environment variable is set. This way it is possible to combine local and cloud storage.
     * @default false
     */
    forceCloud?: boolean;

    /**
     * SDK configuration instance, defaults to the static register.
     */
    config?: Configuration;
}
