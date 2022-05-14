import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';

await Actor.main(async () => {
    const requestHandler = async ({ request, $, enqueueLinks }) => {
        const { userData: { label } } = request;

        if (label === 'START') {
            await enqueueLinks({
                globs: [{ glob: 'https://apify.com/apify/web-scraper', userData: { label: 'DETAIL' } }],
            });
        }

        if (label === 'DETAIL') {
            const { url } = request;

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
    };

    const crawler = new CheerioCrawler({ requestHandler });
    await crawler.addRequests([{ url: 'https://apify.com/apify', userData: { label: 'START' } }]);
    await crawler.run();
});
