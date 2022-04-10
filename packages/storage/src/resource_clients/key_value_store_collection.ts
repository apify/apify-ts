import { ensureDir, stat } from 'fs-extra';
import ow from 'ow';
import { join } from 'path';

export interface KeyValueStoreCollectionClientOptions {
    storageDir: string;
}

export interface KeyValueStoreCollectionData {
    id: string;
    name: string;
    createdAt: Date;
    modifiedAt: Date;
    accessedAt: Date;
}

/**
 * Key-value store collection client.
 */
export class KeyValueStoreCollectionClient {
    storageDir: string;

    constructor({ storageDir }: KeyValueStoreCollectionClientOptions) {
        this.storageDir = storageDir;
    }

    async list(): Promise<never> {
        throw new Error('This method is not implemented in @crawlee/storage yet.');
    }

    async getOrCreate(name: string): Promise<KeyValueStoreCollectionData> {
        ow(name, ow.string.nonEmpty);
        const storePath = join(this.storageDir, name);
        await ensureDir(storePath);
        const stats = await stat(storePath);
        return {
            id: name,
            name,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime,
            accessedAt: stats.atime,
        };
    }
}
