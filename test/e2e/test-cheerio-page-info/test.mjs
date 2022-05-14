import { initialize, expect, validateDataset, getActorTestDir, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname, true);

expect(stats.requestsFinished === 2, 'All requests finished');

expect(datasetItems.length === 1, 'Number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 10));
expect(
    validateDataset(
        datasetItems,
        ['url', 'title', 'uniqueIdentifier', 'description', 'modifiedDate', 'runCount'],
    ),
    'Dataset items validation');

process.exit(0);
