import React from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import CodeBlock from '@theme/CodeBlock';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import styles from './index.module.css';
import Hightlights from '../components/Highlights';

function Hero() {
    return (
        <header className={clsx('hero container', styles.heroBanner)}>
            <div className="container">
                <div className="row">
                    <div className="col col--7">
                        <div className="row">
                            <p className={styles.tagline}>
                                The scalable <span>web crawling</span>,<br />
                                <span>scraping</span> and <span>automation library</span><br />
                                for JavaScript/Node.js
                            </p>
                        </div>
                        <div className={styles.heroButtons}>
                            <Link to="#try" className={styles.getStarted}>Try it out</Link>
                            <Link to="docs/guides/getting-started" className={styles.seeExamples}>Get Started</Link>
                            <Link to="docs/examples/basic-crawler" className={styles.seeExamples}>See examples</Link>
                            <iframe src="https://ghbtns.com/github-btn.html?user=apify&repo=apify-ts&type=star&count=true&size=large" frameBorder="0" scrolling="0" width="170" height="30" title="GitHub"></iframe>
                        </div>
                    </div>
                    <div className="col col--5" style={{ textAlign: 'center' }}>
                        <img src={require('../../static/img/API.png').default} className={clsx(styles.hideSmall)} />
                    </div>
                </div>
            </div>
        </header>
    );
}

function Features() {
    return (
        <section className={clsx('container', styles.features)}>
            <div className="row">
                <div className="col col--6">
                    <img src={require('../../static/img/chrome_scrape.gif').default} className={clsx(styles.hideSmall)} />
                </div>
                <div className="col col--4">
                    <h2>Easy crawling</h2>
                    <p>
                        There are three main classes that you can use to start crawling the web in no time. Need to crawl plain HTML?
                        Use the blazing fast CheerioCrawler. For complex websites that use React, Vue or other front-end javascript libraries and require
                        JavaScript execution, spawn a headless browser with PlaywrightCrawler or PuppeteerCrawler.
                    </p>
                </div>
                <div className="col col--2"></div>
            </div>
            <div className="row">
                <div className="col col--4">
                    <h2>Powerful tools</h2>
                    <p>
                        All the crawlers are automatically scaled based on available system resources using the AutoscaledPool class.
                        When you run your code on the Apify Platform, you can also take advantage of a pool of proxies to avoid detection.
                        For data storage, you can use the Dataset, KeyValueStore and RequestQueue classes.
                    </p>
                </div>
                <div className="col col--2"></div>
                <div className="col col--6">
                    <img src={require('../../static/img/source_code.png').default} style={{ border: '1px solid white' }} className={clsx(styles.hideSmall)} />
                </div>
            </div>
        </section>
    );
}

const example = `import { PuppeteerCrawler } from '@crawlee/puppeteer';

const crawler = new PuppeteerCrawler({
    async requestHandler({ request, page, enqueueLinks }) {
        const title = await page.title();
        console.log(\`Title of $\{request.url}: $\{title}\`);
        await enqueueLinks();
    },
});

await crawler.addRequests(['https://www.iana.org/']);
await crawler.run();
`;

function ActorExample() {
    return (
        <section id="try" className="container">
            <h2>Try it out</h2>
            <p>Install the Crawlee SDK into a Node.js project. You must have Node.js 16 or higher installed.</p>
            <CodeBlock className="language-bash">
                npm install @crawlee/puppeteer puppeteer
            </CodeBlock>
            <p>Copy the following code into a file in the project, for example <code>main.mjs</code>:</p>
            <CodeBlock className="language-typescript">
                {example}
            </CodeBlock>
            <p>Execute the following command in the project's folder and watch it recursively crawl IANA with Puppeteer and Chromium.</p>
            <CodeBlock className="language-bash">
                node main.mjs
            </CodeBlock>
        </section>
    );
}

export default function Home() {
    const { siteConfig } = useDocusaurusContext();
    return (
        <Layout
            title={`${siteConfig.title} · ${siteConfig.tagline}`}
            description={siteConfig.description}>
            <Hero />
            <Hightlights />
            <Features />
            <ActorExample />
        </Layout>
    );
}
