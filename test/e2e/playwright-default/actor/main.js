import { Actor } from 'apify';
import { PlaywrightCrawler } from '@crawlee/playwright';

await Actor.main(async () => {
    const crawler = new PlaywrightCrawler({
        preNavigationHooks: [(_ctx, goToOptions) => {
            goToOptions.waitUntil = 'networkidle';
        }],
        async requestHandler({ page, enqueueLinks, request }) {
            const { url } = request;
            const pageTitle = await page.title();
            await Actor.pushData({ url, pageTitle });
            await enqueueLinks({ regexps: [/^https:\/\/apify\.com(\/[\w-]+)?$/i] });
        },
    });

    await crawler.addRequests(['https://apify.com']);
    await crawler.run();
}, { exit: false });
