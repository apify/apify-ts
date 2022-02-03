import { type BasicCrawler } from '@crawlers/basic';
import { Actor, logUtils } from 'apify';

export interface CrawlerSetup {
    name: string;
    createCrawler: () => Promise<BasicCrawler>;
}

export type CrawlerSetupConstructor = new (input: any) => CrawlerSetup;

export function runActor(CrawlerSetup: CrawlerSetupConstructor) {
    Actor.main(async () => {
        logUtils.debug('Reading INPUT.');
        const input = await Actor.getInput();
        if (!input) throw new Error('INPUT cannot be empty!');

        // Get crawler setup and startup options.
        const setup = new CrawlerSetup(input);
        logUtils.info(`Configuring ${setup.name}.`);
        const crawler = await setup.createCrawler();

        logUtils.info('Configuration completed. Starting the scrape.');
        await crawler.run();
        logUtils.info(`${setup.name} finished.`);
    });
}
