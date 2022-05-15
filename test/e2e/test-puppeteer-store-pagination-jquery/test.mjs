import { initialize, getActorTestDir, runActor, expect, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

expect(stats.requestsFinished > 700, 'All requests finished');

expect(datasetItems.length > 700 && datasetItems.length < 1000, 'Number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 10));
expect(
    validateDataset(
        datasetItems,
        ['url', 'title', 'uniqueIdentifier', 'description', 'modifiedDate', 'runCount'],
    ),
    'Dataset items validation',
);

process.exit(0);
