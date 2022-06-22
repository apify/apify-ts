import { readFile, writeFile } from 'node:fs/promises';

const indexDTsFile = new URL('../dist/index.d.ts', import.meta.url);

const currentContent = (await readFile(indexDTsFile, 'utf8')).split('\n');

currentContent.push(
	`// Augment the crawlee KeyValueStore with the new available method`,
`declare module '@crawlee/core' {
    interface KeyValueStore {
        getPublicUrl(key: string): string;
    }
}
`);

await writeFile(indexDTsFile, currentContent.join('\n'));
