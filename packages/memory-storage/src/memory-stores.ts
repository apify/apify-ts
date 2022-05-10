import { DatasetClient } from './resource-clients/dataset';
import { KeyValueStoreClient } from './resource-clients/key-value-store';
import { RequestQueueClient } from './resource-clients/request-queue';

export const keyValueStores: KeyValueStoreClient[] = [];

export const datasetClients: DatasetClient[] = [];

export const requestQueues: RequestQueueClient[] = [];
