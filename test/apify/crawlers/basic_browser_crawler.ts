import { BrowserCrawler, PuppeteerCrawlingContext, PuppeteerCrawlerOptions } from '@crawlee/puppeteer';
import { PuppeteerPlugin } from '@crawlee/browser-pool';
import { LaunchOptions } from 'puppeteer';

export class BrowserCrawlerTest extends BrowserCrawler<{ browserPlugins: [PuppeteerPlugin] }, LaunchOptions, PuppeteerCrawlingContext> {
    constructor(options: Partial<PuppeteerCrawlerOptions> = {}) {
        super(options as any);
    }
}
