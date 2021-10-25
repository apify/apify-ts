const { parse } = require('url');

const visit = import('unist-util-visit').then((m) => m.visit);

const internalUrls = ['sdk.apify.com'];

/**
 * @param {import('url').UrlWithStringQuery} href
 */
function isInternal(href) {
    return internalUrls.some(
        (internalUrl) => href.host === internalUrl
            || (!href.protocol && !href.host && (href.pathname || href.hash)),
    );
}

// TODO ideally we should use this, but it breaks the HP somehow
//   will need to debug from inside the plugin and maybe inline
//   it to ease debugging and PR things later when they work as intended
//   things to fix: @links and code blocks

/**
 * @type {import('unified').Plugin}
 */
exports.externalLinkProcessor = () => {
    return async (tree) => {
        (await visit)(tree, 'element', (node) => {
            if (
                node.tagName === 'a'
                && node.properties
                && typeof node.properties.href === 'string'
            ) {
                const href = parse(node.properties.href);

                if (!isInternal(href)) {
                    node.properties.target = '_blank';
                    node.properties.rel = 'noopener';
                } else {
                    node.properties.target = null;
                    node.properties.rel = null;
                }
            }
        });
    };
};
