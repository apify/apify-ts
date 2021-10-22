/* eslint-disable max-classes-per-file */
import { ActorRun } from './typedefs';

/** @internal */
export const APIFY_CALL_ERROR_NAME = 'ApifyCallError';

/**
 * The class represents exceptions thrown by the {@link Apify.call} function.
 *
 * @property message
 *   Error message
 * @property run
 *   Object representing the failed actor run.
 * @property name
 *   Contains `"ApifyCallError"`
 */
export class ApifyCallError extends Error {
    constructor(readonly run: Partial<ActorRun>, message = 'The actor invoked by Apify.call() did not succeed') {
        super(`${message} (run ID: ${run.id})`);
        this.name = APIFY_CALL_ERROR_NAME;
        Error.captureStackTrace(this, ApifyCallError);
    }
}

/**
 * TimeoutError class.
 * This error should be thrown after request timeout from `requestAsBrowser`.
 * @ignore
 */
export class TimeoutError extends Error {}
