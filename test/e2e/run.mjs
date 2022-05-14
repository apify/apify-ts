import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { readdir } from 'node:fs/promises';
import { isMainThread, Worker, workerData } from 'node:worker_threads';
import { colors, getApifyToken, clearPackages, clearStorage, SKIPPED_TEST_CLOSE_CODE } from './tools.mjs';

const basePath = dirname(fileURLToPath(import.meta.url));

process.env.APIFY_LOG_LEVEL = '0'; // switch off logs for better test results visibility
process.env.APIFY_HEADLESS = '1'; // run browser in headless mode (default on platform)
process.env.APIFY_TOKEN = process.env.APIFY_TOKEN ?? await getApifyToken();
process.env.APIFY_CONTAINER_URL = process.env.APIFY_CONTAINER_URL ?? 'http://127.0.0.1';
process.env.APIFY_CONTAINER_PORT = process.env.APIFY_CONTAINER_PORT ?? '8000';

async function run() {
    const paths = await readdir(basePath, { withFileTypes: true });
    const dirs = paths.filter((dirent) => dirent.isDirectory());

    for (const dir of dirs) {
        if (process.argv.length === 3 && dir.name !== process.argv[2]) {
            continue;
        }

        const now = Date.now();
        const worker = new Worker(fileURLToPath(import.meta.url), {
            workerData: dir.name,
            stdout: true,
        });
        let seenFirst = false;
        worker.stdout.on('data', (data) => {
            const str = data.toString();

            if (str.startsWith('[test skipped]')) {
                return;
            }

            if (str.startsWith('[init]')) {
                seenFirst = true;
                return;
            }

            if (!seenFirst) {
                console.log(`${colors.red('[fatal]')} test ${colors.yellow(`[${dir.name}]`)} did not call "initialize(import.meta.url)"!`);
                worker.terminate();
                return;
            }

            const match = str.match(/\[assertion] (passed|failed): (.*)/);

            if (match) {
                const c = match[1] === 'passed' ? colors.green : colors.red;
                console.log(`${colors.yellow(`[${dir.name}]`)} ${match[2]}: ${c(match[1])}`);
            }
        });
        worker.on('exit', async (code) => {
            if (code === SKIPPED_TEST_CLOSE_CODE) {
                console.log(`Test ${colors.yellow(`[${dir.name}]`)} was skipped`);
                return;
            }

            const took = (Date.now() - now) / 1000;
            // eslint-disable-next-line max-len
            console.log(`Test ${colors.yellow(`[${dir.name}]`)} finished with status: ${code === 0 ? colors.green('success') : colors.red('failure')} ${colors.grey(`[took ${took}s]`)}`);
            if (process.env.npm_config_platform) await clearPackages(`${basePath}/${dir.name}`);
        });
        await once(worker, 'exit');
    }
}

if (isMainThread) {
    await run();
} else {
    await import(`${basePath}/${workerData}/test.mjs`);
}
