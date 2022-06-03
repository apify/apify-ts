import { PuppeteerCrawler, ProxyConfiguration } from '@crawlee/puppeteer';

const proxyConfiguration = new ProxyConfiguration({ /* opts */ });
const crawler = new PuppeteerCrawler({
    proxyConfiguration,
    // ...
});
