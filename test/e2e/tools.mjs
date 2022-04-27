/* eslint-disable import/no-relative-packages */
import { join } from 'path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'os';
import fs from 'fs-extra';
import { URL_NO_COMMAS_REGEX, purgeLocalStorage } from '../../packages/utils/dist/index.mjs';

export const SKIPPED_TEST_CLOSE_CODE = 404;

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

export async function getApifyToken() {
    const authPath = join(homedir(), '.apify', 'auth.json');

    if (!existsSync(authPath)) {
        throw new Error('You need to be logged in with your Apify account to run E2E tests. Call "apify login" to fix that.');
    }

    const { token } = await fs.readJSON(authPath);
    return token;
}

export async function getDatasetItems(url) {
    const dir = getStorage(url);
    const datasetPath = join(dir, 'datasets/default/');

    const dirents = await readdir(datasetPath, { withFileTypes: true });
    const fileNames = dirents.filter((dirent) => dirent.isFile());
    const datasetItems = [];

    for (const fileName of fileNames) {
        const filePath = join(datasetPath, fileName.name);
        const datasetItem = await fs.readJSON(filePath);

        if (!isItemHidden(datasetItem)) {
            datasetItems.push(datasetItem);
        }
    }

    return datasetItems;
}

export async function initialize(url) {
    process.env.APIFY_LOCAL_STORAGE_DIR = getStorage(url);
    process.env.APIFY_HEADLESS = 1; // run browser in headless mode (default on platform)
    process.env.APIFY_TOKEN = process.env.APIFY_TOKEN ?? await getApifyToken();
    process.env.APIFY_CONTAINER_URL = process.env.APIFY_CONTAINER_URL ?? 'http://127.0.0.1';
    process.env.APIFY_CONTAINER_PORT = process.env.APIFY_CONTAINER_PORT ?? '8000';

    await purgeLocalStorage();
    console.log('[init] Storage directory:', process.env.APIFY_LOCAL_STORAGE_DIR);
}

export function expect(bool, message) {
    if (bool) {
        console.log(`[assertion] passed: ${message}`);
    } else {
        console.log(`[assertion] failed: ${message}`);
        process.exit(1);
    }
}

export function skipTest(reason) {
    console.error(`[test skipped] ${reason}`);
    process.exit(SKIPPED_TEST_CLOSE_CODE);
}

export function validateDataset(items, schema = []) {
    for (const item of items) {
        if (!item.hasOwnProperty('url') || !item.url.match(URL_NO_COMMAS_REGEX)) {
            return false;
        }

        const modifiedDateIndex = schema.indexOf('modifiedDate');
        if (modifiedDateIndex !== -1) {
            if (!item.hasOwnProperty('modifiedDate') || Number.isNaN(Date.parse(item.modifiedDate))) {
                return false;
            }
            schema.splice(modifiedDateIndex, 1);
        }

        const runCountIndex = schema.indexOf('runCount');
        if (runCountIndex !== -1) {
            if (!item.hasOwnProperty('runCount') || !Number.isInteger(item.runCount)) {
                return false;
            }
            schema.splice(runCountIndex, 1);
        }

        for (const propName of schema) {
            if (!item.hasOwnProperty(propName) || typeof item[propName] !== 'string') {
                return false;
            }
        }
    }
    return true;
}

function isItemHidden(item) {
    for (const key of Object.keys(item)) {
        if (!key.startsWith('#')) {
            return false;
        }
    }
    return true;
}
