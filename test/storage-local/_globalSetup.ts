import { emptyDirSync, ensureDirSync } from 'fs-extra';
import { TEMP_DIR } from './_tools';

export default function globalSetup(): void {
    ensureDirSync(TEMP_DIR);
    emptyDirSync(TEMP_DIR);
};
