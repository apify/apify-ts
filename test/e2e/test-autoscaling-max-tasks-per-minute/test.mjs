import { initialize, expect, getActorTestDir, runActor } from '../tools.mjs';

const testActorDirname = getActorTestDir(import.meta.url);
await initialize(testActorDirname);

const { datasetItems } = await runActor(testActorDirname, true);
const { difference } = datasetItems[0];

expect(
    difference >= 60_000 && difference <= 61_000,
    `Ran one task per minute, took ~1 minutes to complete but no more than that (actual: ${difference}ms)`,
);

process.exit(0);
