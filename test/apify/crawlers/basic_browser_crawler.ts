import { BrowserCrawler, PuppeteerCrawlContext, PuppeteerCrawlerOptions } from '@crawlers/puppeteer';
import { PuppeteerPlugin } from 'browser-pool';
import { LaunchOptions } from 'puppeteer';

export class BrowserCrawlerTest extends BrowserCrawler<{ browserPlugins: [PuppeteerPlugin] }, LaunchOptions, PuppeteerCrawlContext> {
    constructor(options: Partial<PuppeteerCrawlerOptions> = {}) {
        super(options as any);
    }
}
