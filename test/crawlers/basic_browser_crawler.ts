import { BrowserCrawler, PuppeteerCrawlContext, PuppeteerCrawlerOptions } from 'apify';
import { PuppeteerPlugin } from 'browser-pool';
import { LaunchOptions } from 'puppeteer';

export class BrowserCrawlerTest extends BrowserCrawler<LaunchOptions, { browserPlugins: [PuppeteerPlugin] }, PuppeteerCrawlContext> {
    public constructor(options: Partial<PuppeteerCrawlerOptions> = {}) {
        super(options as any);
    }
}
