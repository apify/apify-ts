import { URL } from 'url';
import { purlToRegExp } from '@apify/pseudo_url';
import { makeRe } from 'minimatch';
import { Request, RequestOptions } from '../request';
import { QueueOperationInfo, RequestQueue } from '../storages/request_queue';

const MAX_ENQUEUE_LINKS_CACHE_SIZE = 1000;

/**
 * To enable direct use of the Actor UI `globs`/`regexps`/`pseudoUrls` output while keeping high performance,
 * all the regexps from the output are only constructed once and kept in a cache
 * by the `enqueueLinks()` function.
 * @ignore
 */
const enqueueLinksRegexpCache = new Map();

export type PseudoUrlObject = { purl: string } & Pick<RequestOptions, 'method' | 'payload' | 'userData' | 'headers'>;

export type PseudoUrlInput = string | PseudoUrlObject;

export type GlobObject = { glob: string } & Pick<RequestOptions, 'method' | 'payload' | 'userData' | 'headers'>;

export type GlobInput = string | GlobObject;

export type RegExpObject = { regexp: RegExp } & Pick<RequestOptions, 'method' | 'payload' | 'userData' | 'headers'>;

export type RegExpInput = RegExp | RegExpObject;

/**
 * @ignore
 */
export function updateEnqueueLinksRegexpCache(item: GlobInput | RegExpInput | PseudoUrlInput, regexp: RegExp): void {
    enqueueLinksRegexpCache.set(item, regexp);
    if (enqueueLinksRegexpCache.size > MAX_ENQUEUE_LINKS_CACHE_SIZE) {
        const key = enqueueLinksRegexpCache.keys().next().value;
        enqueueLinksRegexpCache.delete(key);
    }
}

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to construct RegExps from PseudoUrl strings.
 * @ignore
 */
export function constructRegExpObjectsFromPseudoUrls(pseudoUrls: PseudoUrlInput[]): RegExpObject[] {
    return pseudoUrls.map((item) => {
        // Get pseudoUrl pattern from cache.
        let regexpObject = enqueueLinksRegexpCache.get(item);
        if (regexpObject) return regexpObject;

        if (typeof item === 'string') {
            regexpObject = { regexp: purlToRegExp(item) };
        } else {
            const { purl, ...requestOptions } = item;
            regexpObject = { regexp: purlToRegExp(purl), ...requestOptions };
        }

        updateEnqueueLinksRegexpCache(item, regexpObject);

        return regexpObject;
    });
}

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to construct RegExps from Glob pattern strings.
 * @ignore
 */
export function constructRegExpObjectsFromGlobs(globs: GlobInput[]): RegExpObject[] {
    return globs.map((item) => {
        // Get glob pattern from cache.
        let regexpObject = enqueueLinksRegexpCache.get(item);
        if (regexpObject) return regexpObject;

        if (typeof item === 'string') {
            regexpObject = { regexp: globToRegExp(item) };
        } else {
            const { glob, ...requestOptions } = item;
            regexpObject = { regexp: globToRegExp(glob), ...requestOptions };
        }

        updateEnqueueLinksRegexpCache(item, regexpObject);

        return regexpObject;
    });
}

/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to check RegExps input and return valid RegExps.
 * @ignore
 */
export function constructRegExpObjectsFromRegExps(regexps: RegExpInput[]): RegExpObject[] {
    return regexps.map((item) => {
        let regexpObject;

        if (item instanceof RegExp) {
            regexpObject = { regexp: item };
        } else {
            const { regexp, ...requestOptions } = item;
            regexpObject = { regexp, ...requestOptions };
        }

        return regexpObject;
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
export function createRequests(requestOptions: (string | RequestOptions)[], regExpObjects?: RegExpObject[]): Request[] {
    if (!regExpObjects || !regExpObjects.length) {
        return requestOptions
            .map((opts) => new Request(typeof opts === 'string' ? { url: opts } : opts));
    }

    const requests: Request[] = [];
    for (const regExpObject of regExpObjects) {
        for (const opts of requestOptions) {
            const { regexp, ...requestRegExpOptions } = regExpObject;
            if ((typeof opts === 'string' ? opts : opts.url).match(regexp)) {
                const request = typeof opts === 'string'
                    ? { url: opts, ...requestRegExpOptions }
                    : { ...opts, ...requestRegExpOptions };
                requests.push(request as Request);
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
