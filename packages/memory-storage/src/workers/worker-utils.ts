import defaultLog from '@apify/log';
import { ensureDir } from 'fs-extra';
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WorkerReceivedMessage, WorkerUpdateEntriesMessage, WorkerUpdateMetadataMessage } from '../utils';

const workerLog = defaultLog.child({ prefix: 'MemoryStorageWorker' });

export interface WorkerDirectoryMap {
    datasetsDirectory: string;
    keyValueStoresDirectory: string;
    requestQueuesDirectory: string;
}

export type EntityTypeToDirectoryMap = Map<'datasets' | 'keyValueStores' | 'requestQueues', string>;

export async function handleMessage(
    {
        datasetsDirectory,
        keyValueStoresDirectory,
        requestQueuesDirectory,
    }: WorkerDirectoryMap,
    message: WorkerReceivedMessage,
) {
    const entityTypeToDirectory = new Map([
        ['datasets', datasetsDirectory],
        ['keyValueStores', keyValueStoresDirectory],
        ['requestQueues', requestQueuesDirectory],
    ] as const);

    switch (message.action) {
        case 'update-metadata':
            await updateMetadata(entityTypeToDirectory, message);
            break;
        case 'update-entries':
            await updateItems(entityTypeToDirectory, message);
            break;
        default:
            // @ts-expect-error We're keeping this to make eslint happy + in the event we add a new action without adding checks for it
            // we should be aware of them
            workerLog.warning(`Unknown worker message action ${message.action}`);
    }
}

async function updateMetadata(entityTypeToDirectory: EntityTypeToDirectoryMap, message: WorkerUpdateMetadataMessage) {
    workerLog.info(`Updating metadata for ${message.entityType} with id ${message.id}`);

    // Ensure the directory for the entity exists
    const dir = entityTypeToDirectory.get(message.entityType)!;
    await ensureDir(resolve(dir, message.id));

    // Write the metadata to the file
    const filePath = resolve(dir, message.id, '__metadata__.json');
    await writeFile(filePath, JSON.stringify(message.data, null, '\t'));
}

async function updateItems(entityTypeToDirectory: EntityTypeToDirectoryMap, message: WorkerUpdateEntriesMessage) {
    workerLog.info(`Updating items for ${message.entityType} with id ${message.id}`);

    // Ensure the directory for the entity exists
    const dir = entityTypeToDirectory.get(message.entityType)!;
    await ensureDir(resolve(dir, message.id));

    switch (message.entityType) {
        case 'datasets':
        case 'requestQueues': {
            // Write the metadata to the file
            const filePath = resolve(dir, message.id, 'entries.json');
            await writeFile(filePath, JSON.stringify(message.data, null, '\t'));
            break;
        }
        case 'keyValueStores': {
            const itemsDirectory = resolve(dir, message.id, 'entries');

            const { action, record } = message.data;

            const itemDirectory = resolve(itemsDirectory, record.key);

            switch (action) {
                case 'delete':
                    await rm(itemDirectory, { recursive: true });
                    break;
                case 'set': {
                    await rm(itemDirectory, { recursive: true });
                    await ensureDir(itemDirectory);

                    const metadataPath = resolve(itemDirectory, '__metadata__.json');
                    const dataBlobPath = resolve(itemDirectory, `${record.key}.${record.extension}`);

                    await writeFile(
                        metadataPath,
                        JSON.stringify(
                            {
                                key: record.key,
                                contentType: record.contentType ?? 'unknown/no content type',
                                extension: record.extension,
                            },
                            null,
                            '\t',
                        ),
                    );

                    await writeFile(dataBlobPath, record.value);

                    break;
                }
                default:
            }

            break;
        }
        default:
    }
}
