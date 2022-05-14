import { Actor } from 'apify';
import { CheerioCrawler } from '@crawlee/cheerio';

await Actor.main(async () => {
    const requestHandler = async ({ $, request }) => {
        const { url, userData: { label } } = request;

        if (label === 'START') {
            const links = $('.ActorStoreItem').toArray().map((item) => $(item).attr('href'));
            for (const link of links) {
                const actorDetailUrl = `https://apify.com${link}`;
                await crawler.addRequests([{
                    url: actorDetailUrl,
                    userData: { label: 'DETAIL' },
                }]);
            }
        } else if (label === 'DETAIL') {
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

    const crawler = new CheerioCrawler({ requestHandler, maxRequestsPerCrawl: 500 });
    await crawler.addRequests([{
        url: 'https://apify.com/apify',
        userData: { label: 'START' },
    }, {
        url: 'https://apify.com/mshopik',
        userData: { label: 'START' },
    }]);
    await crawler.run();
});
