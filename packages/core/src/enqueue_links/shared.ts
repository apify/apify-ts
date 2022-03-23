import { URL } from 'url';
import { purlToRegExp } from '@apify/pseudo_url';
import { makeRe } from 'minimatch';
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

export type PseudoUrlInput = string | PseudoUrlObject;

export type GlobObject = { glob: string };

export type GlobInput = string | GlobObject;

export type RegExpObject = { regexp: RegExp };

export type RegExpInput = RegExp | RegExpObject;

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to construct RegExps from PseudoUrl strings.
 * @ignore
 */
export function constructRegExpsFromPseudoUrls(pseudoUrls: PseudoUrlInput[]): RegExp[] {
    return pseudoUrls.map((item) => {
        // Get pseudoUrl instance from cache.
        let regexp = enqueueLinksPseudoUrlCache.get(item);
        if (regexp) return regexp;

        if (typeof item === 'string') {
            regexp = purlToRegExp(item);
        } else {
            const { purl } = item;
            regexp = purlToRegExp(purl);
        }

        // Manage cache
        enqueueLinksPseudoUrlCache.set(item, regexp);
        if (enqueueLinksPseudoUrlCache.size > MAX_ENQUEUE_LINKS_CACHE_SIZE) {
            const key = enqueueLinksPseudoUrlCache.keys().next().value;
            enqueueLinksPseudoUrlCache.delete(key);
        }
        return regexp;
    });
}

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to construct RegExps from Glob pattern strings.
 * @ignore
 */
export function constructRegExpsFromGlobs(globs: GlobInput[]): RegExp[] {
    return globs.map((item) => {
        // Get pseudoUrl instance from cache.
        let regexp = enqueueLinksPseudoUrlCache.get(item);
        if (regexp) return regexp;

        if (typeof item === 'string') {
            regexp = globToRegExp(item);
        } else {
            const { glob } = item;
            regexp = globToRegExp(glob);
        }

        // Manage cache
        enqueueLinksPseudoUrlCache.set(item, regexp);
        if (enqueueLinksPseudoUrlCache.size > MAX_ENQUEUE_LINKS_CACHE_SIZE) {
            const key = enqueueLinksPseudoUrlCache.keys().next().value;
            enqueueLinksPseudoUrlCache.delete(key);
        }
        return regexp;
    });
}

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to check RegExps input and return valid RegExps.
 * @ignore
 */
export function processRegexps(regexps: RegExpInput[]): RegExp[] {
    return regexps.map((item) => {
        if (item instanceof RegExp) {
            return item;
        }
        const { regexp } = item;
        return regexp;
    });
}

/**
 * @ignore
 */
export function globToRegExp(glob: string): RegExp {
    const globTrimmed = glob.trim();
    if (globTrimmed.length === 0) throw new Error(`Cannot parse Glob pattern '${globTrimmed}': it must be an non-empty string`);

    let regex;
    try {
        regex = makeRe(glob.trim(), { nocase: true });
    } catch (err) {
        throw new Error(`Cannot parse Glob pattern '${globTrimmed}': ${err}`);
    }
    return regex;
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
 * {@link enqueueLinks} to modify requests before enqueuing them.
 */
export interface RequestTransform {
    /**
     * @param original Request options to be modified.
     * @returns The modified request options to enqueue.
     */
    (original: RequestOptions): RequestOptions;
}
