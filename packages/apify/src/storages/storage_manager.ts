import { ENV_VARS } from '@apify/consts';
import { ApifyClient } from 'apify-client';
import { ApifyStorageLocal } from '@apify/storage-local';
import { LruCache } from '@apify/datastructures';
import cacheContainer from '../cache_container';
import { Configuration } from '../configuration';
import { Constructor } from '../typedefs';

const MAX_OPENED_STORAGES = 1000;

const DEFAULT_ID_ENV_VAR_NAMES = {
    Dataset: ENV_VARS.DEFAULT_DATASET_ID,
    KeyValueStore: ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID,
    RequestQueue: ENV_VARS.DEFAULT_REQUEST_QUEUE_ID,
};

const DEFAULT_ID_CONFIG_KEYS = {
    Dataset: 'defaultDatasetId',
    KeyValueStore: 'defaultKeyValueStoreId',
    RequestQueue: 'defaultRequestQueueId',
};

/**
 * StorageManager takes care of opening remote or local storages.
 * @ignore
 */
export class StorageManager<T> {
    private readonly name: string;
    private readonly StorageConstructor: Constructor<T> & { name: string };
    private readonly cache: LruCache;

    constructor(
        StorageConstructor: Constructor<T>,
        private readonly config = Configuration.getGlobalConfig(),
    ) {
        this.StorageConstructor = StorageConstructor as unknown as Constructor<T>;
        this.name = this.StorageConstructor.name;
        this.cache = cacheContainer.openCache(this.name, MAX_OPENED_STORAGES);
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

    /**
     * @internal
     */
    protected _createCacheKey(idOrName: string, isLocal: boolean): string {
        return isLocal
            ? `LOCAL:${idOrName}`
            : `REMOTE:${idOrName}`;
    }

    /**
     * Helper function that first requests storage by ID and if storage doesn't exist then gets it by name.
     * @internal
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

    /**
     * @internal
     */
    protected _getStorageClientFactories(client: ApifyClient | ApifyStorageLocal, storageConstructorName: string) {
        // Dataset => dataset
        const clientName = storageConstructorName[0].toLowerCase() + storageConstructorName.slice(1);
        // dataset => datasets
        const collectionClientName = `${clientName}s`;

        return {
            createStorageClient: client[clientName].bind(client),
            createStorageCollectionClient: client[collectionClientName].bind(client),
        };
    }

    /**
     * @internal
     */
    protected _addStorageToCache(storage: { id: string; name?: string; isLocal?: boolean }): void {
        const idKey = this._createCacheKey(storage.id, storage.isLocal);
        this.cache.add(idKey, storage);

        if (storage.name) {
            const nameKey = this._createCacheKey(storage.name, storage.isLocal);
            this.cache.add(nameKey, storage);
        }
    }
}
