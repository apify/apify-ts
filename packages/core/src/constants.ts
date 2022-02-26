import { ACTOR_EVENT_NAMES } from '@apify/consts';

/**
 * These events are just internal for Apify package, so we don't need them in apify-shared package.
 */
export const ACTOR_EVENT_NAMES_EX = { ...ACTOR_EVENT_NAMES, PERSIST_STATE: 'persistState' };

/**
 * Base URL of Apify's API endpoints.
 */
export const APIFY_API_BASE_URL = 'https://api.apify.com/v2';

export const STATUS_CODES_BLOCKED = [401, 403, 429];
