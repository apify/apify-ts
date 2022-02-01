import type { Page } from 'puppeteer';

export * from '@crawlers/browser';
export * from './internals/puppeteer-crawler';
export * from './internals/puppeteer-launcher';

export * as puppeteerStealth from './internals/stealth';
export type { StealthOptions } from './internals/stealth';

export * as puppeteerRequestInterception from './internals/utils/puppeteer_request_interception';
export type { InterceptHandler } from './internals/utils/puppeteer_request_interception';

export * as puppeteerUtils from './internals/utils/puppeteer_utils';
export type {
    BlockRequestsOptions,
    CompiledScriptFunction,
    CompiledScriptParams,
    DirectNavigationOptions,
    InfiniteScrollOptions,
    InjectFileOptions,
    SaveSnapshotOptions,
} from './internals/utils/puppeteer_utils';

export * as puppeteerClickElements from './internals/enqueue-links/click-elements';
export type { EnqueueLinksByClickingElementsOptions } from './internals/enqueue-links/click-elements';

declare module '@crawlers/browser' {
    export interface EnqueueLinksOptions {
        /**
         * Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) or Playwright [`Page`](https://playwright.dev/docs/api/class-page) object.
         * Either `page` or `$` option must be provided.
         */
        page?: Page;
    }
}
