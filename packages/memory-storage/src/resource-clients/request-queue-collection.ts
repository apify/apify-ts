import { storage } from '@crawlee/core';
import { s } from '@sapphire/shapeshift';
import { requestQueues } from '../memory-stores';
import { RequestQueueClient } from './request-queue';

export class RequestQueueCollectionClient implements storage.RequestQueueCollectionClient {
    async list(): ReturnType<storage.RequestQueueCollectionClient['list']> {
        return {
            total: requestQueues.length,
            count: requestQueues.length,
            offset: 0,
            limit: requestQueues.length,
            desc: false,
            items: requestQueues.map(
                (store) => store.toRequestQueueInfo())
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        };
    }

    async getOrCreate(name?: string): Promise<storage.RequestQueueInfo> {
        s.string.optional.parse(name);

        if (name) {
            const found = requestQueues.find((store) => store.name === name);

            if (found) {
                return found.toRequestQueueInfo();
            }
        }

        const newStore = new RequestQueueClient({ name });
        requestQueues.push(newStore);

        return newStore.toRequestQueueInfo();
    }
}
