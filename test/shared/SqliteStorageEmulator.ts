import log from '@apify/log';
import { LOCAL_STORAGE_SUBDIRS, LOCAL_ENV_VARS, ENV_VARS } from '@apify/consts';
import { cryptoRandomObjectId } from '@apify/utilities';
import { ApifyStorageLocal } from '@apify/storage-local';
import { Configuration } from 'crawlee';
import { ensureDir } from 'fs-extra';
import { resolve } from 'node:path';
import { StorageEmulator } from './StorageEmulator';

const LOCAL_EMULATION_DIR = resolve(__dirname, '..', 'tmp', 'sqlite-emulation-dir');

const DEFAULT_FOLDERS = Object.values(LOCAL_STORAGE_SUBDIRS)
    .concat([
        `${LOCAL_STORAGE_SUBDIRS.keyValueStores}/${LOCAL_ENV_VARS[ENV_VARS.DEFAULT_KEY_VALUE_STORE_ID]}`,
        'live_view',
    ] as any);

export class SqliteStorageEmulator extends StorageEmulator {
    async init(dirName = cryptoRandomObjectId(10)) {
        const localStorageDir = resolve(LOCAL_EMULATION_DIR, dirName);
        this.localStorageDirectories.push(localStorageDir);
        await ensureDir(localStorageDir);

        await Promise.all(
            DEFAULT_FOLDERS.map((folder) => {
                return ensureDir(resolve(localStorageDir, folder));
            }),
        );

        process.env.APIFY_LOCAL_STORAGE_DIR = localStorageDir;

        const storage = new ApifyStorageLocal({ storageDir: localStorageDir });
        Configuration.getGlobalConfig().useStorageClient(storage as never);
        log.debug(`Initialized emulated sqlite storage in folder ${localStorageDir}`);
    }

    static override toString() {
        return '@apify/storage-local';
    }
}
