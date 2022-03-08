import { getDomain } from 'tldts';
import ow from 'ow';
import {
    constructPseudoUrlInstances,
    createRequests,
    addRequestsToQueueInBatches,
    createRequestOptions,
    RequestTransform,
    PseudoUrlInput,
} from './shared';
import { RequestQueue, QueueOperationInfo } from '../storages/request_queue';
import { validators } from '../validators';

export interface EnqueueLinksOptions {
    /** Limit the count of actually enqueued URLs to this number. Useful for testing across the entire crawling scope. */
    limit?: number;

    /** An array of URLs to enqueue. */
    urls: string[];

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
    pseudoUrls?: PseudoUrlInput[] | null;

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

    /**
     * The strategy to use when enqueueing the urls.
     * @default EnqueueStrategy.SameDomain
     */
    strategy?: EnqueueStrategy | 'all' | 'same-domain-and-subdomain' | 'same-hostname';
}

export enum EnqueueStrategy {
    /**
     * Matches any URLs found
     */
    All = 'all',
    /**
     * Matches any URLs that have the same subdomain and hostname as the base URL
     */
    SameDomainAndSubdomain = 'same-domain-and-subdomain',
    /**
     * Matches any URLs that have the same hostname.
     * For example, `https://wow.an.example.com` and `https://example.com` will both be matched for a base url of
     * `https://example.com`.
     */
    SameHostname = 'same-hostname',
}

/**
 * The function finds elements matching a specific CSS selector (HTML anchor (`<a>`) by default)
 * either in a Puppeteer/Playwright page, or in a Cheerio object (parsed HTML),
 * and enqueues the URLs in their `href` attributes to the provided {@link RequestQueue}.
 * If you're looking to find URLs in JavaScript heavy pages where links are not available
 * in `href` elements, but rather navigations are triggered in click handlers
 * see {@link puppeteerUtils.enqueueLinksByClickingElements}.
 *
 * Optionally, the function allows you to filter the target links' URLs using an array of {@link PseudoUrl} objects
 * and override settings of the enqueued {@link Request} objects.
 *
 * **Example usage**
 *
 * ```javascript
 * await enqueueLinks({
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
 * @param options
 *   All `enqueueLinks()` parameters are passed via an options object.
 * @returns
 *   Promise that resolves to an array of {@link QueueOperationInfo} objects.
 */
export async function enqueueLinks(options: EnqueueLinksOptions): Promise<QueueOperationInfo[]> {
    const {
        requestQueue,
        limit,
        urls,
        pseudoUrls,
        transformRequestFunction,
    } = options;

    ow(options, ow.object.exactShape({
        urls: ow.array.ofType(ow.string),
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
        strategy: ow.optional.string.oneOf([
            EnqueueStrategy.All,
            EnqueueStrategy.SameDomainAndSubdomain,
            EnqueueStrategy.SameHostname,
        ]),
    }));

    const extraPseudoUrls = [];

    if (options.baseUrl) {
        switch (options.strategy ?? EnqueueStrategy.SameDomainAndSubdomain) {
            case EnqueueStrategy.SameDomainAndSubdomain:
                // We need to get the origin of the passed in domain in the event someone sets baseUrl
                // to a url like https://example.com/deep/default/path and one of the found urls is an
                // absolute relative path (/path/to/page)
                extraPseudoUrls.push(`${new URL(options.baseUrl).origin}/[.*]`);
                break;
            case EnqueueStrategy.SameHostname: {
                const url = new URL(options.baseUrl);

                // Get the actual hostname from the base url
                const baseUrlHostname = getDomain(url.hostname, { mixedInputs: false });

                if (baseUrlHostname) {
                    // We have a hostname, so we can use it to match all links on the page that point to it and any subdomains of it
                    url.hostname = baseUrlHostname;
                    extraPseudoUrls.push(
                        `${url.origin.replace(baseUrlHostname, `[.*].${baseUrlHostname}`)}/[.*]`,
                        `${url.origin}/[.*]`,
                    );
                } else {
                    // We don't have a hostname (can happen for ips for instance), so reproduce the same behavior
                    // as SameDomainAndSubdomain
                    extraPseudoUrls.push(`${url.origin}/[.*]`);
                }

                break;
            }
            case EnqueueStrategy.All:
            default:
                break;
        }
    }

    // Construct pseudoUrls from input where necessary.
    const pseudoUrlInstances = constructPseudoUrlInstances((pseudoUrls ?? []).concat(extraPseudoUrls));

    let requestOptions = createRequestOptions(urls);

    if (transformRequestFunction) {
        requestOptions = requestOptions.map((request) => transformRequestFunction(request)).filter((r) => !!r);
    }

    let requests = createRequests(requestOptions, pseudoUrlInstances);
    if (limit) requests = requests.slice(0, limit);

    return addRequestsToQueueInBatches(requests, requestQueue);
}
