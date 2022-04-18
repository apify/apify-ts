import child_process from 'child_process';
import { promisify } from 'util';
import { getActorTestDir, getStats, getDatasetItems, expect, validateDataset } from '../tools.mjs';

const exec = promisify(child_process.exec);

const testActorDirname = getActorTestDir(import.meta.url);
await exec('apify run -p', { cwd: testActorDirname });

const stats = await getStats(testActorDirname);
expect(stats.requestsFinished > 50, 'All requests finished');

const datasetItems = await getDatasetItems(testActorDirname);
expect(datasetItems.length > 50, 'Minimum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(datasetItems.length < 150, 'Maximum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(validateDataset(datasetItems, ['pageTitle']), 'Dataset items validation');

process.exit(0);
