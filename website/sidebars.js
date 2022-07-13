module.exports = {
    docs: [
        'quick-start/quick-start',
        {
            type: 'category',
            label: 'Introduction',
            collapsed: false,
            // link: {
            //     type: 'generated-index',
            //     title: 'Getting started',
            //     slug: '/getting-started',
            //     keywords: ['getting started'],
            // },
            link: {
                type: 'doc',
                id: 'introduction/index',
            },
            items: [
                'introduction/setting-up',
                'introduction/first-crawler',
                'introduction/cheerio-crawler',
                'introduction/enqueue-links',
                'introduction/realworld-example',
            ],
        },
        {
            type: 'category',
            label: 'Guides',
            link: {
                type: 'generated-index',
                title: 'Guides',
                slug: '/guides',
                keywords: ['guides'],
            },
            items: [
                'guides/motivation',
                'guides/request-storage',
                'guides/result-storage',
                'guides/environment-variables',
                'guides/proxy-management',
                'guides/session-management',
                'guides/scaling-crawlers',
                'guides/avoid-blocking',
                'guides/got-scraping',
                'guides/typescript-project',
                'guides/docker-images',
                'guides/apify-platform',
            ],
        },
        {
            type: 'category',
            label: 'Examples',
            link: {
                type: 'generated-index',
                title: 'Examples',
                slug: '/examples',
                keywords: ['examples'],
            },
            items: [
                {
                    type: 'autogenerated',
                    dirName: 'examples',
                },
            ],
        },
        {
            type: 'category',
            label: 'Upgrading',
            link: {
                type: 'generated-index',
                title: 'Upgrading',
                slug: '/upgrading',
                keywords: ['upgrading'],
            },
            items: [
                {
                    type: 'autogenerated',
                    dirName: 'upgrading',
                },
            ],
        },
    ],
};
