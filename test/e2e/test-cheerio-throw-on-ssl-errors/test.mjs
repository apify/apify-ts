import { initialize, getActorTestDir, runActor, expect, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, true);

expect(stats.requestsFinished > 5 && stats.requestsFinished < 10, 'All requests finished');

expect(datasetItems.length > 5 && datasetItems.length < 10, 'Number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 10));
expect(validateDataset(datasetItems, ['url', 'title']), 'Dataset items validation');

process.exit(0);
