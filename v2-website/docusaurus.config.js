const { createHref } = require('./tools/utils/createHref');
const { externalLinkProcessor } = require('./tools/utils/externalLink');

/** @type {Partial<import('@docusaurus/types').DocusaurusConfig>} */
module.exports = {
    title: 'Apify SDK',
    tagline: 'The scalable web crawling, scraping and automation library for JavaScript/Node.js.',
    url: 'https://apify.github.io',
    baseUrl: '/apify-ts/',
    organizationName: 'apify',
    projectName: 'apify-ts',
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
        repoUrl: 'https://github.com/apify/apify-ts',
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
                theme: {
                    customCss: '../src/css/customTheme.css',
                },
            }),
        ],
    ]),
    plugins: [
        [
            'docusaurus-plugin-typedoc',
            {
                entryPoints: ['../src/exports.ts'],
                tsconfig: '../tsconfig.json',
                docsRoot: '../docs',
                out: 'api-apify',
                // sort: ['source-order'],
                readme: 'none',
                excludeExternals: true,
                excludePrivate: true,
                excludeProtected: true,
                excludeInternal: true,
                defaultCategory: 'Apify',
                categoryOrder: ['Apify', '*', 'Interfaces'],
                externalPattern: '**/node_modules/*',
                cleanOutputDir: true,
            },
        ],
    ],
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
                    type: 'docsVersionDropdown',
                    position: 'left',
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
            theme: require('prism-react-renderer/themes/duotoneLight'),
            darkTheme: require('prism-react-renderer/themes/vsDark'),
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
        gaGtag: {
            trackingID: 'UA-67003981-4',
        },
        hideableSidebar: true,
    }),
};
