import { initialize, getActorTestDir, runActor, expect, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, 8192);

await expect(stats.requestsFinished === 5, 'All requests finished');
await expect(datasetItems.length === 5, 'Number of dataset items');
await expect(validateDataset(datasetItems, ['clientIp']), 'Dataset items validation');

process.exit(0);
