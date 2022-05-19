import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import { resolve } from 'path';
import { MemoryStorage } from '../index';
import { DatasetClient } from './dataset';

export interface DatasetCollectionClientOptions {
    baseStorageDirectory: string;
    client: MemoryStorage;
}

export class DatasetCollectionClient implements storage.DatasetCollectionClient {
    private readonly datasetsDirectory: string;
    private readonly client: MemoryStorage;

    constructor({ baseStorageDirectory, client }: DatasetCollectionClientOptions) {
        this.datasetsDirectory = resolve(baseStorageDirectory);
        this.client = client;
    }

    async list(): ReturnType<storage.DatasetCollectionClient['list']> {
        return {
            total: this.client.datasetClientsHandled.length,
            count: this.client.datasetClientsHandled.length,
            offset: 0,
            limit: this.client.datasetClientsHandled.length,
            desc: false,
            items: this.client.datasetClientsHandled.map(
                (store) => store.toDatasetInfo())
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        };
    }

    async getOrCreate(name?: string): Promise<storage.DatasetInfo> {
        s.string.optional.parse(name);

        if (name) {
            const found = this.client.datasetClientsHandled.find((store) => store.name === name);

            if (found) {
                return found.toDatasetInfo();
            }
        }

        const newStore = new DatasetClient({ name, baseStorageDirectory: this.datasetsDirectory, client: this.client });
        this.client.datasetClientsHandled.push(newStore);

        // Schedule the worker to write to the disk
        const datasetInfo = newStore.toDatasetInfo();
        // eslint-disable-next-line dot-notation
        this.client['sendMessageToWorker']({
            action: 'update-metadata',
            entityType: 'datasets',
            id: datasetInfo.name ?? datasetInfo.id,
            data: datasetInfo,
        });

        return datasetInfo;
    }
}
