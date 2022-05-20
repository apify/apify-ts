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

export async function handleMessage(message: WorkerReceivedMessage) {
    switch (message.action) {
        case 'update-metadata':
            await updateMetadata(message);
            break;
        case 'update-entries':
            await updateItems(message);
            break;
        default:
            // @ts-expect-error We're keeping this to make eslint happy + in the event we add a new action without adding checks for it
            // we should be aware of them
            workerLog.warning(`Unknown worker message action ${message.action}`);
    }
}

async function updateMetadata(message: WorkerUpdateMetadataMessage) {
    workerLog.info(`Updating metadata for ${message.entityType} with id ${message.id}`);

    // Ensure the directory for the entity exists
    const dir = message.entityDirectory;
    await ensureDir(dir);

    // Write the metadata to the file
    const filePath = resolve(dir, '__metadata__.json');
    await writeFile(filePath, JSON.stringify(message.data, null, '\t'));
}

async function updateItems(message: WorkerUpdateEntriesMessage) {
    workerLog.info(`Updating entries for ${message.entityType} with id ${message.id}`);

    // Ensure the directory for the entity exists
    const dir = message.entityDirectory;
    await ensureDir(dir);

    switch (message.entityType) {
        case 'requestQueues': {
            // Write the entries to the file
            const filePath = resolve(dir, 'entries.json');
            await writeFile(filePath, JSON.stringify(message.data, null, '\t'));
            break;
        }
        case 'datasets': {
            // Save all the new items to the disk
            for (const [idx, data] of message.data) {
                await writeFile(
                    resolve(dir, `${idx}.json`),
                    JSON.stringify(data, null, '\t'),
                );
            }

            break;
        }
        case 'keyValueStores': {
            // Create files for the record
            const { action, record } = message.data;

            const itemPath = resolve(dir, `${record.key}.${record.extension}`);

            switch (action) {
                case 'delete':
                    await rm(itemPath, { force: true, recursive: true });
                    break;
                case 'set': {
                    await rm(itemPath, { force: true, recursive: true });

                    const metadataPath = resolve(dir, `${record.key}.__metadata__.json`);

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

                    await writeFile(itemPath, record.value);

                    break;
                }
                default:
            }

            break;
        }
        default:
    }
}
