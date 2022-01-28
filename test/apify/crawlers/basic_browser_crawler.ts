import { BrowserCrawler, PuppeteerCrawlContext, PuppeteerCrawlerOptions } from '@crawlers/core';
import { PuppeteerPlugin } from 'browser-pool';
import { LaunchOptions } from 'puppeteer';

export class BrowserCrawlerTest extends BrowserCrawler<LaunchOptions, { browserPlugins: [PuppeteerPlugin] }, PuppeteerCrawlContext> {
    constructor(options: Partial<PuppeteerCrawlerOptions> = {}) {
        super(options as any);
    }
}
