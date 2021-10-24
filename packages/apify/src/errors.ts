/* eslint-disable max-classes-per-file */
import { ActorRun } from './typedefs';

/** @internal */
export const APIFY_CALL_ERROR_NAME = 'ApifyCallError';

/**
 * The class represents exceptions thrown by the {@link Apify.call} function.
 */
export class ApifyCallError extends Error {
    /** Contains `"ApifyCallError"` */
    override name = APIFY_CALL_ERROR_NAME;

    /** Object representing the failed actor run. */
    readonly run: Partial<ActorRun>

    /**
     * @param run Object representing the failed actor run.
     * @param message Error message
     */
    constructor(run: Partial<ActorRun>, message = 'The actor invoked by Apify.call() did not succeed') {
        super(`${message} (run ID: ${run.id})`);
        this.run = run;
        Error.captureStackTrace(this, ApifyCallError);
    }
}

/**
 * TimeoutError class.
 * This error should be thrown after request timeout from `requestAsBrowser`.
 * @ignore
 */
export class TimeoutError extends Error {}
