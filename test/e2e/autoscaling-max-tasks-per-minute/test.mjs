import { initialize, expect, getActorTestDir, runActor, waitAsync } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats } = await runActor(testActorDirname);

expect(stats.requestsFinished === 2, 'All requests finished');
await waitAsync(1e2);
expect(
    stats.crawlerRuntimeMillis > 60_000 && stats.crawlerRuntimeMillis < 65_000,
    `Ran one task per minute, took ~1 minute to complete, but no more than that (${stats.crawlerRuntimeMillis}ms)`,
);

process.exit(0);
