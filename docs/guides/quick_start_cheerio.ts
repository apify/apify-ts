import { CheerioCrawler, Dataset } from "@crawlee/cheerio";

const crawler = new CheerioCrawler({
    async requestHandler({ request, $, enqueueLinks }) {
        const { url } = request;

        // Extract HTML title of the page.
        const title = $('title').text();
        console.log(`Title of ${url}: ${title}`);

        // Add URLs that match the provided pattern.
        await enqueueLinks({
            globs: ['https://www.iana.org/*'],
        });

        // Save extracted data to dataset.
        await Dataset.pushData({ url, title });
    },
});

// Choose the first URL to open.
await crawler.addRequests([{ url: 'https://www.iana.org/' }]);

// Start the crawler.
await crawler.run();
