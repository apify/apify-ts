const { createHref } = require('./tools/utils/createHref');
const { externalLinkProcessor } = require('./tools/utils/externalLink');
// const versions = require('./versions.json');

/** @type {Partial<import('@docusaurus/types').DocusaurusConfig>} */
module.exports = {
    title: 'Apify SDK',
    tagline: 'The scalable web crawling, scraping and automation library for JavaScript/Node.js',
    url: 'https://apify.github.io',
    baseUrl: '/apify-ts/',
    organizationName: 'apify',
    projectName: 'apify-ts',
    scripts: ['/apify-ts/js/custom.js'],
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
            'docusaurus-plugin-typedoc-api',
            {
                projectRoot: `${__dirname}/..`,
                packages: [
                    {
                        path: 'packages/apify',
                    },
                    {
                        path: 'packages/core',
                    },
                    {
                        path: 'packages/utils',
                    },
                    {
                        path: 'packages/storage',
                    },
                    // {
                    //     path: 'packages/crawlers',
                    // },
                    {
                        path: 'packages/basic-crawler',
                    },
                    {
                        path: 'packages/browser-crawler',
                    },
                    {
                        path: 'packages/cheerio-crawler',
                    },
                    {
                        path: 'packages/puppeteer-crawler',
                    },
                    {
                        path: 'packages/playwright-crawler',
                    },
                ],
                typedocOptions: {
                    excludeExternals: false,
                },
            },
        ],
    ],
    themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */ ({
        docs: {
            versionPersistence: 'localStorage',
        },
        navbar: {
            hideOnScroll: true,
            title: 'Apify',
            logo: {
                src: 'img/apify_sdk.svg',
                srcDark: 'img/apify_sdk_white.svg',
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
                    to: 'api',
                    label: 'API reference',
                    position: 'left',
                },
                {
                    href: 'https://github.com/apify/apify-js/blob/master/CHANGELOG.md',
                    label: 'Changelog',
                    position: 'left',
                    className: 'changelog',
                },
                {
                    type: 'docsVersionDropdown',
                    position: 'right',
                },
                {
                    href: 'https://github.com/apify/apify-js',
                    label: 'GitHub',
                    title: 'View on GitHub',
                    position: 'right',
                    className: 'icon',
                },
                {
                    href: 'https://discord.com/invite/jyEM2PRvMU',
                    label: 'Discord',
                    title: 'Chat on Discord',
                    position: 'right',
                    className: 'icon',
                },
            ],
        },
        colorMode: {
            defaultMode: 'light',
            disableSwitch: false,
            respectPrefersColorScheme: true,
            switchConfig: {
                darkIconStyle: {
                    backgroundImage: 'url(/apify-ts/img/switch-dark.svg)',
                    color: 'transparent',
                    width: 19,
                    height: 19,
                    margin: '-4.5px 0 0 -5px',
                },
                lightIconStyle: {
                    backgroundImage: 'url(/apify-ts/img/switch-light.svg)',
                    color: 'transparent',
                    width: 19,
                    height: 19,
                    margin: '-4.5px 0 0px -2px',
                },
            },
        },
        prism: {
            defaultLanguage: 'typescript',
            theme: require('prism-react-renderer/themes/github'),
            darkTheme: require('prism-react-renderer/themes/dracula'),
        },
        metadata: [],
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
                            label: 'API reference',
                            to: 'docs/api/apify',
                        },
                    ],
                },
                {
                    title: 'Community',
                    items: [
                        // { label: "User Showcase", to: "users" }
                        {
                            label: 'Discord',
                            href: 'https://discord.com/invite/jyEM2PRvMU',
                        },
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
                width: '60px',
                height: '60px',
            },
        },
        algolia: {
            appId: 'N8EOCSBQGH',
            apiKey: '03b4b90877515c89fcd2decba22634f3',
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
