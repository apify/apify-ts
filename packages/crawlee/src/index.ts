/* eslint-disable import/export */

import { log, enqueueLinks } from '@crawlee/core';
import { social } from '@crawlee/utils';
import { puppeteerUtils } from '@crawlee/puppeteer';
import { playwrightUtils } from '@crawlee/playwright';

export * from '@crawlee/core';
export * from '@crawlee/utils';
export * from '@crawlee/basic';
export * from '@crawlee/browser';
export * from '@crawlee/cheerio';
export * from '@crawlee/puppeteer';
export * from '@crawlee/playwright';

export const utils = {
    puppeteer: puppeteerUtils,
    playwright: playwrightUtils,
    log,
    enqueueLinks,
    social,
};
