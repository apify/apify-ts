import type { Page } from 'playwright';

export * from '@crawlers/browser';
export * from './internals/playwright-crawler';
export * from './internals/playwright-launcher';

export * as playwrightUtils from './internals/utils/playwright-utils';
export type { DirectNavigationOptions } from './internals/utils/playwright-utils';

declare module '@crawlers/browser' {
    export interface EnqueueLinksOptions {
        /**
         * Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) or Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
         * Either `page` or `$` option must be provided.
         */
        page?: Page;
    }
}
