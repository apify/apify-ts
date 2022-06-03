import { PuppeteerCrawler, ProxyConfiguration } from '@crawlee/puppeteer';

const proxyConfiguration = new ProxyConfiguration({ /* opts */ });
const crawler = new PuppeteerCrawler({
    useSessionPool: true,
    persistCookiesPerSession: true,
    proxyConfiguration,
    // ...
});
