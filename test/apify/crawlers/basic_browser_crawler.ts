import { BrowserCrawler, PuppeteerCookie, PuppeteerCrawlContext, PuppeteerCrawlerOptions } from '@crawlee/puppeteer';
import { PuppeteerPlugin } from '@crawlee/browser-pool';
import { LaunchOptions } from 'puppeteer';
import { Cookie } from 'tough-cookie';

export class BrowserCrawlerTest extends BrowserCrawler<{ browserPlugins: [PuppeteerPlugin] }, LaunchOptions, PuppeteerCrawlContext> {
    constructor(options: Partial<PuppeteerCrawlerOptions> = {}) {
        super(options as any);
    }

    protected override async _applyCookies({ session, request, page }: PuppeteerCrawlContext, preHooksCookies: string, postHooksCookies: string) {
        const sessionCookie = session?.getPuppeteerCookies(request.url) ?? [];
        const parsedPreHooksCookies = preHooksCookies.split(/ *; */).map((c) => Cookie.parse(c)?.toJSON());
        const parsedPostHooksCookies = postHooksCookies.split(/ *; */).map((c) => Cookie.parse(c)?.toJSON());

        await page.setCookie(
            ...[
                ...sessionCookie,
                ...parsedPreHooksCookies,
                ...parsedPostHooksCookies,
            ].filter((c): c is PuppeteerCookie => typeof c !== 'undefined'),
        );
    }
}
