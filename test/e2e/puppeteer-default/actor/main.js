import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';

await Actor.main(async () => {
    const crawler = new PuppeteerCrawler({
        preNavigationHooks: [(_ctx, goToOptions) => {
            goToOptions.waitUntil = ['networkidle2'];
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
});
