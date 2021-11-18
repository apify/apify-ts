import ow from 'ow';
import { URL } from 'url';
import { Page, HTTPRequest as PuppeteerRequest, Target, Frame, PageEventObject } from 'puppeteer';
import log from '../utils_log';
import { RequestQueue, QueueOperationInfo } from '../storages/request_queue'; // eslint-disable-line import/named,no-unused-vars
import { addInterceptRequestHandler, removeInterceptRequestHandler } from '../puppeteer_request_interception';
import {
    constructPseudoUrlInstances,
    createRequests,
    addRequestsToQueueInBatches,
    createRequestOptions,
    RequestTransform,
    PseudoUrlInput,
} from './shared';
import { Dictionary } from '../typedefs';

const STARTING_Z_INDEX = 2147400000;

export interface EnqueueLinksByClickingElementsOptions {
    /**
     * Puppeteer [`Page`](https://pptr.dev/#?product=Puppeteer&show=api-class-page) object.
     */
    page: Page;

    /**
     * A request queue to which the URLs will be enqueued.
     */
    requestQueue: RequestQueue;

    /**
     * A CSS selector matching elements to be clicked on. Unlike in {@link utils.enqueueLinks}, there is no default
     * value. This is to prevent suboptimal use of this function by using it too broadly.
     */
    selector: string;

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
    pseudoUrls?: PseudoUrlInput[];

    /**
     * Just before a new {@link Request} is constructed and enqueued to the {@link RequestQueue}, this function can be used
     * to remove it or modify its contents such as `userData`, `payload` or, most importantly `uniqueKey`. This is useful
     * when you need to enqueue multiple `Requests` to the queue that share the same URL, but differ in methods or payloads,
     * or to dynamically update or create `userData`.
     *
     * For example: by adding `useExtendedUniqueKey: true` to the `request` object, `uniqueKey` will be computed from
     * a combination of `url`, `method` and `payload` which enables crawling of websites that navigate using form submits
     * (POST requests).
     *
     * **Example:**
     * ```javascript
     * {
     *     transformRequestFunction: (request) => {
     *         request.userData.foo = 'bar';
     *         request.useExtendedUniqueKey = true;
     *         return request;
     *     }
     * }
     * ```
     */
    transformRequestFunction?: RequestTransform;

    /**
     * Clicking in the page triggers various asynchronous operations that lead to new URLs being shown
     * by the browser. It could be a simple JavaScript redirect or opening of a new tab in the browser.
     * These events often happen only some time after the actual click. Requests typically take milliseconds
     * while new tabs open in hundreds of milliseconds.
     *
     * To be able to capture all those events, the `enqueueLinksByClickingElements()` function repeatedly waits
     * for the `waitForPageIdleSecs`. By repeatedly we mean that whenever a relevant event is triggered, the timer
     * is restarted. As long as new events keep coming, the function will not return, unless
     * the below `maxWaitForPageIdleSecs` timeout is reached.
     *
     * You may want to reduce this for example when you're sure that your clicks do not open new tabs,
     * or increase when you're not getting all the expected URLs.
     * @default 1
     */
    waitForPageIdleSecs?: number;

    /**
     * This is the maximum period for which the function will keep tracking events, even if more events keep coming.
     * Its purpose is to prevent a deadlock in the page by periodic events, often unrelated to the clicking itself.
     * See `waitForPageIdleSecs` above for an explanation.
     * @default 5
     */
    maxWaitForPageIdleSecs?: number;
}

/**
 * The function finds elements matching a specific CSS selector in a Puppeteer page,
 * clicks all those elements using a mouse move and a left mouse button click and intercepts
 * all the navigation requests that are subsequently produced by the page. The intercepted
 * requests, including their methods, headers and payloads are then enqueued to a provided
 * {@link RequestQueue}. This is useful to crawl JavaScript heavy pages where links are not available
 * in `href` elements, but rather navigations are triggered in click handlers.
 * If you're looking to find URLs in `href` attributes of the page, see {@link utils.enqueueLinks}.
 *
 * Optionally, the function allows you to filter the target links' URLs using an array of {@link PseudoUrl} objects
 * and override settings of the enqueued {@link Request} objects.
 *
 * **IMPORTANT**: To be able to do this, this function uses various mutations on the page,
 * such as changing the Z-index of elements being clicked and their visibility. Therefore,
 * it is recommended to only use this function as the last operation in the page.
 *
 * **USING HEADFUL BROWSER**: When using a headful browser, this function will only be able to click elements
 * in the focused tab, effectively limiting concurrency to 1. In headless mode, full concurrency can be achieved.
 *
 * **PERFORMANCE**: Clicking elements with a mouse and intercepting requests is not a low level operation
 * that takes nanoseconds. It's not very CPU intensive, but it takes time. We strongly recommend limiting
 * the scope of the clicking as much as possible by using a specific selector that targets only the elements
 * that you assume or know will produce a navigation. You can certainly click everything by using
 * the `*` selector, but be prepared to wait minutes to get results on a large and complex page.
 *
 * **Example usage**
 *
 * ```javascript
 * await Apify.utils.puppeteer.enqueueLinksByClickingElements({
 *   page,
 *   requestQueue,
 *   selector: 'a.product-detail',
 *   pseudoUrls: [
 *       'https://www.example.com/handbags/[.*]'
 *       'https://www.example.com/purses/[.*]'
 *   ],
 * });
 * ```
 *
 * @return {Promise<Array<QueueOperationInfo>>}
 *   Promise that resolves to an array of {@link QueueOperationInfo} objects.
 */
export async function enqueueLinksByClickingElements(options: EnqueueLinksByClickingElementsOptions): Promise<QueueOperationInfo[]> {
    ow(options, ow.object.exactShape({
        page: ow.object.hasKeys('goto', 'evaluate'),
        requestQueue: ow.object.hasKeys('fetchNextRequest', 'addRequest'),
        selector: ow.string,
        pseudoUrls: ow.optional.array.ofType(ow.any(ow.string, ow.regExp, ow.object.hasKeys('purl'))),
        transformRequestFunction: ow.optional.function,
        waitForPageIdleSecs: ow.optional.number,
        maxWaitForPageIdleSecs: ow.optional.number,
    }));

    const {
        page,
        requestQueue,
        selector,
        pseudoUrls,
        transformRequestFunction,
        waitForPageIdleSecs = 1,
        maxWaitForPageIdleSecs = 5,
    } = options;

    const waitForPageIdleMillis = waitForPageIdleSecs * 1000;
    const maxWaitForPageIdleMillis = maxWaitForPageIdleSecs * 1000;

    // @ts-ignore ow is messing up the types
    const pseudoUrlInstances = constructPseudoUrlInstances(pseudoUrls || []);
    const interceptedRequests = await clickElementsAndInterceptNavigationRequests({
        page,
        selector,
        waitForPageIdleMillis,
        maxWaitForPageIdleMillis,
    });
    let requestOptions = createRequestOptions(interceptedRequests);
    if (transformRequestFunction) {
        // @ts-ignore ow is messing up the types (`transformRequestFunction`), plus the `requestOptions` type is not compatible
        requestOptions = requestOptions.map(transformRequestFunction).filter((r) => !!r);
    }
    const requests = createRequests(requestOptions, pseudoUrlInstances);
    // @ts-ignore ow is messing up the types (`requestQueue`)
    return addRequestsToQueueInBatches(requests, requestQueue);
}

interface WaitForPageIdleOptions {
    page: Page;
    waitForPageIdleMillis?: number;
    maxWaitForPageIdleMillis?: number;
}

interface ClickElementsAndInterceptNavigationRequestsOptions extends WaitForPageIdleOptions {
    selector: string;
}

/**
 * Clicks all elements of given page matching given selector.
 * Catches and intercepts all initiated navigation requests and opened pages.
 * Returns a list of all target URLs.
 * @ignore
 */
export async function clickElementsAndInterceptNavigationRequests(options: ClickElementsAndInterceptNavigationRequestsOptions): Promise<Dictionary[]> {
    const {
        page,
        selector,
        waitForPageIdleMillis,
        maxWaitForPageIdleMillis,
    } = options;

    const uniqueRequests = new Set<string>();
    const browser = page.browser();

    const onInterceptedRequest = createInterceptRequestHandler(page, uniqueRequests);
    const onTargetCreated = createTargetCreatedHandler(page, uniqueRequests);
    const onFrameNavigated = createFrameNavigatedHandler(page, uniqueRequests);

    await addInterceptRequestHandler(page, onInterceptedRequest);
    browser.on('targetcreated', onTargetCreated);
    page.on('framenavigated', onFrameNavigated);

    await preventHistoryNavigation(page);

    await clickElements(page, selector);
    await waitForPageIdle({ page, waitForPageIdleMillis, maxWaitForPageIdleMillis });

    await restoreHistoryNavigationAndSaveCapturedUrls(page, uniqueRequests);

    browser.removeListener('targetcreated', onTargetCreated);
    page.removeListener('framenavigated', onFrameNavigated);
    await removeInterceptRequestHandler(page, onInterceptedRequest);

    const serializedRequests = Array.from(uniqueRequests);
    return serializedRequests.map((r) => JSON.parse(r));
}

/**
 * @ignore
 */
function createInterceptRequestHandler(page: Page, requests: Set<string>): (req: PuppeteerRequest) => Promise<void> {
    return async function onInterceptedRequest(req) {
        if (!isTopFrameNavigationRequest(page, req)) return req.continue();
        const url = req.url();
        requests.add(JSON.stringify({
            url,
            headers: req.headers(),
            method: req.method(),
            payload: req.postData(),
        }));

        if (req.redirectChain().length) {
            req.respond({ body: '' }); // Prevents 301/302 redirect
        } else {
            req.abort('aborted'); // Prevents navigation by js
        }
    };
}

/**
 * @ignore
 */
function isTopFrameNavigationRequest(page: Page, req: PuppeteerRequest): boolean {
    return req.isNavigationRequest()
        && req.frame() === page.mainFrame();
}

/**
 * @ignore
 */
function createTargetCreatedHandler(page: Page, requests: Set<string>): (target: Target) => Promise<void> {
    return async function onTargetCreated(target) {
        if (!isTargetRelevant(page, target)) return;
        const url = target.url();
        requests.add(JSON.stringify({ url }));

        // We want to close the page but don't care about
        // possible errors like target closed.
        try {
            const createdPage = await target.page();
            await createdPage!.close();
        } catch (err) {
            log.debug('enqueueLinksByClickingElements: Could not close spawned page.', { error: err.stack });
        }
    };
}

/**
 * We're only interested in pages created by the page we're currently clicking in.
 * There will generally be a lot of other targets being created in the browser.
 */
export function isTargetRelevant(page: Page, target: Target): boolean {
    return target.type() === 'page'
        && page.target() === target.opener();
}

/**
 * @ignore
 */
function createFrameNavigatedHandler(page: Page, requests: Set<string>): (frame: Frame) => void {
    return function onFrameNavigated(frame) {
        if (frame !== page.mainFrame()) return;
        const url = frame.url();
        requests.add(JSON.stringify({ url }));
    };
}

/**
 * @ignore
 */
async function preventHistoryNavigation(page: Page): Promise<unknown> {
    /* istanbul ignore next */
    return page.evaluate(() => {
        // @ts-ignore assign to window
        window.__originalHistory__ = window.history; // eslint-disable-line no-underscore-dangle
        // @ts-ignore dark magic
        delete window.history; // Simple override does not work.
        // @ts-ignore dark magic
        window.history = {
            stateHistory: [],
            length: 0,
            state: {},
            go() {},
            back() {},
            forward() {},
            pushState(...args) {
                this.stateHistory.push(args);
            },
            replaceState(...args) {
                this.stateHistory.push(args);
            },
        };
    });
}

/**
 * Click all elements matching the given selector. To be able to do this using
 * Puppeteer's `.click()` we need to make sure the elements are reachable by mouse,
 * so we first move them to the top of the page's stacking context and then click.
 * We do all in series to prevent elements from hiding one another. Therefore,
 * for large element sets, this will take considerable amount of time.
 * @ignore
 */
export async function clickElements(page: Page, selector: string): Promise<void> {
    const elementHandles = await page.$$(selector);
    log.debug(`enqueueLinksByClickingElements: There are ${elementHandles.length} elements to click.`);
    let clickedElementsCount = 0;
    let zIndex = STARTING_Z_INDEX;
    let shouldLogWarning = true;
    for (const handle of elementHandles) {
        try {
            await page.evaluate(updateElementCssToEnableMouseClick, handle, zIndex++);
            await handle.click();
            clickedElementsCount++;
        } catch (err) {
            if (shouldLogWarning && err.stack.includes('is detached from document')) {
                log.warning(`An element with selector ${selector} that you're trying to click has been removed from the page. `
                    + 'This was probably caused by an earlier click which triggered some JavaScript on the page that caused it to change. '
                    + 'If you\'re trying to enqueue pagination links, we suggest using the "next" button, if available and going one by one.');
                shouldLogWarning = false;
            }
            log.debug('enqueueLinksByClickingElements: Click failed.', { stack: err.stack });
        }
    }
    log.debug(`enqueueLinksByClickingElements: Successfully clicked ${clickedElementsCount} elements out of ${elementHandles.length}`);
}

/* istanbul ignore next */
/**
 * This is an in browser function!
 */
function updateElementCssToEnableMouseClick(el: HTMLElement, zIndex: number): void {
    el.style.visibility = 'visible';
    el.style.display = 'block';
    el.style.position = 'fixed';
    el.style.zIndex = String(zIndex);
    el.style.left = String(0);
    el.style.top = String(0);
    const boundingRect = el.getBoundingClientRect();
    if (!boundingRect.height) el.style.height = '10px';
    if (!boundingRect.width) el.style.width = '10px';
}

/**
 * This function tracks whether any requests, frame navigations or targets were emitted
 * in the past idleIntervalMillis and whenever the interval registers no activity,
 * the function returns.
 *
 * It will also return when a final timeout, represented by the timeoutMillis parameter
 * is reached, to prevent blocking on pages with constant network activity.
 *
 * We need this to make sure we don't finish too soon when intercepting requests triggered
 * by clicking in the page. They often get registered by the Node.js process only some
 * milliseconds after clicking and we would lose those requests. This is especially prevalent
 * when there's only a single element to click.
 * @ignore
 */
async function waitForPageIdle({ page, waitForPageIdleMillis, maxWaitForPageIdleMillis }: WaitForPageIdleOptions): Promise<void> {
    return new Promise<void>((resolve) => {
        let timeout;
        let maxTimeout;

        function newTabTracker(target) {
            if (isTargetRelevant(page, target)) activityHandler();
        }

        function activityHandler() {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                clearTimeout(maxTimeout);
                finish();
            }, waitForPageIdleMillis);
        }

        function maxTimeoutHandler() {
            log.debug(`enqueueLinksByClickingElements: Page still showed activity after ${maxWaitForPageIdleMillis}ms. `
                + 'This is probably due to the website itself dispatching requests, but some links may also have been missed.');
            finish();
        }

        function finish() {
            page.removeListener('request', activityHandler);
            page.removeListener('framenavigated', activityHandler);
            page.removeListener('targetcreated', newTabTracker);
            resolve();
        }

        maxTimeout = setTimeout(maxTimeoutHandler, maxWaitForPageIdleMillis);
        timeout = activityHandler(); // We call this once manually in case there would be no requests at all.
        page.on('request', activityHandler);
        page.on('framenavigated', activityHandler);
        page.on('targetcreated' as keyof PageEventObject, newTabTracker);
    });
}

/**
 * @todo we should not use `Page` type here
 * @ignore
 */
async function restoreHistoryNavigationAndSaveCapturedUrls(page: Page, requests: Set<string>): Promise<void> {
    /* eslint-disable no-shadow */
    /* istanbul ignore next */
    const stateHistory = await page.evaluate(() => {
        // @ts-ignore what is `stateHistory`?
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const { stateHistory } = window.history;
        // @ts-ignore assign to const property
        window.history = window.__originalHistory__; // eslint-disable-line no-underscore-dangle
        return stateHistory;
    });
    stateHistory.forEach((args) => {
        try {
            const stateUrl = args[args.length - 1];
            const url = new URL(stateUrl, page.url()).href;
            requests.add(JSON.stringify({ url }));
        } catch (err) {
            log.debug('enqueueLinksByClickingElements: Failed to ', { error: err.stack });
        }
    });
}
