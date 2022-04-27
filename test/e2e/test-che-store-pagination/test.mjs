import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';
import { getDatasetItems, initialize, expect, validateDataset, skipTest } from '../tools.mjs';

skipTest('Apify store lazy loads items now, which cannot be easily tested with Cheerio');

await initialize(import.meta.url);

const crawler = new CheerioCrawler({
    async requestHandler({ $, request, log }) {
        const { userData: { label } } = request;

        switch (label) {
            case 'START': return handleStart();
            case 'DETAIL': return handleDetail();
            default: log.error(`Unknown label: ${label}`);
        }

        async function handleStart() {
            log.info('Store opened!');

            const dataJson = $('#__NEXT_DATA__').html();
            const data = JSON.parse(dataJson);
            const { props: { pageProps: { items } } } = data;

            for (const item of items) {
                const { name, username } = item;
                const actorDetailUrl = `https://apify.com/${username}/${name}`;
                await crawler.addRequests([
                    {
                        url: actorDetailUrl,
                        userData: { label: 'DETAIL' },
                    },
                ]);
            }
        }

        async function handleDetail() {
            const { url } = request;
            log.info(`Scraping ${url}`);

            const uniqueIdentifier = url.split('/').slice(-2).join('/');
            const title = $('header h1').text();
            const description = $('header span.actor-description').text();
            const modifiedDate = $('ul.ActorHeader-stats time').attr('datetime');
            const runCount = $('ul.ActorHeader-stats > li:nth-of-type(3)').text().match(/[\d,]+/)[0].replace(/,/g, '');

            await Actor.pushData({
                url,
                uniqueIdentifier,
                title,
                description,
                modifiedDate: new Date(Number(modifiedDate)),
                runCount: Number(runCount),
            });
        }
    },
    ignoreSslErrors: false,
    maxRequestsPerCrawl: 750,
});

await crawler.addRequests([{ url: 'https://apify.com/store', userData: { label: 'START' } }]);

const stats = await Actor.main(() => crawler.run(), { exit: false, purge: true });
expect(stats.requestsFinished > 700, 'All requests finished');

const datasetItems = await getDatasetItems(import.meta.url);
expect(datasetItems.length > 700, 'Minimum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(datasetItems.length < 1000, 'Maximum number of dataset items');
await new Promise((resolve) => setTimeout(resolve, 100));
expect(validateDataset(datasetItems, ['title', 'uniqueIdentifier', 'description', 'modifiedDate', 'runCount']),
    'Dataset items validation');

process.exit(0);
