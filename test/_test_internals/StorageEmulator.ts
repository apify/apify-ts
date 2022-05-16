import { rm } from 'node:fs/promises';

export abstract class StorageEmulator {
    protected localStorageDirectories: string[] = [];

    abstract init(dirName?: string): Promise<void>;

    async destroy() {
        const promises = this.localStorageDirectories.map((dir) => {
            return rm(dir, { force: true, recursive: true });
        });

        await Promise.all(promises);
    }
}
