import { Actor } from 'apify';
import { PuppeteerCrawler } from '@crawlee/puppeteer';

await Actor.main(async () => {
    const preNavigationHooks = [(_ctx, goToOptions) => {
        goToOptions.waitUntil = ['networkidle2'];
    }];

    const requestHandler = async ({ page, enqueueLinks, request }) => {
        const { url } = request;
        const pageTitle = await page.title();
        await Actor.pushData({ url, pageTitle });
        await enqueueLinks({ regexps: [/^https:\/\/apify\.com(\/[\w-]+)?$/i] });
    };

    const crawler = new PuppeteerCrawler({ requestHandler, preNavigationHooks });
    await crawler.addRequests(['https://apify.com']);
    await crawler.run();
});
