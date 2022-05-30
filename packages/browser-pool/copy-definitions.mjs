import { copyFileSync } from 'fs';
import { join } from 'path';

const files = [
    'puppeteer/puppeteer-proxy-per-page.d.ts',
];

for (const file of files) {
    copyFileSync(
        join('src', file),
        join('dist', file),
    );
}
