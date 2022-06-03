import { CheerioCrawler, ProxyConfiguration } from '@crawlee/cheerio';

const proxyConfiguration = new ProxyConfiguration({ /* opts */ });
const crawler = new CheerioCrawler({
    proxyConfiguration,
    // ...
});
