import { URL } from 'url';
import { PseudoUrl, PseudoUrlObject } from '../pseudo_url';
import { Request, RequestOptions } from '../request';

const MAX_ENQUEUE_LINKS_CACHE_SIZE = 1000;

/**
 * To enable direct use of the Actor UI `pseudoUrls` output while keeping high performance,
 * all the pseudoUrls from the output are only constructed once and kept in a cache
 * by the `enqueueLinks()` function.
 * @ignore
 */
const enqueueLinksPseudoUrlCache = new Map();

export type PseudoUrlInput = string | RegExp | PseudoUrl | PseudoUrlObject;

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function.
 * @ignore
 */
export function constructPseudoUrlInstances(pseudoUrls: PseudoUrlInput[]): PseudoUrl[] {
    return pseudoUrls.map((item) => {
        // Get pseudoUrl instance from cache.
        let pUrl = enqueueLinksPseudoUrlCache.get(item);
        if (pUrl) return pUrl;

        // Nothing in cache, make a new instance.
        // If it's already a PseudoURL, just save it.
        if (item instanceof PseudoUrl) {
            pUrl = item;
        } else if (typeof item === 'string' || item instanceof RegExp) { // If it's a string or RegExp, construct a PURL from it directly.
            pUrl = new PseudoUrl(item);
        } else { // If it's an object, look for a purl property and use it and the rest to construct a PURL with a Request template.
            const { purl, ...opts } = item;
            pUrl = new PseudoUrl(purl, opts);
        }

        // Manage cache
        enqueueLinksPseudoUrlCache.set(item, pUrl);
        if (enqueueLinksPseudoUrlCache.size > MAX_ENQUEUE_LINKS_CACHE_SIZE) {
            const key = enqueueLinksPseudoUrlCache.keys().next().value;
            enqueueLinksPseudoUrlCache.delete(key);
        }
        return pUrl;
    });
}

/**
 * @ignore
 */
export function createRequests(requestOptions: (string | RequestOptions)[], pseudoUrls?: PseudoUrl[]): Request[] {
    if (!pseudoUrls || !pseudoUrls.length) {
        return requestOptions.map((opts) => new Request(typeof opts === 'string' ? { url: opts } : opts));
    }

    const requests: Request[] = [];
    requestOptions.forEach((opts) => {
        pseudoUrls
            .filter((purl) => purl.matches(typeof opts === 'string' ? opts : opts.url))
            .forEach((purl) => {
                const request = purl.createRequest(opts);
                requests.push(request);
            });
    });

    return requests;
}

/**
 * @ignore
 */
export function createRequestOptions(sources: (string | Record<string, unknown>)[]): RequestOptions[] {
    return sources
        .map((src) => (typeof src === 'string' ? { url: src } : src as unknown as RequestOptions))
        .filter(({ url }) => {
            try {
                return new URL(url).href;
            } catch (err) {
                return false;
            }
        });
}

/**
 * Takes an Apify {@link RequestOptions} object and changes it's attributes in a desired way. This user-function is used
 * {@link enqueueLinks} to modify requests before enqueuing them.
 */
export interface RequestTransform {
    /**
     * @param original Request options to be modified.
     * @returns The modified request options to enqueue.
     */
    (original: RequestOptions): RequestOptions;
}
