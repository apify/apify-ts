import { rm } from 'node:fs/promises';

export abstract class StorageEmulator {
    protected localeStorageDirectories: string[] = [];

    abstract init(dirName?: string): Promise<void>;

    async destroy() {
        const promises = this.localeStorageDirectories.map((dir) => {
            return rm(dir, { force: true, recursive: true });
        });

        await Promise.all(promises);
    }
}
