import { emptyDirSync, ensureDirSync, removeSync } from 'fs-extra';
import { join } from 'path';

export const TEMP_DIR = join(__dirname, 'tmp');

export function prepareTestDir(): string {
    const name = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const dir = join(TEMP_DIR, name);
    ensureDirSync(dir);
    emptyDirSync(dir);
    return dir;
};

export function removeTestDir(name: string): void {
    const dir = join(TEMP_DIR, name);
    removeSync(dir);
};
