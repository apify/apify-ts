import { initialize, expect, getActorTestDir, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { stats } = await runActor(testActorDirname);

expect(stats.requestsFinished === 2, 'All requests finished');
await new Promise((resolve) => setTimeout(resolve, 10));
expect(
    stats.crawlerRuntimeMillis > 60_000 && stats.crawlerRuntimeMillis < 61_000,
    `Ran one task per minute, took ~1 minute to complete, but no more than that (${stats.crawlerRuntimeMillis}ms)`,
);

process.exit(0);
