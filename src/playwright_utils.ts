/**
 * A namespace that contains various utilities for
 * [Playwright](https://github.com/microsoft/playwright) - the headless Chrome Node API.
 *
 * **Example usage:**
 *
 * ```javascript
 * const Apify = require('apify');
 * const { playwright } = Apify.utils;
 *
 * // Navigate to https://www.example.com in Playwright with a POST request
 * const browser = await Apify.launchPlaywright();
 * const page = await browser.newPage();
 * await playwright.gotoExtended(page, {
 *     url: 'https://example.com,
 *     method: 'POST',
 * });
 * ```
 * @module playwrightUtils
 */

import ow from 'ow';
import _ from 'underscore';
import { Page, Response } from 'playwright';
import log from './utils_log';
import { validators } from './validators';
import { Request } from './request';

export interface DirectNavigationOptions {
    /**
     * Maximum operation time in milliseconds, defaults to 30 seconds, pass `0` to disable timeout. The
     * default value can be changed by using the browserContext.setDefaultNavigationTimeout(timeout),
     * browserContext.setDefaultTimeout(timeout), page.setDefaultNavigationTimeout(timeout) or
     * page.setDefaultTimeout(timeout) methods.
     */
    timeout?: number;

    /**
     * When to consider operation succeeded, defaults to `load`. Events can be either:
     * - `'domcontentloaded'` - consider operation to be finished when the `DOMContentLoaded` event is fired.
     * - `'load'` - consider operation to be finished when the `load` event is fired.
     * - `'networkidle'` - consider operation to be finished when there are no network connections for at least `500` ms.
     */
    waitUntil?: 'domcontentloaded' | 'load' | 'networkidle';

    /**
     * Referer header value. If provided it will take preference over the referer header value set by page.setExtraHTTPHeaders(headers).
     */
    referer?: string;
}

/**
 * Extended version of Playwright's `page.goto()` allowing to perform requests with HTTP method other than GET,
 * with custom headers and POST payload. URL, method, headers and payload are taken from
 * request parameter that must be an instance of Apify.Request class.
 *
 * *NOTE:* In recent versions of Playwright using requests other than GET, overriding headers and adding payloads disables
 * browser cache which degrades performance.
 *
 * @param page
 *   Puppeteer [`Page`](https://playwright.dev/docs/api/class-page) object.
 * @param request
 * @param [gotoOptions] Custom options for `page.goto()`.
 * @memberOf playwright
 */
export async function gotoExtended(page: Page, request: Request, gotoOptions: DirectNavigationOptions = {}): Promise<Response | null> {
    ow(page, ow.object.validate(validators.browserPage));
    ow(request, ow.object.partialShape({
        url: ow.string.url,
        method: ow.optional.string,
        headers: ow.optional.object,
        payload: ow.optional.any(ow.string, ow.buffer),
    }));
    ow(gotoOptions, ow.object);

    const { url, method, headers, payload } = request;

    if (method !== 'GET' || payload || !_.isEmpty(headers)) {
        // This is not deprecated, we use it to log only once.
        log.deprecated('Using other request methods than GET, rewriting headers and adding payloads has a high impact on performance '
            + 'in recent versions of Playwright. Use only when necessary.');
        let wasCalled = false;
        const interceptRequestHandler = async (route) => {
            try {
                // We want to ensure that this won't get executed again in a case that there is a subsequent request
                // for example for some asset file link from main HTML.
                if (wasCalled) {
                    return await route.continue();
                }

                wasCalled = true;
                const overrides: Record<string, unknown> = {};

                if (method !== 'GET') overrides.method = method;
                if (payload) overrides.postData = payload;
                if (!_.isEmpty(headers)) overrides.headers = headers;
                await route.continue(overrides);
            } catch (error) {
                log.debug('Error inside request interceptor', { error });
            }
        };

        await page.route('**/*', interceptRequestHandler);
    }

    return page.goto(url, gotoOptions);
}

/** @internal */
export const playwrightUtils = {
    gotoExtended,
};
