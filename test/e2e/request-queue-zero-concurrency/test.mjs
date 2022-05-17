import { initialize, getActorTestDir, runActor, expect } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats } = await runActor(testActorDirname);

expect(stats.requestsFinished === 3, 'All requests finished');
await new Promise((resolve) => setTimeout(resolve, 10));
expect(
    stats.crawlerRuntimeMillis > 30 * 1e3 && stats.crawlerRuntimeMillis < 35 * 1e3,
    'RequestQueue triggers auto-reset after being stuck with requests in progress',
);

process.exit(0);
