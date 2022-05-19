import { initialize, getActorTestDir, runActor, expect, waitAsync } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname);
const { requestCounter, navigationCounter } = datasetItems[0];

expect(requestCounter === 3, 'Processed 3 requests');
await waitAsync(1e2);
expect(navigationCounter === 1, 'Navigated on 1 request only');
