import { initialize, getActorTestDir, runActor, expect, validateDataset, waitAsync } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);
expect(stats.requestsFinished > 20, 'All requests finished');

expect(datasetItems.length > 20, 'Minimum number of dataset items');
await waitAsync(1e2);
expect(validateDataset(datasetItems, ['url', 'title']), 'Dataset items validation');

process.exit(0);
