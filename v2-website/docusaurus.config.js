const { createHref } = require('./tools/utils/createHref');
const { externalLinkProcessor } = require('./tools/utils/externalLink');

/** @type {Partial<import('@docusaurus/types').DocusaurusConfig>} */
module.exports = {
    title: 'Apify SDK',
    tagline:
        'The scalable web crawling, scraping and automation library for JavaScript/Node.js.',
    url: 'https://sdk.apify.com',
    baseUrl: '/',
    organizationName: 'apify',
    projectName: 'apify-js',
    scripts: [],
    favicon: 'img/favicon.ico',
    customFields: {
        markdownOptions: {
            html: true,
        },
        gaGtag: true,
        deletedDocs: {
            '1.0.0': [
                'api/puppeteer-pool',
                'typedefs/puppeteer-pool-options',
                'typedefs/launch-puppeteer-function',
                'typedefs/launch-puppeteer-options',
                'typedefs/puppeteer-goto',
                'typedefs/puppeteer-goto-inputs',
            ],
        },
        repoUrl: 'https://github.com/apify/apify-js',
    },
    onBrokenLinks:
    /** @type {import('@docusaurus/types').ReportingSeverity} */ ('log'),
    onBrokenMarkdownLinks:
    /** @type {import('@docusaurus/types').ReportingSeverity} */ ('log'),
    presets: /** @type {import('@docusaurus/types').PresetConfig[]} */ ([
        [
            '@docusaurus/preset-classic',
            /** @type {import('@docusaurus/preset-classic').Options} */
            ({
                docs: {
                    showLastUpdateAuthor: true,
                    showLastUpdateTime: true,
                    path: '../docs',
                    sidebarPath: './sidebars.json',
                    rehypePlugins: [externalLinkProcessor],
                },
                blog: {
                    path: 'blog',
                },
                theme: {
                    customCss: '../src/css/customTheme.css',
                },
            }),
        ],
    ]),
    plugins: [],
    themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */ ({
        docs: {
            versionPersistence: 'localStorage',
        },
        navbar: {
            hideOnScroll: false,
            title: 'Apify SDK',
            logo: {
                src: 'img/apify_logo.svg',
            },
            items: [
                {
                    to: 'docs/',
                    label: 'Guide',
                    position: 'left',
                },
                {
                    to: 'docs/examples/crawl-multiple-urls',
                    label: 'Examples',
                    position: 'left',
                },
                {
                    to: 'docs/api/apify',
                    label: 'API Reference',
                    position: 'left',
                },
                {
                    href: 'https://github.com/apify/apify-js',
                    label: 'GitHub',
                    position: 'left',
                },
                {
                    label: 'Version',
                    to: 'docs',
                    position: 'right',
                    items: [
                        {
                            label: '2.0.6',
                            to: 'docs/',
                            activeBaseRegex:
                                    'docs/(?!0.22.4|1.0.0|1.0.1|1.0.2|1.1.0|1.1.2|1.2.0|1.3.1|2.0.1|2.0.6|next)',
                        },
                        {
                            label: '2.0.1',
                            to: 'docs/2.0.1/',
                        },
                        {
                            label: '1.3.1',
                            to: 'docs/1.3.1/',
                        },
                        {
                            label: '1.2.0',
                            to: 'docs/1.2.0/',
                        },
                        {
                            label: '1.1.2',
                            to: 'docs/1.1.2/',
                        },
                        {
                            label: '1.1.0',
                            to: 'docs/1.1.0/',
                        },
                        {
                            label: '1.0.2',
                            to: 'docs/1.0.2/',
                        },
                        {
                            label: '1.0.1',
                            to: 'docs/1.0.1/',
                        },
                        {
                            label: '1.0.0',
                            to: 'docs/1.0.0/',
                        },
                        {
                            label: '0.22.4',
                            to: 'docs/0.22.4/',
                        },
                        {
                            label: 'Main/Unreleased',
                            to: 'docs/next/',
                            activeBaseRegex:
                                    'docs/next/(?!support|team|resources)',
                        },
                    ],
                },
            ],
        },
        colorMode: {
            defaultMode: 'light',
            disableSwitch: false,
            respectPrefersColorScheme: true,
        },
        prism: {
            defaultLanguage: 'javascript',
        },
        metadatas: [],
        image: 'img/apify_og_SDK.png',
        footer: {
            links: [
                {
                    title: 'Docs',
                    items: [
                        {
                            label: 'Guide',
                            to: 'docs/',
                        },
                        {
                            label: 'Examples',
                            to: 'docs/examples/crawl-multiple-urls',
                        },
                        {
                            label: 'API Reference',
                            to: 'docs/api/apify',
                        },
                    ],
                },
                {
                    title: 'Community',
                    items: [
                        // { label: "User Showcase", to: "users" }
                        {
                            label: 'Stack Overflow',
                            href: 'https://stackoverflow.com/questions/tagged/apify',
                        },
                        {
                            label: 'Twitter',
                            href: 'https://twitter.com/apify',
                        },
                        {
                            label: 'Facebook',
                            href: 'https://www.facebook.com/apifytech',
                        },
                    ],
                },
                {
                    title: 'More',
                    items: [
                        {
                            html: createHref(
                                'https://apify.com',
                                'Apify Cloud',
                            ),
                        },
                        {
                            html: createHref(
                                'https://docusaurus.io',
                                'Docusaurus',
                            ),
                        },
                        {
                            html: createHref(
                                'https://github.com/apify/apify-js',
                                'GitHub',
                            ),
                        },
                    ],
                },
            ],
            copyright: `Copyright © ${new Date().getFullYear()} Apify Technologies s.r.o.`,
            logo: {
                src: 'img/apify_logo.svg',
                href: '/',
            },
        },
        algolia: {
            apiKey: '64ce2544769e34add0e6402688c86e92',
            indexName: 'apify_sdk',
            algoliaOptions: {
                facetFilters: ['version:VERSION'],
            },
        },
        googleAnalytics: {
            trackingID: 'UA-67003981-4',
        },
        gaGtag: {
            trackingID: 'UA-67003981-4',
        },
        hideableSidebar: true,
    }),
};
