import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import { resolve } from 'node:path';
import { MemoryStorage } from '../index';
import { RequestQueueClient } from './request-queue';

export class RequestQueueCollectionClient implements storage.RequestQueueCollectionClient {
    private readonly requestQueuesDirectory: string;

    constructor(storageDirectory: string, private readonly client: MemoryStorage) {
        this.requestQueuesDirectory = resolve(storageDirectory);
    }

    async list(): ReturnType<storage.RequestQueueCollectionClient['list']> {
        return {
            total: this.client.requestQueuesHandled.length,
            count: this.client.requestQueuesHandled.length,
            offset: 0,
            limit: this.client.requestQueuesHandled.length,
            desc: false,
            items: this.client.requestQueuesHandled.map(
                (store) => store.toRequestQueueInfo())
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        };
    }

    async getOrCreate(name?: string): Promise<storage.RequestQueueInfo> {
        s.string.optional.parse(name);

        if (name) {
            const found = this.client.requestQueuesHandled.find((store) => store.name === name);

            if (found) {
                return found.toRequestQueueInfo();
            }
        }

        const newStore = new RequestQueueClient({ name, baseStorageDirectory: this.requestQueuesDirectory, client: this.client });
        this.client.requestQueuesHandled.push(newStore);

        // Schedule the worker to write to the disk
        const queueInfo = newStore.toRequestQueueInfo();
        // eslint-disable-next-line dot-notation
        this.client['sendMessageToWorker']({
            action: 'update-metadata',
            entityType: 'requestQueues',
            id: queueInfo.id,
            data: queueInfo,
        });

        return queueInfo;
    }
}
