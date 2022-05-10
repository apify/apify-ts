import { BrowserCrawler, PuppeteerCrawlingContext, PuppeteerCrawlerOptions, PuppeteerGoToOptions } from '@crawlee/puppeteer';
import { PuppeteerPlugin } from '@crawlee/browser-pool';
import { HTTPResponse, LaunchOptions } from 'puppeteer';

export class BrowserCrawlerTest extends BrowserCrawler<{ browserPlugins: [PuppeteerPlugin] }, LaunchOptions, PuppeteerCrawlingContext> {
    constructor(options: Partial<PuppeteerCrawlerOptions> = {}) {
        super(options as any);
    }

    protected _navigationHandler(ctx: PuppeteerCrawlingContext, gotoOptions: PuppeteerGoToOptions): Promise<HTTPResponse | null | undefined> {
        return ctx.page.goto(ctx.request.url, gotoOptions);
    }
}
