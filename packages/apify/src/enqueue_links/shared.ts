import { URL } from 'url';
import _ from 'underscore';
import { PseudoUrl } from '../pseudo_url';
import { Request, RequestOptions } from '../request';
import { RequestQueue, QueueOperationInfo } from '../storages/request_queue';

const MAX_ENQUEUE_LINKS_CACHE_SIZE = 1000;

/**
 * To enable direct use of the Actor UI `pseudoUrls` output while keeping high performance,
 * all the pseudoUrls from the output are only constructed once and kept in a cache
 * by the `enqueueLinks()` function.
 * @ignore
 */
const enqueueLinksPseudoUrlCache = new Map();

export type PseudoUrlInput = string | RegExp | PseudoUrl | { purl: string | RegExp };

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
        if (item instanceof PseudoUrl) pUrl = item;
        // If it's a string or RegExp, construct a PURL from it directly.
        else if (typeof item === 'string' || item instanceof RegExp) pUrl = new PseudoUrl(item);
        // If it's an object, look for a purl property and use it and the rest to construct a PURL with a Request template.
        else pUrl = new PseudoUrl(item.purl, _.omit(item, 'purl'));

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
export function createRequests(requestOptions: (string | Record<string, unknown>)[], pseudoUrls: PseudoUrl[]): Request[] {
    if (!pseudoUrls || !pseudoUrls.length) {
        // TODO maybe the request options are wrong? or why we need type cast?
        return requestOptions.map((opts) => new Request(opts as unknown as RequestOptions));
    }

    const requests: Request[] = [];
    requestOptions.forEach((opts) => {
        pseudoUrls
            // @ts-ignore opts can be a string?
            .filter((purl) => purl.matches(opts.url))
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
export function createRequestOptions(sources: (string | Record<string, unknown>)[]): Record<string, unknown>[] {
    return sources
        .map((src) => {
            const reqOpts = typeof src === 'string'
                ? { url: src }
                : src as { url: string; userData?: Record<string, unknown> };
            // TODO Remove with v1, there are examples
            //   which depend on userData existing here.
            reqOpts.userData = { ...reqOpts.userData };
            return reqOpts;
        })
        .filter(({ url }) => {
            try {
                return new URL(url).href;
            } catch (err) {
                return false;
            }
        });
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
 * Takes an Apify {@link RequestOptions} object and changes it's attributes in a desired way. This user-function is used
 * {@link utils.enqueueLinks} to modify requests before enqueuing them.
 */
export interface RequestTransform {
    /**
     * @param original Request options to be modified.
     * @returns The modified request options to enqueue.
     */
    (original: RequestOptions): RequestOptions;
}
