import log from '@apify/log';
import { cryptoRandomObjectId } from '@apify/utilities';
import { ApifyStorageLocal } from '@apify/storage-local';
import { Configuration } from 'crawlee';
import { ensureDir } from 'fs-extra';
import { resolve } from 'node:path';
import { StorageEmulator } from './StorageEmulator';

const LOCAL_EMULATION_DIR = resolve(__dirname, '..', 'tmp', 'sqlite-emulation-dir');

export class SqliteStorageEmulator extends StorageEmulator {
    async init(dirName = cryptoRandomObjectId(10)) {
        const localStorageDir = resolve(LOCAL_EMULATION_DIR, dirName);
        await ensureDir(localStorageDir);

        const storage = new ApifyStorageLocal({ storageDir: localStorageDir });
        Configuration.getGlobalConfig().useStorageClient(storage as never);
        log.debug(`Initialized emulated sqlite storage in folder ${localStorageDir}`);
    }

    static override toString() {
        return '@apify/storage-local';
    }
}
