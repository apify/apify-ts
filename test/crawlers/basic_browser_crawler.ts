import { BrowserCrawler, BrowserCrawlerOptions } from 'apify';

export class BrowserCrawlerTest<T> extends BrowserCrawler<T> {
    public constructor(options: BrowserCrawlerOptions) {
        super(options);
    }
}
