import { initialize, getActorTestDir, runActor, expect, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

expect(stats.requestsFinished === 5, 'All requests finished');

expect(datasetItems.length === 5, 'Number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 10));
expect(validateDataset(datasetItems, ['clientIp']), 'Dataset items validation');

process.exit(0);
