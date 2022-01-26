/**
 * A namespace that contains various utilities.
 *
 * **Example usage:**
 *
 * ```javascript
 * const Apify = require('apify');
 *
 * ...
 *
 * // Sleep 1.5 seconds
 * await Apify.utils.sleep(1500);
 * ```
 * @module utils
 */

// @ts-expect-error We need to add typings for @apify/ps-tree
import psTree from '@apify/ps-tree';
import { execSync } from 'child_process';
// @ts-expect-error if we enable resolveJsonModule, we end up with `src` folder in `dist`
import { version as apifyClientVersion } from 'apify-client/package.json';
import { ENV_VARS } from '@apify/consts';
import cheerio from 'cheerio';
import contentTypeParser from 'content-type';
import fs from 'fs';
import mime from 'mime-types';
import os from 'os';
import ow from 'ow';
import path from 'path';
import semver from 'semver';
import { URL } from 'url';
import util from 'util';
import rimraf from 'rimraf';
import { IncomingMessage } from 'http';
import { HTTPResponse as PuppeteerResponse } from 'puppeteer';

// @ts-expect-error if we enable resolveJsonModule, we end up with `src` folder in `dist`
import { version as apifyVersion } from '../package.json';
import log from './utils_log';
import { requestAsBrowser } from './utils_request';
import { Request } from './request';
import { Dictionary } from './typedefs';
import { CheerioRoot } from './crawlers/cheerio_crawler';

const rimrafp = util.promisify(rimraf);

/**
 * Default regular expression to match URLs in a string that may be plain text, JSON, CSV or other. It supports common URL characters
 * and does not support URLs containing commas or spaces. The URLs also may contain Unicode letters (not symbols).
 */
export const URL_NO_COMMAS_REGEX = RegExp('https?://(www\\.)?[\\p{L}0-9][-\\p{L}0-9@:%._\\+~#=]{0,254}[\\p{L}0-9]\\.[a-z]{2,63}(:\\d{1,5})?(/[-\\p{L}0-9@:%_\\+.~#?&//=\\(\\)]*)?', 'giu'); // eslint-disable-line

/**
 * Regular expression that, in addition to the default regular expression `URL_NO_COMMAS_REGEX`, supports matching commas in URL path and query.
 * Note, however, that this may prevent parsing URLs from comma delimited lists, or the URLs may become malformed.
 */
export const URL_WITH_COMMAS_REGEX = RegExp('https?://(www\\.)?[\\p{L}0-9][-\\p{L}0-9@:%._\\+~#=]{0,254}[\\p{L}0-9]\\.[a-z]{2,63}(:\\d{1,5})?(/[-\\p{L}0-9@:%_\\+,.~#?&//=\\(\\)]*)?', 'giu'); // eslint-disable-line

const MEMORY_FILE_PATHS = {
    TOTAL: {
        V1: '/sys/fs/cgroup/memory/memory.limit_in_bytes',
        V2: '/sys/fs/cgroup/memory.max',
    },
    USED: {
        V1: '/sys/fs/cgroup/memory/memory.usage_in_bytes',
        V2: '/sys/fs/cgroup/memory.current',
    },
};

// Set encoding to utf-8 so fs.readFile returns string instead of buffer
const MEMORY_FILE_ENCODING = 'utf-8';

const psTreePromised = util.promisify(psTree);

/**
 * Logs info about system, node version and apify package version.
 * @internal
 */
export const logSystemInfo = () => {
    log.info('System info', {
        apifyVersion,
        apifyClientVersion,
        osType: os.type(),
        nodeVersion: process.version,
    });
};

let isDockerPromiseCache: Promise<boolean>;

const createIsDockerPromise = async () => {
    const promise1 = util
        .promisify(fs.stat)('/.dockerenv')
        .then(() => true)
        .catch(() => false);

    const promise2 = util
        .promisify(fs.readFile)('/proc/self/cgroup', 'utf8')
        .then((content) => content.indexOf('docker') !== -1)
        .catch(() => false);

    const [result1, result2] = await Promise
        .all([promise1, promise2]);

    return result1 || result2;
};

/**
 * Returns a `Promise` that resolves to true if the code is running in a Docker container.
 */
export function isDocker(forceReset?: boolean): Promise<boolean> {
    // Parameter forceReset is just internal for unit tests.
    if (!isDockerPromiseCache || forceReset) isDockerPromiseCache = createIsDockerPromise();

    return isDockerPromiseCache;
}

/**
 * Computes a weighted average of an array of numbers, complemented by an array of weights.
 * @ignore
 */
export function weightedAvg(arrValues: number[], arrWeights: number[]): number {
    const result = arrValues.map((value, i) => {
        const weight = arrWeights[i];
        const sum = value * weight;

        return [sum, weight];
    }).reduce((p, c) => [p[0] + c[0], p[1] + c[1]], [0, 0]);

    return result[0] / result[1];
}

/**
 * Describes memory usage of an Actor.
 */
export interface MemoryInfo {
    /** Total memory available in the system or container */
    totalBytes: number;

    /** Amount of free memory in the system or container */
    freeBytes: number;

    /** Amount of memory used (= totalBytes - freeBytes) */
    usedBytes: number;

    /** Amount of memory used the current Node.js process */
    mainProcessBytes: number;

    /** Amount of memory used by child processes of the current Node.js process */
    childProcessesBytes: number;
}

export interface DownloadListOfUrlsOptions {
    /**
     * URL to the file
     */
    url: string;

    /**
     * The encoding of the file.
     * @default 'utf8'
     */
    encoding?: BufferEncoding;

    /**
     * Custom regular expression to identify the URLs in the file to extract.
     * The regular expression should be case-insensitive and have global flag set (i.e. `/something/gi`).
     * @default Apify.utils.URL_NO_COMMAS_REGEX
     */
    urlRegExp?: RegExp;
}

// TODO add proper param description
export interface ExtractUrlsOptions {
    /**
     * Arbitrary string
     */
    string: string;

    /**
     * Custom regular expression
     * @default Apify.utils.URL_NO_COMMAS_REGEX
     */
    urlRegExp?: RegExp;
}

/**
 * Returns memory statistics of the process and the system, see {@link MemoryInfo}.
 *
 * If the process runs inside of Docker, the `getMemoryInfo` gets container memory limits,
 * otherwise it gets system memory limits.
 *
 * Beware that the function is quite inefficient because it spawns a new process.
 * Therefore you shouldn't call it too often, like more than once per second.
 */
export async function getMemoryInfo(): Promise<MemoryInfo> {
    // lambda does *not* have `ps` and other command line tools
    // required to extract memory usage.
    const isLambdaEnvironment = process.platform === 'linux'
        && !!process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE;

    // publicUtils must be used here so that we can mock it.
    const isDockerVar = !isLambdaEnvironment && await publicUtils.isDocker();

    let mainProcessBytes = -1;
    let childProcessesBytes = 0;

    if (isLambdaEnvironment) {
        // reported in bytes
        mainProcessBytes = process.memoryUsage().rss;

        // TODO this is quite ugly, let's introduce some local variables
        // https://stackoverflow.com/a/55914335/129415
        childProcessesBytes = +execSync('cat /proc/meminfo')
            .toString()
            .split(/[\n: ]/)
            .filter((val) => val.trim())[19]
            * 1000 // meminfo reports in kb, not bytes
            // the total used memory is reported by meminfo
            // subtract memory used by the main node proces
            // in order to infer memory used by any child processes
            - mainProcessBytes;
    } else {
        // Query both root and child processes
        const processes = await psTreePromised(process.pid, true);

        processes.forEach((rec: Dictionary<string>) => {
            // Skip the 'ps' or 'wmic' commands used by ps-tree to query the processes
            if (rec.COMMAND === 'ps' || rec.COMMAND === 'WMIC.exe') {
                return;
            }
            const bytes = parseInt(rec.RSS, 10);
            // Obtain main process' memory separately
            if (rec.PID === `${process.pid}`) {
                mainProcessBytes = bytes;
                return;
            }
            childProcessesBytes += bytes;
        });
    }

    let totalBytes;
    let usedBytes;
    let freeBytes;

    if (isLambdaEnvironment) {
        // memory size is defined in megabytes
        totalBytes = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE!, 10) * 1000000;
        usedBytes = mainProcessBytes + childProcessesBytes;
        freeBytes = totalBytes - usedBytes;

        log.debug(`lambda size of ${totalBytes} with ${freeBytes} free bytes`);
    } else if (isDockerVar) {
        // When running inside Docker container, use container memory limits
        // This must be promisified here so that we can mock it.
        const readPromised = util.promisify(fs.readFile);
        const accessPromised = util.promisify(fs.access);

        // Check wheter cgroups V1 or V2 is used
        let cgroupsVersion: keyof typeof MEMORY_FILE_PATHS.TOTAL = 'V1';
        try {
            // If this directory does not exists, assume docker is using cgroups V2
            await accessPromised('/sys/fs/cgroup/memory/', fs.constants.R_OK);
        } catch (err) {
            cgroupsVersion = 'V2';
        }

        try {
            let [totalBytesStr, usedBytesStr] = await Promise.all([
                readPromised(MEMORY_FILE_PATHS.TOTAL[cgroupsVersion], MEMORY_FILE_ENCODING),
                readPromised(MEMORY_FILE_PATHS.USED[cgroupsVersion], MEMORY_FILE_ENCODING),
            ]);

            // Cgroups V2 files contains newline character. Getting rid of it for better handling in later part of the code.
            totalBytesStr = totalBytesStr.replace(/[^a-zA-Z0-9 ]/g, '');
            usedBytesStr = usedBytesStr.replace(/[^a-zA-Z0-9 ]/g, '');

            // Cgroups V2 contains 'max' string if memory is not limited
            // See https://git.kernel.org/pub/scm/linux/kernel/git/tj/cgroup.git/tree/Documentation/admin-guide/cgroup-v2.rst (see "memory.max")
            if (totalBytesStr === 'max') {
                totalBytes = os.totalmem();
                // Cgroups V1 is set to number related to platform and page size if memory is not limited
                // See https://unix.stackexchange.com/q/420906
            } else {
                totalBytes = parseInt(totalBytesStr, 10);
                const containerRunsWithUnlimitedMemory = totalBytes > Number.MAX_SAFE_INTEGER;
                if (containerRunsWithUnlimitedMemory) totalBytes = os.totalmem();
            }
            usedBytes = parseInt(usedBytesStr, 10);
            freeBytes = totalBytes - usedBytes;
        } catch (err) {
            // log.deprecated logs a warning only once
            log.deprecated('Your environment is Docker, but your system does not support memory cgroups. '
                + 'If you\'re running containers with limited memory, memory auto-scaling will not work properly.\n\n'
                + `Cause: ${(err as Error).message}`);
            totalBytes = os.totalmem();
            freeBytes = os.freemem();
            usedBytes = totalBytes - freeBytes;
        }
    } else {
        totalBytes = os.totalmem();
        freeBytes = os.freemem();
        usedBytes = totalBytes - freeBytes;
    }

    return {
        totalBytes,
        freeBytes,
        usedBytes,
        mainProcessBytes,
        childProcessesBytes,
    };
}

/**
 * Returns `true` when code is running on Apify platform and `false` otherwise (for example locally).
 */
export function isAtHome(): boolean {
    return !!process.env[ENV_VARS.IS_AT_HOME];
}

/**
 * Returns a `Promise` that resolves after a specific period of time. This is useful to implement waiting
 * in your code, e.g. to prevent overloading of target website or to avoid bot detection.
 *
 * **Example usage:**
 *
 * ```
 * const Apify = require('apify');
 *
 * ...
 *
 * // Sleep 1.5 seconds
 * await Apify.utils.sleep(1500);
 * ```
 * @param millis Period of time to sleep, in milliseconds. If not a positive number, the returned promise resolves immediately.
 */
export function sleep(millis?: number): Promise<void> {
    return new Promise((res) => setTimeout(res, millis));
}

/**
 * Returns a promise that resolves to an array of urls parsed from the resource available at the provided url.
 * Optionally, custom regular expression and encoding may be provided.
 */
export async function downloadListOfUrls(options: DownloadListOfUrlsOptions): Promise<string[]> {
    ow(options, ow.object.exactShape({
        url: ow.string.url,
        encoding: ow.optional.string,
        urlRegExp: ow.optional.regExp,
    }));
    const { url, encoding = 'utf8', urlRegExp = URL_NO_COMMAS_REGEX } = options;

    // Try to detect wrong urls and fix them. Currently, detects only sharing url instead of csv download one.
    const match = url.match(/^(https:\/\/docs\.google\.com\/spreadsheets\/d\/(?:\w|-)+)\/?/);
    let fixedUrl = url;

    if (match) {
        fixedUrl = `${match[1]}/gviz/tq?tqx=out:csv`;
    }

    const { body: string } = await requestAsBrowser({ url: fixedUrl, encoding });
    return extractUrls({ string, urlRegExp });
}

/**
 * Collects all URLs in an arbitrary string to an array, optionally using a custom regular expression.
 */
function extractUrls(options: ExtractUrlsOptions): string[] {
    ow(options, ow.object.exactShape({
        string: ow.string,
        urlRegExp: ow.optional.regExp,
    }));
    const { string, urlRegExp = URL_NO_COMMAS_REGEX } = options;
    return string.match(urlRegExp) || [];
}

// NOTE: We are skipping 'noscript' since it's content is evaluated as text, instead of HTML elements. That damages the results.
const SKIP_TAGS_REGEX = /^(script|style|canvas|svg|noscript)$/i;
const BLOCK_TAGS_REGEX = /^(p|h1|h2|h3|h4|h5|h6|ol|ul|li|pre|address|blockquote|dl|div|fieldset|form|table|tr|select|option)$/i;

/**
 * The function converts a HTML document to a plain text.
 *
 * The plain text generated by the function is similar to a text captured
 * by pressing Ctrl+A and Ctrl+C on a page when loaded in a web browser.
 * The function doesn't aspire to preserve the formatting or to be perfectly correct with respect to HTML specifications.
 * However, it attempts to generate newlines and whitespaces in and around HTML elements
 * to avoid merging distinct parts of text and thus enable extraction of data from the text (e.g. phone numbers).
 *
 * **Example usage**
 * ```javascript
 * const text = htmlToText('<html><body>Some text</body></html>');
 * console.log(text);
 * ```
 *
 * Note that the function uses [cheerio](https://www.npmjs.com/package/cheerio) to parse the HTML.
 * Optionally, to avoid duplicate parsing of HTML and thus improve performance, you can pass
 * an existing Cheerio object to the function instead of the HTML text. The HTML should be parsed
 * with the `decodeEntities` option set to `true`. For example:
 *
 * ```javascript
 * const cheerio = require('cheerio');
 * const html = '<html><body>Some text</body></html>';
 * const text = htmlToText(cheerio.load(html, { decodeEntities: true }));
 * ```
 * @param html HTML text or parsed HTML represented using a [cheerio](https://www.npmjs.com/package/cheerio) function.
 * @return Plain text
 */
export function htmlToText(html: string | CheerioRoot): string {
    if (!html) return '';

    // TODO: Add support for "html" being a Cheerio element, otherwise the only way
    //  to use it is e.g. htmlToText($('p').html())) which is inefficient
    //  Also, it seems this doesn't work well in CheerioScraper, e.g. htmlToText($)
    //  produces really text with a lot of HTML elements in it. Let's just deprecate this sort of usage,
    //  and make the parameter "htmlOrCheerioElement"
    const $ = typeof html === 'function' ? html : cheerio.load(html, { decodeEntities: true });
    let text = '';

    // TODO: the type for elems is very annoying to work with.
    //  The correct type is Node[] from cheerio but it needs a lot more casting in each branch, or alternatively,
    //  use the is* methods from domhandler (isText, isTag, isComment, etc.)
    // @ts-expect-error
    const process = (elems) => {
        const len = elems ? elems.length : 0;
        for (let i = 0; i < len; i++) {
            const elem = elems[i];
            if (elem.type === 'text') {
                // Compress spaces, unless we're inside <pre> element
                let compr;
                if (elem.parent && elem.parent.tagName === 'pre') compr = elem.data;
                else compr = elem.data.replace(/\s+/g, ' ');
                // If text is empty or ends with a whitespace, don't add the leading whitepsace
                if (compr.startsWith(' ') && /(^|\s)$/.test(text)) compr = compr.substr(1);
                text += compr;
            } else if (elem.type === 'comment' || SKIP_TAGS_REGEX.test(elem.tagName)) {
                // Skip comments and special elements
            } else if (elem.tagName === 'br') {
                text += '\n';
            } else if (elem.tagName === 'td') {
                process(elem.children);
                text += '\t';
            } else {
                // Block elements must be surrounded by newlines (unless beginning of text)
                const isBlockTag = BLOCK_TAGS_REGEX.test(elem.tagName);
                if (isBlockTag && !/(^|\n)$/.test(text)) text += '\n';
                process(elem.children);
                if (isBlockTag && !text.endsWith('\n')) text += '\n';
            }
        }
    };

    // If HTML document has body, only convert that, otherwise convert the entire HTML
    const $body = $('body');
    process($body.length > 0 ? $body : $.root());

    return text.trim();
}

/**
 * Creates a standardized debug info from request and response. This info is usually added to dataset under the hidden `#debug` field.
 *
 * @param request [Apify.Request](https://sdk.apify.com/docs/api/request) object.
 * @param [response]
 *   Puppeteer [`Response`](https://pptr.dev/#?product=Puppeteer&version=v1.11.0&show=api-class-response)
 *   or NodeJS [`http.IncomingMessage`](https://nodejs.org/api/http.html#http_class_http_serverresponse).
 * @param [additionalFields] Object containing additional fields to be added.
 */
export function createRequestDebugInfo(
    request: Request,
    response: IncomingMessage | Partial<PuppeteerResponse> = {},
    additionalFields: Dictionary = {},
): Dictionary {
    ow(request, ow.object);
    ow(response, ow.object);
    ow(additionalFields, ow.object);

    return {
        requestId: request.id,
        url: request.url,
        loadedUrl: request.loadedUrl,
        method: request.method,
        retryCount: request.retryCount,
        errorMessages: request.errorMessages,
        // Puppeteer response has .status() function and NodeJS response, statusCode property.
        statusCode: 'status' in response && response.status instanceof Function ? response.status() : (response as IncomingMessage).statusCode,
        ...additionalFields,
    };
}

/**
 * Converts SNAKE_CASE to camelCase.
 * @ignore
 */
export function snakeCaseToCamelCase(snakeCaseStr: string): string {
    return snakeCaseStr
        .toLowerCase()
        .split('_')
        .map((part, index) => {
            return index > 0
                ? part.charAt(0).toUpperCase() + part.slice(1)
                : part;
        })
        .join('');
}

/**
 * Prints a warning if this version of Apify SDK is outdated.
 * @ignore
 */
export function printOutdatedSdkWarning() {
    if (process.env[ENV_VARS.DISABLE_OUTDATED_WARNING]) return;
    const latestApifyVersion = process.env[ENV_VARS.SDK_LATEST_VERSION];
    if (!latestApifyVersion || !semver.lt(apifyVersion, latestApifyVersion)) return;

    log.warning(`You are using an outdated version (${apifyVersion}) of Apify SDK. We recommend you to update to the latest version (${latestApifyVersion}).
         Read more about Apify SDK versioning at: https://help.apify.com/en/articles/3184510-updates-and-versioning-of-apify-sdk`);
}

/**
 * Gets parsed content type from response object
 * @param response HTTP response object
 * @ignore
 */
export function parseContentTypeFromResponse(response: IncomingMessage): { type: string; charset: BufferEncoding } {
    ow(response, ow.object.partialShape({
        url: ow.string.url,
        headers: ow.object,
    }));

    const { url, headers } = response;
    let parsedContentType;

    if (headers['content-type']) {
        try {
            parsedContentType = contentTypeParser.parse(headers['content-type']);
        } catch (err) {
            // Can not parse content type from Content-Type header. Try to parse it from file extension.
        }
    }

    // Parse content type from file extension as fallback
    if (!parsedContentType) {
        const parsedUrl = new URL(url);
        const contentTypeFromExtname = mime.contentType(path.extname(parsedUrl.pathname))
            || 'application/octet-stream; charset=utf-8'; // Fallback content type, specified in https://tools.ietf.org/html/rfc7231#section-3.1.1.5
        parsedContentType = contentTypeParser.parse(contentTypeFromExtname);
    }

    return {
        type: parsedContentType.type,
        charset: parsedContentType.parameters.charset as BufferEncoding,
    };
}

/**
 * Cleans up the local storage folder created when testing locally.
 * This is useful in the event you are debugging your code locally.
 *
 * Be careful as this will remove the folder you provide and everything in it!
 *
 * @param [folder] The folder to clean up
 */
export async function purgeLocalStorage(folder?: string): Promise<void> {
    // If the user did not provide a folder, try to get it from the env variables, or the default one
    if (!folder) {
        folder = process.env[ENV_VARS.LOCAL_STORAGE_DIR] || 'apify_storage';
    }

    // Clear the folder
    await rimrafp(folder);
}

// regular re-export as those methods should be part of `utils`
export * from './utils_request';
export * from './enqueue_links/enqueue_links';

// TODO move this elsewhere or rename
export * as requestUtils from './utils_request';
export { default as logUtils } from './utils_log';
export * as socialUtils from './utils_social';
export * as playwrightUtils from './playwright_utils';
export * as puppeteerUtils from './puppeteer_utils';

/** @internal */
export const publicUtils = {
    isDocker,
    sleep,
    downloadListOfUrls,
    extractUrls,
    htmlToText,
    URL_NO_COMMAS_REGEX,
    URL_WITH_COMMAS_REGEX,
    createRequestDebugInfo,
    purgeLocalStorage,
};