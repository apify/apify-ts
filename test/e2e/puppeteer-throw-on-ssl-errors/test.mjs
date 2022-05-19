import { initialize, getActorTestDir, runActor, expect, validateDataset, waitAsync } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

expect(stats.requestsFinished >= 5, 'All requests finished');
await waitAsync(1e2);
expect(stats.requestsFailed > 20 && stats.requestsFailed < 30, 'Number of failed requests');

expect(datasetItems.length >= 5 && datasetItems.length < 10, 'Number of dataset items');
await waitAsync(1e2);
expect(validateDataset(datasetItems, ['url', 'title']), 'Dataset items validation');

process.exit(0);
