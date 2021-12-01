import ow, { ArgumentError } from 'ow';
import { URL } from 'url';
// FIXME this should not be here, or we need to deal with ignore comments as before
import { Page as PuppeteerPage } from 'puppeteer';
import { Page as PlaywrightPage } from 'playwright';
import log from '../utils_log';
import {
    constructPseudoUrlInstances,
    createRequests,
    addRequestsToQueueInBatches,
    createRequestOptions,
    RequestTransform,
    PseudoUrlInput,
} from './shared';
import { RequestQueue, QueueOperationInfo } from '../storages/request_queue';
import { PseudoUrl } from '../pseudo_url';
import { validators } from '../validators';
import { CheerioRoot } from '../crawlers/cheerio_crawler';

export interface EnqueueLinksOptions {
    /**
     * Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
     * Either `page` or `$` option must be provided.
     */
    page?: PuppeteerPage | PlaywrightPage;

    /** Limit the count of actually enqueued URLs to this number. Useful for testing across the entire crawling scope. */
    limit?: number;

    /**
     * [`Cheerio`](https://github.com/cheeriojs/cheerio) function with loaded HTML.
     * Either `page` or `$` option must be provided.
     */
    $?: CheerioRoot; // TODO support cheerio.Selector too

    /** A request queue to which the URLs will be enqueued. */
    requestQueue: RequestQueue;

    /** A CSS selector matching links to be enqueued. */
    selector?: string;

    /**
     * A base URL that will be used to resolve relative URLs when using Cheerio. Ignored when using Puppeteer,
     * since the relative URL resolution is done inside the browser automatically.
     */
    baseUrl?: string;

    /**
     * An array of {@link PseudoUrl}s matching the URLs to be enqueued,
     * or an array of strings or RegExps or plain Objects from which the {@link PseudoUrl}s can be constructed.
     *
     * The plain objects must include at least the `purl` property, which holds the pseudo-URL string or RegExp.
     * All remaining keys will be used as the `requestTemplate` argument of the {@link PseudoUrl} constructor,
     * which lets you specify special properties for the enqueued {@link Request} objects.
     *
     * If `pseudoUrls` is an empty array, `null` or `undefined`, then the function
     * enqueues all links found on the page.
     */
    pseudoUrls?: Record<string, unknown>[] | PseudoUrl[] | RegExp[] | string[] | null;

    /**
     * Just before a new {@link Request} is constructed and enqueued to the {@link RequestQueue}, this function can be used
     * to remove it or modify its contents such as `userData`, `payload` or, most importantly `uniqueKey`. This is useful
     * when you need to enqueue multiple `Requests` to the queue that share the same URL, but differ in methods or payloads,
     * or to dynamically update or create `userData`.
     *
     * For example: by adding `keepUrlFragment: true` to the `request` object, URL fragments will not be removed
     * when `uniqueKey` is computed.
     *
     * **Example:**
     * ```javascript
     * {
     *     transformRequestFunction: (request) => {
     *         request.userData.foo = 'bar';
     *         request.keepUrlFragment = true;
     *         return request;
     *     }
     * }
     * ```
     */
    transformRequestFunction?: RequestTransform;
}

/**
 * The function finds elements matching a specific CSS selector (HTML anchor (`<a>`) by default)
 * either in a Puppeteer page, or in a Cheerio object (parsed HTML),
 * and enqueues the URLs in their `href` attributes to the provided {@link RequestQueue}.
 * If you're looking to find URLs in JavaScript heavy pages where links are not available
 * in `href` elements, but rather navigations are triggered in click handlers
 * see {@link utils.puppeteer.enqueueLinksByClickingElements}.
 *
 * Optionally, the function allows you to filter the target links' URLs using an array of {@link PseudoUrl} objects
 * and override settings of the enqueued {@link Request} objects.
 *
 * **Example usage**
 *
 * ```javascript
 * await Apify.utils.enqueueLinks({
 *   page,
 *   requestQueue,
 *   selector: 'a.product-detail',
 *   pseudoUrls: [
 *       'https://www.example.com/handbags/[.*]',
 *       'https://www.example.com/purses/[.*]'
 *   ],
 * });
 * ```
 *
 * @param {object} options
 *   All `enqueueLinks()` parameters are passed via an options object.
 * @returns
 *   Promise that resolves to an array of {@link QueueOperationInfo} objects.
 */
export async function enqueueLinks(options: EnqueueLinksOptions): Promise<QueueOperationInfo[]> {
    const {
        page,
        $,
        requestQueue,
        limit,
        selector = 'a',
        baseUrl,
        pseudoUrls,
        transformRequestFunction,
    } = options;

    if (!page && !$) {
        throw new ArgumentError('One of the parameters "options.page" or "options.$" must be provided!', enqueueLinks);
    }
    if (page && $) {
        throw new ArgumentError('Only one of the parameters "options.page" or "options.$" must be provided!', enqueueLinks);
    }
    ow(options, ow.object.exactShape({
        page: ow.optional.object.hasKeys('goto', 'evaluate'),
        $: ow.optional.function,
        requestQueue: ow.object.hasKeys('fetchNextRequest', 'addRequest'),
        limit: ow.optional.number,
        selector: ow.optional.string,
        baseUrl: ow.optional.string,
        pseudoUrls: ow.any(ow.null, ow.optional.array.ofType(ow.any(
            ow.string,
            ow.regExp,
            ow.object.hasKeys('purl'),
            ow.object.validate(validators.pseudoUrl),
        ))),
        transformRequestFunction: ow.optional.function,
    }));

    if (baseUrl && page) log.warning('The parameter options.baseUrl can only be used when parsing a Cheerio object. It will be ignored.');

    // Construct pseudoUrls from input where necessary.
    const pseudoUrlInstances = constructPseudoUrlInstances(pseudoUrls as PseudoUrlInput[] || []);

    const urls = page ? await extractUrlsFromPage(page, selector) : extractUrlsFromCheerio($!, selector, baseUrl);
    let requestOptions = createRequestOptions(urls);
    if (transformRequestFunction) {
        // @ts-ignore `url` is missing in the dictionary?
        requestOptions = requestOptions.map(transformRequestFunction).filter((r) => !!r);
    }
    let requests = createRequests(requestOptions, pseudoUrlInstances);
    if (limit) requests = requests.slice(0, limit);

    return addRequestsToQueueInBatches(requests, requestQueue);
}

/**
 * Extracts URLs from a given Puppeteer Page.
 * @ignore
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export async function extractUrlsFromPage(page: { $$eval: Function }, selector: string): Promise<string[]> {
    /* istanbul ignore next */
    return page.$$eval(selector, (linkEls) => linkEls.map((link) => link.href).filter((href) => !!href));
}

/**
 * Extracts URLs from a given Cheerio object.
 * @todo how to support cheerio.Selector?
 * @ignore
 */
export function extractUrlsFromCheerio($: CheerioRoot, selector: string, baseUrl?: string): string[] {
    return $(selector)
        .map((_i, el) => $(el).attr('href'))
        .get()
        .filter((href) => !!href)
        .map((href) => {
            // Throw a meaningful error when only a relative URL would be extracted instead of waiting for the Request to fail later.
            const isHrefAbsolute = /^[a-z][a-z0-9+.-]*:/.test(href); // Grabbed this in 'is-absolute-url' package.
            if (!isHrefAbsolute && !baseUrl) {
                throw new Error(`An extracted URL: ${href} is relative and options.baseUrl is not set. `
                    + 'Use options.baseUrl in utils.enqueueLinks() to automatically resolve relative URLs.');
            }
            return baseUrl
                ? (new URL(href, baseUrl)).href
                : href;
        });
}
