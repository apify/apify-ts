import { removeSync } from 'fs-extra';
import { TEMP_DIR } from './_tools';

export default function globalTeardown(): void {
    removeSync(TEMP_DIR);
};
