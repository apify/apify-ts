import { Configuration, setValue } from '../../packages/apify/dist/index.mjs';
import { purgeLocalStorage } from '../../packages/apify/dist/utils.js';
import { join } from 'path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { readdir } from 'node:fs/promises';
import fs from 'fs-extra';
import { isMainThread, parentPort, Worker, workerData } from 'worker_threads';
import { colors } from './tools.mjs';

const source = dirname(fileURLToPath(import.meta.url));

async function run() {
    const paths = await readdir(source, { withFileTypes: true })
    const dirs = paths.filter(dirent => dirent.isDirectory());

    for (const dir of dirs) {
        console.log('wat', dir.name);
        const worker = new Worker(fileURLToPath(import.meta.url), {
            workerData: dir.name.trim(),
            stdout: true,
        });
        // worker.on('message', (args) => console.log('on message', args));
        // worker.on('error', (args) => console.log('on error', args));
        // worker.on('exit', (code) => {
        //     if (code !== 0)
        //         reject(new Error(`Worker stopped with exit code ${code}`));
        // });

        worker.on('exit', (code) => {
            console.log(`Test ${dir.name} finished with ${code === 0 ? 'success' : 'failure'}`);
        });
    }
}

if (isMainThread) {
    await run();
} else {
    const script = `${source}/${workerData.trim()}/test.mjs`;
    console.log('Running test', colors.green(script));
    await import(script);
    // parentPort.postMessage(parse(script));
}
