import { Configuration, setValue } from '../../packages/apify/dist/index.mjs';
import { purgeLocalStorage } from '../../packages/apify/dist/utils.js';
import { join } from 'path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import fs from 'fs-extra';

export const colors = {
    red: (text) => `\x1B[31m${text}\x1B[39m`,
    green: (text) => `\x1B[32m${text}\x1B[39m`,
    grey: (text) => `\x1B[90m${text}\x1B[39m`,
    yellow: (text) => `\x1B[33m${text}\x1B[39m`,
};

export function getStorage(url) {
    return join(dirname(fileURLToPath(url)), './apify_storage');
}

export async function getStats(url) {
    const dir = getStorage(url);
    const path = join(dir, 'key_value_stores/default/SDK_CRAWLER_STATISTICS_0.json');

    if (!existsSync(path)) {
        return false;
    }

    return fs.readJSON(path);
}

export async function run(url, scraper, input) {
    process.env.APIFY_LOCAL_STORAGE_DIR = getStorage(url);

    await purgeLocalStorage();
    const inputKey = Configuration.getGlobalConfig().get('inputKey');
    await setValue(inputKey, input);

    const exit = process.exit;
    process.exit = () => {};

    await import(`../../packages/actor-scraper/${scraper}/dist/main.js`);
    await waitForFinish(url);
    process.exit = exit;
}

async function isFinished(dir) {
    const stats = await getStats(dir);
    return !!stats.crawlerFinishedAt;
}

export async function waitForFinish(dir) {
    while (!await isFinished(dir)) {
        await setTimeout(1000);
    }
}

export function expect(bool, message) {
    if (bool) {
        console.log(`[assertion] passed: ${message}`);
    } else {
        console.log(`[assertion] failed: ${message}`);
        process.exit(1);
    }
}
