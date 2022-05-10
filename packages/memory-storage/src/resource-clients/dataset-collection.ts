import type * as storage from '@crawlee/types';
import { s } from '@sapphire/shapeshift';
import { datasetClients } from '../memory-stores';
import { DatasetClient } from './dataset';

export class DatasetCollectionClient implements storage.DatasetCollectionClient {
    async list(): ReturnType<storage.DatasetCollectionClient['list']> {
        return {
            total: datasetClients.length,
            count: datasetClients.length,
            offset: 0,
            limit: datasetClients.length,
            desc: false,
            items: datasetClients.map(
                (store) => store.toDatasetInfo())
                .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
        };
    }

    async getOrCreate(name?: string): Promise<storage.DatasetInfo> {
        s.string.optional.parse(name);

        if (name) {
            const found = datasetClients.find((store) => store.name === name);

            if (found) {
                return found.toDatasetInfo();
            }
        }

        const newStore = new DatasetClient({ name });
        datasetClients.push(newStore);

        return newStore.toDatasetInfo();
    }
}
