import Apify, { BasicCrawler, utils } from 'apify';

export interface CrawlerSetup {
    name: string;
    createCrawler: () => Promise<BasicCrawler>;
}

export type CrawlerSetupConstructor = new (input: unknown) => CrawlerSetup;

export function runActor(CrawlerSetup: CrawlerSetupConstructor) {
    Apify.main(async () => {
        utils.log.debug('Reading INPUT.');
        const input = await Apify.getInput();
        if (!input) throw new Error('INPUT cannot be empty!');

        // Get crawler setup and startup options.
        const setup = new CrawlerSetup(input);
        utils.log.info(`Configuring ${setup.name}.`);
        const crawler = await setup.createCrawler();

        utils.log.info('Configuration completed. Starting the scrape.');
        await crawler.run();
        utils.log.info(`${setup.name} finished.`);
    });
}
