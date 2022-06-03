import { PlaywrightCrawler, ProxyConfiguration } from '@crawlee/playwright';

const proxyConfiguration = new ProxyConfiguration({ /* opts */ });
const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    // ...
});
