import { BrowserCrawler, PuppeteerCrawlContext, PuppeteerCrawlerOptions } from '@crawlee/puppeteer';
import { PuppeteerPlugin } from '@crawlee/browser-pool';
import { LaunchOptions } from 'puppeteer';

export class BrowserCrawlerTest extends BrowserCrawler<{ browserPlugins: [PuppeteerPlugin] }, LaunchOptions, PuppeteerCrawlContext> {
    constructor(options: Partial<PuppeteerCrawlerOptions> = {}) {
        super(options as any);
    }

    protected override _applyCookies(ctx: PuppeteerCrawlContext, preHooksCookies: string, postHookCookies: string): Promise<void> {
        throw new Error('Method not implemented.');
    }
}
