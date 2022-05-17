import { Actor } from 'apify';
import { PlaywrightCrawler } from '@crawlee/playwright';

await Actor.main(async () => {
    const preNavigationHooks = [(_ctx, goToOptions) => {
        goToOptions.waitUntil = 'networkidle';
    }];

    const requestHandler = async ({ page, enqueueLinks, request }) => {
        const { url } = request;
        const pageTitle = await page.title();
        await Actor.pushData({ url, pageTitle });
        await enqueueLinks({ regexps: [/^https:\/\/apify\.com(\/[\w-]+)?$/i] });
    };

    const crawler = new PlaywrightCrawler({ requestHandler, preNavigationHooks });
    await crawler.addRequests(['https://apify.com']);
    await crawler.run();
});
