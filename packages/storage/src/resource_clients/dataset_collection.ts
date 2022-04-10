import { ensureDir, stat } from 'fs-extra';
import ow from 'ow';
import { join } from 'path';

export interface DatasetCollectionClientOptions {
    storageDir: string;
}

export interface DatasetCollectionData {
    id: string;
    name: string;
    createdAt: Date;
    modifiedAt: Date;
    accessedAt: Date;
}

/**
 * Dataset collection client.
 */
export class DatasetCollectionClient {
    storageDir: string;

    constructor({ storageDir }: DatasetCollectionClientOptions) {
        this.storageDir = storageDir;
    }

    async list(): Promise<never> {
        throw new Error('This method is not implemented in @crawlee/storage yet.');
    }

    async getOrCreate(name: string): Promise<DatasetCollectionData> {
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
