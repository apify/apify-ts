import { ensureDir } from 'fs-extra';
import ow from 'ow';
import { join } from 'path';
import type { DatabaseConnectionCache } from '../database_connection_cache';
import { RawQueueTableData, RequestQueueEmulator } from '../emulators/request_queue_emulator';
import { purgeNullsFromObject } from '../utils';

export interface RequestQueueCollectionClientOptions {
    storageDir: string;
    dbConnections: DatabaseConnectionCache;
}

/**
 * Request queue collection client.
 */
export class RequestQueueCollectionClient {
    storageDir: string;

    dbConnections: DatabaseConnectionCache;

    constructor({ storageDir, dbConnections }: RequestQueueCollectionClientOptions) {
        this.storageDir = storageDir;
        this.dbConnections = dbConnections;
    }

    async list(): Promise<never> {
        throw new Error('This method is not implemented in @apify/storage-local yet.');
    }

    async getOrCreate(name: string): Promise<RawQueueTableData> {
        ow(name, ow.string.nonEmpty);
        const queueDir = join(this.storageDir, name);
        await ensureDir(queueDir);
        const emulator = new RequestQueueEmulator({
            queueDir,
            dbConnections: this.dbConnections,
        });
        const queue = emulator.selectOrInsertByName(name);
        queue.id = queue.name;
        return purgeNullsFromObject(queue);
    }
}
