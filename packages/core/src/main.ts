// TODO check what we want to export based on this file + exports.ts

import log from './utils_log';
import { Configuration } from './configuration';
import { AutoscaledPool } from './autoscaling/autoscaled_pool';
import { BasicCrawler } from './crawlers/basic_crawler';
import { CheerioCrawler } from './crawlers/cheerio_crawler';
import { Dataset, pushData, openDataset } from './storages/dataset';
import { events, initializeEvents, stopEvents } from './events';
import { getValue, setValue, getInput, openKeyValueStore, KeyValueStore } from './storages/key_value_store';
import { launchPuppeteer } from './browser_launchers/puppeteer_launcher';
import { launchPlaywright } from './browser_launchers/playwright_launcher';
import { BrowserCrawler } from './crawlers/browser_crawler';
import { PuppeteerCrawler } from './crawlers/puppeteer_crawler';
import { PlaywrightCrawler } from './crawlers/playwright_crawler';
import { Request } from './request';
import { RequestList, openRequestList } from './storages/request_list';
import { createProxyConfiguration } from './proxy_configuration';
import { RequestQueue, openRequestQueue } from './storages/request_queue';
import { getMemoryInfo, isAtHome, publicUtils } from './utils';
import { puppeteerUtils } from './puppeteer_utils';
import { playwrightUtils } from './playwright_utils';
import { socialUtils } from './utils_social';
import { enqueueLinks } from './enqueue_links/enqueue_links';
import { PseudoUrl } from './pseudo_url';
import { requestAsBrowser } from './utils_request';
import { openSessionPool } from './session_pool/session_pool';
import { Session } from './session_pool/session';

const exportedUtils = Object.assign(publicUtils, {
    puppeteer: puppeteerUtils,
    playwright: playwrightUtils,
    social: socialUtils,
    log,
    enqueueLinks,
    requestAsBrowser,
});

export {
    Configuration,
    getMemoryInfo,
    isAtHome,
    // newClient,

    AutoscaledPool,

    BasicCrawler,
    CheerioCrawler,

    pushData,
    openDataset,
    Dataset,

    events,
    initializeEvents,
    stopEvents,

    getValue,
    setValue,
    getInput,
    openKeyValueStore,
    KeyValueStore,

    launchPuppeteer,
    launchPlaywright,
    BrowserCrawler,
    PuppeteerCrawler,
    PlaywrightCrawler,

    PseudoUrl,

    Request,
    RequestList,
    RequestQueue,
    openRequestList,
    openRequestQueue,

    openSessionPool,

    createProxyConfiguration,

    Session,

    exportedUtils as utils,
};
