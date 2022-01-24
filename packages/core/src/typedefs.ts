/* eslint-disable @typescript-eslint/ban-types */

import { ActorRun } from 'apify-client';

/** @ignore */
export type Dictionary<T = unknown> = Record<PropertyKey, T>;

/** @ignore */
export type Constructor<T = unknown> = new (...args: any[]) => T;

/** @ignore */
export type Awaitable<T> = T | PromiseLike<T>;

/**
 * Represents information about an actor run, as returned by the {@link Apify.call} or {@link Apify.callTask} function.
 * The object is almost equivalent to the JSON response of the [Actor run](https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor)
 * Apify API endpoint and extended with certain fields. For more details, see [Runs.](https://docs.apify.com/actor/run)
 */
export interface ActorRunWithOutput extends ActorRun {
     /**
     * Contains output of the actor run. The value is `null` or `undefined` in case the actor is still running,
     * or if you pass `false` to the `fetchOutput` option of {@link Apify.call}.
     *
     * For example:
     * ```
     * {
     *   "contentType": "application/json; charset=utf-8",
     *   "body": {
     *     "message": "Hello world!"
     *   }
     * }
     * ```
     */
    output?: Dictionary | null;
}

/** @ignore */
export function entries<T extends {}>(obj: T) {
    return Object.entries(obj) as [keyof T, T[keyof T]][];
}

/** @ignore */
export function keys<T extends {}>(obj: T) {
    return Object.keys(obj) as (keyof T)[];
}
