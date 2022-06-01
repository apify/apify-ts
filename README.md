# Crawlee: The scalable web crawling and scraping library for JavaScript

<!-- Mirror this part to src/index.js -->

[![NPM dev version](https://img.shields.io/npm/v/@crawlee/core/next.svg)](https://www.npmjs.com/package/@crawlee/core)
[![Downloads](https://img.shields.io/npm/dm/@crawlee/core.svg)](https://www.npmjs.com/package/@crawlee/core)
[![Chat on discord](https://img.shields.io/discord/801163717915574323?label=discord)](https://discord.gg/jyEM2PRvMU)
[![Build Status](https://github.com/apify/apify-ts/actions/workflows/test-and-release.yml/badge.svg?branch=master)](https://github.com/apify/apify-ts/actions/workflows/test-and-release.yml)

Crawlee simplifies the development of web crawlers, scrapers, data extractors and web automation jobs.
It provides tools to manage and automatically scale a pool of headless browsers,
to maintain queues of URLs to crawl, store crawling results to a local filesystem or into the cloud,
rotate proxies and much more.
The SDK is available as the [`crawlee`](https://www.npmjs.com/package/crawlee) NPM package.
It can be used either stand-alone in your own applications
or in [actors](https://docs.apify.com/actor)
running on the [Apify Cloud](https://apify.com/).

**View full documentation, guides and examples on the [Crawlee project website](https://apify.github.io/apify-ts/)**

> Would you like to work with us on Crawlee or similar projects? [We are hiring!](https://apify.com/jobs#senior-node.js-engineer)

## Motivation

Thanks to tools like [Playwright](https://github.com/microsoft/playwright), [Puppeteer](https://github.com/puppeteer/puppeteer) or
[Cheerio](https://www.npmjs.com/package/cheerio), it is easy to write Node.js code to extract data from web pages. But
eventually things will get complicated. For example, when you try to:

- Perform a deep crawl of an entire website using a persistent queue of URLs.
- Run your scraping code on a list of 100k URLs in a CSV file, without losing any data when your code crashes.
- Rotate proxies to hide your browser origin and keep user-like sessions.
- Disable browser fingerprinting protections used by websites.

Python has [Scrapy](https://scrapy.org/) for these tasks, but there was no such library for **JavaScript, the language of
the web**. The use of JavaScript is natural, since the same language is used to write the scripts as well as the data extraction code running in a
browser.

The goal of Crawlee is to fill this gap and provide a toolbox for generic web scraping, crawling and automation tasks in JavaScript. So don't
reinvent the wheel every time you need data from the web, and focus on writing code specific to the target website, rather than developing
commonalities.

## Overview

Crawlee is available as the [`crawlee`](https://www.npmjs.com/package/crawlee) NPM package and is also available via `@crawlee/*` packages. It provides the following tools:

[//]: # (TODO add links to the docs about `@crawlee/` packages and the `crawlee` metapackage)

- [`CheerioCrawler`](https://apify.github.io/apify-ts/api/cheerio-crawler/class/CheerioCrawler) - Enables the parallel crawling of a large
  number of web pages using the [cheerio](https://www.npmjs.com/package/cheerio) HTML parser. This is the most
  efficient web crawler, but it does not work on websites that require JavaScript.

- [`PuppeteerCrawler`](https://apify.github.io/apify-ts/api/puppeteer-crawler/class/PuppeteerCrawler) - Enables the parallel crawling of
  a large number of web pages using the headless Chrome browser and [Puppeteer](https://github.com/puppeteer/puppeteer).
  The pool of Chrome browsers is automatically scaled up and down based on available system resources.

- [`PlaywrightCrawler`](https://apify.github.io/apify-ts/api/playwright-crawler/class/PlaywrightCrawler) - Unlike `PuppeteerCrawler`
  you can use [Playwright](https://github.com/microsoft/playwright) to manage almost any headless browser.
  It also provides a cleaner and more mature interface while keeping the ease of use and advanced features.

- [`BasicCrawler`](https://apify.github.io/apify-ts/api/basic-crawler/class/BasicCrawler) - Provides a simple framework for the parallel
  crawling of web pages whose URLs are fed either from a static list or from a dynamic queue of URLs. This class
  serves as a base for the more specialized crawlers above.

- [`RequestList`](https://apify.github.io/apify-ts/api/core/class/RequestList) - Represents a list of URLs to crawl.
  The URLs can be passed in code or in a text file hosted on the web. The list persists its state so that crawling
  can resume when the Node.js process restarts.

- [`RequestQueue`](https://apify.github.io/apify-ts/api/core/class/RequestQueue) - Represents a queue of URLs to crawl,
  which is stored either on a local filesystem or in the [Apify Cloud](https://apify.com). The queue is used
  for deep crawling of websites, where you start with several URLs and then recursively follow links to other pages.
  The data structure supports both breadth-first and depth-first crawling orders.

- [`Dataset`](https://apify.github.io/apify-ts/api/core/class/Dataset) - Provides a store for structured data and enables their export
  to formats like JSON, JSONL, CSV, XML, Excel or HTML. The data is stored on a local filesystem or in the Apify Cloud.
  Datasets are useful for storing and sharing large tabular crawling results, such as a list of products or real estate offers.

- [`KeyValueStore`](https://apify.github.io/apify-ts/api/core/class/KeyValueStore) - A simple key-value store for arbitrary data
  records or files, along with their MIME content type. It is ideal for saving screenshots of web pages, PDFs
  or to persist the state of your crawlers. The data is stored on a local filesystem or in the Apify Cloud.

- [`AutoscaledPool`](https://apify.github.io/apify-ts/api/core/class/AutoscaledPool) - Runs asynchronous background tasks,
  while automatically adjusting the concurrency based on free system memory and CPU usage. This is useful for running
  web scraping tasks at the maximum capacity of the system.

Additionally, the package provides various helper functions to simplify running your code on the Apify Cloud and thus
take advantage of its pool of proxies, job scheduler, data storage, etc.
For more information, see the [Crawlee Programmer's Reference](https://apify.github.io/apify-ts/).

## Quick Start

This short tutorial will set you up to start using Crawlee in a minute or two.
If you want to learn more, proceed to the [Getting Started](https://apify.github.io/apify-ts/docs/guides/getting-started)
tutorial that will take you step by step through creating your first scraper.

### Local stand-alone usage

Crawlee requires [Node.js](https://nodejs.org/en/) 16 or later.
Add Crawlee to any Node.js project by running:

```bash
npm install @crawlee/playwright playwright
```

> Neither `playwright` nor `puppeteer` are bundled with the SDK to reduce install size and allow greater flexibility. That's why we install it with NPM. You can choose one, both, or neither.

Run the following example to perform a recursive crawl of a website using Playwright. For more examples showcasing various features of Crawlee,
[see the Examples section of the documentation](https://apify.github.io/apify-ts/docs/examples/crawl-multiple-urls).

```javascript
import { PlaywrightCrawler } from '@crawlee/playwright';

const crawler = new PlaywrightCrawler({
    async requestHandler({ request, page, enqueueLinks }) {
        // Extract HTML title of the page.
        const title = await page.title();
        console.log(`Title of ${request.url}: ${title}`);

        // Add URLs from the same subdomain.
        await enqueueLinks();
    },
});

// Choose the first URL to open and run the crawler.
await crawler.addRequests(['https://www.iana.org/']);
await crawler.run();
```

When you run the example, you should see Crawlee automating a Chrome browser.

![Chrome Scrape](https://apify.github.io/apify-ts/img/chrome_scrape.gif)

By default, Crawlee stores data to `./memory_storage` in the current working directory. You can override this directory via `CRAWLEE_STORAGE_DIR` env var. For details, see [Environment variables](https://apify.github.io/apify-ts/docs/guides/environment-variables), [Request storage](https://apify.github.io/apify-ts/docs/guides/request-storage) and [Result storage](https://apify.github.io/apify-ts/docs/guides/result-storage).

### Local usage with Apify command-line interface (CLI)

To avoid the need to set the environment variables manually, to create a boilerplate of your project, and to enable pushing and running your code on
the [Apify platform](https://apify.github.io/apify-ts/docs/guides/apify-platform), you can use the [Apify command-line interface (CLI)](https://github.com/apify/apify-cli) tool.

Install the CLI by running:

```bash
npm -g install apify-cli
```

Now create a boilerplate of your new web crawling project by running:

```bash
apify create my-hello-world
```

The CLI will prompt you to select a project boilerplate template - just pick "Hello world". The tool will create a directory called `my-hello-world`
with a Node.js project files. You can run the project as follows:

```bash
cd my-hello-world
apify run
```

By default, the crawling data will be stored in a local directory at `./apify_storage`. For example, the input JSON file for the actor is expected to
be in the default key-value store in `./apify_storage/key_value_stores/default/INPUT.json`.

Now you can easily deploy your code to the Apify platform by running:

```bash
apify login
```

```bash
apify push
```

Your script will be uploaded to the Apify platform and built there so that it can be run. For more information, view the
[Apify Actor](https://docs.apify.com/cli) documentation.

### Usage on the Apify platform

You can also develop your web scraping project in an online code editor directly on the [Apify platform](https://apify.github.io/apify-ts/docs/guides/apify-platform).
You'll need to have an Apify Account. Go to [Actors](https://console.apify.com/actors), page in the Apify Console, click <i>Create new</i>
and then go to the <i>Source</i> tab and start writing your code or paste one of the examples from the Examples section.

For more information, view the [Apify actors quick start guide](https://docs.apify.com/actor/quick-start).

## Support

If you find any bug or issue with Crawlee, please [submit an issue on GitHub](https://github.com/apify/apify-js/issues).
For questions, you can ask on [Stack Overflow](https://stackoverflow.com/questions/tagged/apify) or contact support@apify.com

## Contributing

Your code contributions are welcome and you'll be praised to eternity!
If you have any ideas for improvements, either submit an issue or create a pull request.
For contribution guidelines and the code of conduct,
see [CONTRIBUTING.md](https://github.com/apify/apify-js/blob/master/CONTRIBUTING.md).

## License

This project is licensed under the Apache License 2.0 -
see the [LICENSE.md](https://github.com/apify/apify-js/blob/master/LICENSE.md) file for details.

## Acknowledgments

Many thanks to [Chema Balsas](https://www.npmjs.com/~jbalsas) for giving up the `apify` package name
on NPM and renaming his project to [jsdocify](https://www.npmjs.com/package/jsdocify).
