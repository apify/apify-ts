import { initialize, expect, validateDataset, getActorTestDir, runActor, waitAsync } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

expect(stats.requestsFinished > 475 , 'All requests finished');

expect(datasetItems.length > 475 && datasetItems.length < 525, 'Number of dataset items');
await waitAsync(1e2);
expect(
    validateDataset(
        datasetItems,
        ['url', 'title', 'uniqueIdentifier', 'description', 'modifiedDate', 'runCount'],
    ),
    'Dataset items validation',
);

process.exit(0);
