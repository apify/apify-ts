import { URL } from 'url';
import { PseudoUrl } from '@apify/pseudo_url';
import { Request, RequestOptions } from '../request';
import { QueueOperationInfo, RequestQueue } from '../storages/request_queue';

const MAX_ENQUEUE_LINKS_CACHE_SIZE = 1000;

/**
 * To enable direct use of the Actor UI `pseudoUrls` output while keeping high performance,
 * all the pseudoUrls from the output are only constructed once and kept in a cache
 * by the `enqueueLinks()` function.
 * @ignore
 */
const enqueueLinksPseudoUrlCache = new Map();

export type PseudoUrlObject = { purl: string };

export type PseudoUrlInput = string | PseudoUrl | PseudoUrlObject;

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function.
 * @ignore
 */
export function constructRegExps(pseudoUrls: PseudoUrlInput[]): RegExp[] {
    return pseudoUrls.map((item) => {
        // Get pseudoUrl instance from cache.
        let pUrl = enqueueLinksPseudoUrlCache.get(item);
        if (pUrl) return pUrl;

        // Nothing in cache, make a new instance.
        if (item instanceof PseudoUrl) { // If it's already a PseudoURL, just save it.
            pUrl = item;
        } else if (typeof item === 'string') { // If it's a string or RegExp, construct a PURL from it directly.
            pUrl = new PseudoUrl(item);
        } else { // If it's an object, look for a purl property and use it to construct a PURL with a Request template.
            const { purl } = item;
            pUrl = new PseudoUrl(purl);
        }
        // TODO check the cache (since only regex is returned now)
        // Manage cache
        enqueueLinksPseudoUrlCache.set(item, pUrl);
        if (enqueueLinksPseudoUrlCache.size > MAX_ENQUEUE_LINKS_CACHE_SIZE) {
            const key = enqueueLinksPseudoUrlCache.keys().next().value;
            enqueueLinksPseudoUrlCache.delete(key);
        }
        return pUrl.regex;
    });
}

/**
 * @ignore
 */
export function createRequests(requestOptions: (string | RequestOptions)[], regexps?: RegExp[]): Request[] {
    if (!regexps || !regexps.length) {
        return requestOptions
            .map((opts) => new Request(typeof opts === 'string' ? { url: opts } : opts));
    }

    const requests: Request[] = [];
    for (const regexp of regexps) {
        for (const opts of requestOptions) {
            if ((typeof opts === 'string' ? opts : opts.url).match(regexp)) {
                requests.push(new Request(typeof opts === 'string' ? { url: opts } : opts));
            }
        }
    }
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
        })
        .map((requestOptions) => new Request(requestOptions) as RequestOptions);
}

/**
 * @ignore
 */
export async function addRequestsToQueueInBatches(requests: Request[], requestQueue: RequestQueue, batchSize = 5): Promise<QueueOperationInfo[]> {
    const queueOperationInfos: Promise<QueueOperationInfo>[] = [];
    for (const request of requests) {
        queueOperationInfos.push(requestQueue.addRequest(request));
        if (queueOperationInfos.length % batchSize === 0) await Promise.all(queueOperationInfos);
    }
    return Promise.all(queueOperationInfos);
}

/**
 * Takes an Apify {@link RequestOptions} object and changes its attributes in a desired way. This user-function is used
 * {@link utils.enqueueLinks} to modify requests before enqueuing them.
 */
export interface RequestTransform {
    /**
     * @param original Request options to be modified.
     * @returns The modified request options to enqueue.
     */
    (original: RequestOptions): RequestOptions;
}
