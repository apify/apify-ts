import { initialize, getActorTestDir, runActor, expect, validateDataset } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats, datasetItems } = await runActor(testActorDirname);

expect(stats.requestsFinished > 50, 'All requests finished');

expect(datasetItems.length > 50, 'Minimum number of dataset items');
expect(datasetItems.length < 150, 'Maximum number of dataset items');
expect(validateDataset(datasetItems, ['pageTitle']), 'Dataset items validation');

process.exit(0);
