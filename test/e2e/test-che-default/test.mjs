import child_process from 'child_process';
import { promisify } from 'util';
import { ApifyClient } from 'apify-client';
import { copyPackages, getActorTestDir, getActorName, getStats, getDatasetItems, expect, validateDataset } from '../tools.mjs';

const exec = promisify(child_process.exec);

const testActorDirname = getActorTestDir(import.meta.url);

let stats;
let datasetItems;

if (process.env.npm_config_platform) {
    await copyPackages(testActorDirname);
    // TODO: add some check for token (or check that we are logged in)
    await exec('apify push', { cwd: testActorDirname });

    const actorName = await getActorName(testActorDirname);
    const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
    const { items: actors } = await client.actors().list();
    const { id } = actors.find((actor) => actor.name === actorName);

    const { defaultKeyValueStoreId, defaultDatasetId } = await client.actor(id).call();
    const { value } = await client.keyValueStore(defaultKeyValueStoreId).getRecord('SDK_CRAWLER_STATISTICS_0');
    stats = value;
    const { items } = await client.dataset(defaultDatasetId).listItems();
    datasetItems = items;
} else {
    await exec('apify run -p', { cwd: testActorDirname });
    stats = await getStats(testActorDirname);
    datasetItems = await getDatasetItems(testActorDirname);
}

expect(stats.requestsFinished > 50, 'All requests finished');

expect(datasetItems.length > 50, 'Minimum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(datasetItems.length < 150, 'Maximum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(validateDataset(datasetItems, ['pageTitle']), 'Dataset items validation');

process.exit(0);
