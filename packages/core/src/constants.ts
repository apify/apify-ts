import { ACTOR_EVENT_NAMES } from '@apify/consts';

/**
 * The default user agent used by `Apify.launchPuppeteer`.
 * Last updated on 2020-05-22.
 */
// eslint-disable-next-line max-len
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.67 Safari/537.36';

/**
 * These events are just internal for Apify package, so we don't need them in apify-shared package.
 */
export const ACTOR_EVENT_NAMES_EX = { ...ACTOR_EVENT_NAMES, PERSIST_STATE: 'persistState' };

/**
 * Base URL of Apify's API endpoints.
 */
export const APIFY_API_BASE_URL = 'https://api.apify.com/v2';

export const COUNTRY_CODE_REGEX = /^[A-Z]{2}$/;

export const STATUS_CODES_BLOCKED = [401, 403, 429];
