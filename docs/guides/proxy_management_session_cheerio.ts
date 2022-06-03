import { CheerioCrawler, ProxyConfiguration } from '@crawlee/cheerio';

const proxyConfiguration = new ProxyConfiguration({ /* opts */ });
const crawler = new CheerioCrawler({
    useSessionPool: true,
    persistCookiesPerSession: true,
    proxyConfiguration,
    // ...
});
