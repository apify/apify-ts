import ow from 'ow';
import path from 'path';
import _ from 'underscore';
import { ACT_JOB_STATUSES, ENV_VARS, INTEGER_ENV_VARS, WEBHOOK_EVENT_TYPES } from '@apify/consts';
import log from './utils_log';
import { EXIT_CODES } from './constants';
import { initializeEvents, stopEvents } from './events';
import { addCharsetToContentType, apifyClient, isAtHome, logSystemInfo, newClient, printOutdatedSdkWarning, sleep, snakeCaseToCamelCase } from './utils';
import { maybeStringify } from './storages/key_value_store';
import { ActorRun, Awaitable, Dictionary } from './typedefs';
import { ApifyCallError } from './errors';
import { MetamorphOptions } from './apify';

const METAMORPH_AFTER_SLEEP_MILLIS = 300000;

/**
 * Tries to parse a string with date.
 * Returns either a Date object or undefined
 *
 * @ignore
 */
const tryParseDate = (str) => {
    const unix = Date.parse(str);
    return unix > 0 ? new Date(unix) : undefined;
};

/**
 * Parsed representation of the `APIFY_XXX` environmental variables.
 * This object is returned by the {@link Apify.getEnv} function.
 */
export interface ApifyEnv {
    /**
     * ID of the actor (APIFY_ACTOR_ID)
     */
    actorId: string | null;

    /**
     * ID of the actor run (APIFY_ACTOR_RUN_ID)
     */
    actorRunId: string | null;

    /**
     * ID of the actor task (APIFY_ACTOR_TASK_ID)
     */
    actorTaskId: string | null;

    /**
     * ID of the user who started the actor - note that it might be
     * different than the owner ofthe actor (APIFY_USER_ID)
     */
    userId: string | null;

    /**
     * Authentication token representing privileges given to the actor run,
     * it can be passed to various Apify APIs (APIFY_TOKEN)
     */
    token: string | null;

    /**
     * Date when the actor was started (APIFY_STARTED_AT)
     */
    startedAt: Date | null;

    /**
     * Date when the actor will time out (APIFY_TIMEOUT_AT)
     */
    timeoutAt: Date | null;

    /**
     * ID of the key-value store where input and output data of this
     * actor is stored (APIFY_DEFAULT_KEY_VALUE_STORE_ID)
     */
    defaultKeyValueStoreId: string | null;

    /**
     * ID of the dataset where input and output data of this
     * actor is stored (APIFY_DEFAULT_DATASET_ID)
     */
    defaultDatasetId: string | null;

    /**
     * Amount of memory allocated for the actor,
     * in megabytes (APIFY_MEMORY_MBYTES)
     */
    memoryMbytes: number | null;
}

export type EventType = (typeof WEBHOOK_EVENT_TYPES)[keyof typeof WEBHOOK_EVENT_TYPES];

/**
 * Returns a new {@link ApifyEnv} object which contains information parsed from all the `APIFY_XXX` environment variables.
 *
 * For the list of the `APIFY_XXX` environment variables, see
 * [Actor documentation](https://docs.apify.com/actor/run#environment-variables).
 * If some of the variables are not defined or are invalid, the corresponding value in the resulting object will be null.
 */
export function getEnv(): ApifyEnv {
    // NOTE: Don't throw if env vars are invalid to simplify local development and debugging of actors
    const env = process.env || {};
    const envVars = {} as ApifyEnv;

    _.mapObject(ENV_VARS, (fullName, shortName) => {
        const camelCaseName = snakeCaseToCamelCase(shortName);
        let value: string | number | Date | undefined = env[fullName];

        // Parse dates and integers.
        if (value && fullName.endsWith('_AT')) value = tryParseDate(value);
        else if (_.contains(INTEGER_ENV_VARS, fullName)) value = parseInt(value!, 10);

        envVars[camelCaseName] = value || value === 0
            ? value
            : null;
    });

    return envVars;
}

export type UserFunc = () => Awaitable<void>;

/**
 * Runs the main user function that performs the job of the actor
 * and terminates the process when the user function finishes.
 *
 * **The `Apify.main()` function is optional** and is provided merely for your convenience.
 * It is mainly useful when you're running your code as an actor on the [Apify platform](https://apify.com/actors).
 * However, if you want to use Apify SDK tools directly inside your existing projects, e.g.
 * running in an [Express](https://expressjs.com/) server, on
 * [Google Cloud functions](https://cloud.google.com/functions)
 * or [AWS Lambda](https://aws.amazon.com/lambda/), it's better to avoid
 * it since the function terminates the main process when it finishes!
 *
 * The `Apify.main()` function performs the following actions:
 *
 * - When running on the Apify platform (i.e. `APIFY_IS_AT_HOME` environment variable is set),
 *   it sets up a connection to listen for platform events.
 *   For example, to get a notification about an imminent migration to another server.
 *   See {@link Apify.events} for details.
 * - It checks that either `APIFY_TOKEN` or `APIFY_LOCAL_STORAGE_DIR` environment variable
 *   is defined. If not, the functions sets `APIFY_LOCAL_STORAGE_DIR` to `./apify_storage`
 *   inside the current working directory. This is to simplify running code examples.
 * - It invokes the user function passed as the `userFunc` parameter.
 * - If the user function returned a promise, waits for it to resolve.
 * - If the user function throws an exception or some other error is encountered,
 *   prints error details to console so that they are stored to the log.
 * - Exits the Node.js process, with zero exit code on success and non-zero on errors.
 *
 * The user function can be synchronous:
 *
 * ```javascript
 * Apify.main(() => {
 *   // My synchronous function that returns immediately
 *   console.log('Hello world from actor!');
 * });
 * ```
 *
 * If the user function returns a promise, it is considered asynchronous:
 * ```javascript
 * const { requestAsBrowser } = require('some-request-library');
 *
 * Apify.main(() => {
 *   // My asynchronous function that returns a promise
 *   return request('http://www.example.com').then((html) => {
 *     console.log(html);
 *   });
 * });
 * ```
 *
 * To simplify your code, you can take advantage of the `async`/`await` keywords:
 *
 * ```javascript
 * const request = require('some-request-library');
 *
 * Apify.main(async () => {
 *   // My asynchronous function
 *   const html = await request('http://www.example.com');
 *   console.log(html);
 * });
 * ```
 *
 * @param userFunc User function to be executed. If it returns a promise,
 * the promise will be awaited. The user function is called with no arguments.
 */
export function main(userFunc: UserFunc): void {
    if (!userFunc || typeof userFunc !== 'function') {
        throw new Error(`Apify.main() accepts a single parameter that must be a function (was '${userFunc === null ? 'null' : typeof (userFunc)}').`);
    }

    // Logging some basic system info (apify and apify-client version, NodeJS version, ...).
    logSystemInfo();

    // Log warning if SDK is outdated.
    printOutdatedSdkWarning();

    if (!process.env[ENV_VARS.LOCAL_STORAGE_DIR] && !process.env[ENV_VARS.TOKEN]) {
        const dir = path.join(process.cwd(), './apify_storage');
        process.env[ENV_VARS.LOCAL_STORAGE_DIR] = dir;
        log.warning(`Neither ${ENV_VARS.LOCAL_STORAGE_DIR} nor ${ENV_VARS.TOKEN} environment variable is set, defaulting to ${ENV_VARS.LOCAL_STORAGE_DIR}="${dir}"`); // eslint-disable-line max-len
    }

    // This is to enable unit tests where process.exit() is mocked and doesn't really exit the process
    // Note that mocked process.exit() might throw, so set exited flag before calling it to avoid confusion.
    let exited = false;
    const exitWithError = (err, exitCode) => {
        log.exception(err, '');
        exited = true;
        // console.log(`Exiting with code: ${exitCode}`);
        process.exit(exitCode);
    };

    // Set dummy interval to ensure the process will not be killed while awaiting empty promise:
    // await new Promise(() => {})
    // Such a construct is used for testing of actor timeouts and aborts.
    const intervalId = setInterval(_.noop, 9999999);

    // Using async here to have nice stack traces for errors
    const run = async () => {
        initializeEvents();
        try {
            await userFunc();

            stopEvents();
            clearInterval(intervalId);
            if (!exited) {
                process.exit(EXIT_CODES.SUCCESS);
            }
        } catch (err) {
            stopEvents();
            clearInterval(intervalId);
            if (!exited) {
                exitWithError(err, EXIT_CODES.ERROR_USER_FUNCTION_THREW);
            }
        }
    };

    run().catch((err) => {
        exitWithError(err, EXIT_CODES.ERROR_UNKNOWN);
    });
}

export interface CallOptions {
    /**
     * Content type for the `input`. If not specified,
     * `input` is expected to be an object that will be stringified to JSON and content type set to
     * `application/json; charset=utf-8`. If `options.contentType` is specified, then `input` must be a
     * `String` or `Buffer`.
     */
    contentType?: string;

    /**
     * User API token that is used to run the actor. By default, it is taken from the `APIFY_TOKEN` environment variable.
     */
    token?: string;

    /**
     * Memory in megabytes which will be allocated for the new actor run.
     * If not provided, the run uses memory of the default actor run configuration.
     */
    memoryMbytes?: number;

    /**
     * Timeout for the actor run in seconds. Zero value means there is no timeout.
     * If not provided, the run uses timeout of the default actor run configuration.
     */
    timeoutSecs?: number;

    /**
     * Tag or number of the actor build to run (e.g. `beta` or `1.2.345`).
     * If not provided, the run uses build tag or number from the default actor run configuration (typically `latest`).
     */
    build?: string;

    /**
     * Maximum time to wait for the actor run to finish, in seconds.
     * If the limit is reached, the returned promise is resolved to a run object that will have
     * status `READY` or `RUNNING` and it will not contain the actor run output.
     * If `waitSecs` is null or undefined, the function waits for the actor to finish (default behavior).
     */
    waitSecs?: number;

    /**
     * If `false` then the function does not fetch output of the actor.
     * @default true
     */
    fetchOutput?: boolean;

    /**
     * If `true` then the function will not attempt to parse the
     * actor's output and will return it in a raw `Buffer`.
     * @default false
     */
    disableBodyParser?: boolean;

    /**
     * Specifies optional webhooks associated with the actor run, which can be used
     * to receive a notification e.g. when the actor finished or failed, see
     * [ad hook webhooks documentation](https://docs.apify.com/webhooks/ad-hoc-webhooks) for detailed description.
     */
    webhooks?: readonly WebhookOptions[];
}

/**
 * Runs an actor on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable),
 * waits for the actor to finish and fetches its output.
 *
 * By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish.
 * If the value is less than or equal to zero, the function returns immediately after the run is started.
 *
 * The result of the function is an {@link ActorRun} object
 * that contains details about the actor run and its output (if any).
 * If the actor run fails, the function throws the {@link ApifyCallError} exception.
 *
 * If you want to run an actor task rather than an actor, please use the
 * {@link Apify.callTask} function instead.
 *
 * For more information about actors, read the
 * [documentation](https://docs.apify.com/actor).
 *
 * **Example usage:**
 *
 * ```javascript
 * const run = await Apify.call('apify/hello-world', { myInput: 123 });
 * console.log(`Received message: ${run.output.body.message}`);
 * ```
 *
 * Internally, the `call()` function invokes the
 * [Run actor](https://apify.com/docs/api/v2#/reference/actors/run-collection/run-actor)
 * and several other API endpoints to obtain the output.
 *
 * @param actId
 *  Allowed formats are `username/actor-name`, `userId/actor-name` or actor ID.
 * @param [input]
 *  Input for the actor. If it is an object, it will be stringified to
 *  JSON and its content type set to `application/json; charset=utf-8`.
 *  Otherwise the `options.contentType` parameter must be provided.
 * @param [options]
 * @throws {ApifyCallError} If the run did not succeed, e.g. if it failed or timed out.
 */
export async function call(actId: string, input?: Dictionary | string, options: CallOptions = {}): Promise<ActorRun> {
    ow(actId, ow.string);
    // input can be anything, no reason to validate
    ow(options, ow.object.exactShape({
        contentType: ow.optional.string.nonEmpty,
        token: ow.optional.string,
        memoryMbytes: ow.optional.number.not.negative,
        timeoutSecs: ow.optional.number.not.negative,
        build: ow.optional.string,
        waitSecs: ow.optional.number.not.negative,
        fetchOutput: ow.optional.boolean,
        disableBodyParser: ow.optional.boolean,
        webhooks: ow.optional.array.ofType(ow.object),
    }));

    const {
        token,
        fetchOutput = true,
        disableBodyParser = false,
        memoryMbytes,
        timeoutSecs,
        ...callActorOpts
    } = options;

    // @ts-ignore should this be public?
    callActorOpts.memory = memoryMbytes;
    // @ts-ignore should this be public?
    callActorOpts.timeout = timeoutSecs;

    if (input) {
        callActorOpts.contentType = addCharsetToContentType(callActorOpts.contentType);
        input = maybeStringify(input, callActorOpts);
    }

    const client = token ? newClient({ token }) : apifyClient;

    let run;
    try {
        run = await client.actor(actId).call(input, callActorOpts);
    } catch (err) {
        if (err.message.startsWith('Waiting for run to finish')) {
            throw new ApifyCallError({ id: run.id, actId: run.actId }, 'Apify.call() failed, cannot fetch actor run details from the server');
        }
        throw err;
    }

    if (isRunUnsuccessful(run.status)) {
        const message = `The actor ${actId} invoked by Apify.call() did not succeed. For details, see https://my.apify.com/view/runs/${run.id}`;
        throw new ApifyCallError(run, message);
    }

    // Finish if output is not requested or run haven't finished.
    if (!fetchOutput || run.status !== ACT_JOB_STATUSES.SUCCEEDED) return run;

    // Fetch output.
    let getRecordOptions = {} as { buffer: true };
    if (disableBodyParser) getRecordOptions = { buffer: true };

    // TODO the second parameter of `getRecord` requires literal `true` type, we should relax on that as its tedious to use in real life
    const actorOutput = await client.keyValueStore(run.defaultKeyValueStoreId).getRecord('OUTPUT', getRecordOptions);
    const result = { ...run };
    if (actorOutput) {
        result.output = {
            body: actorOutput.value,
            contentType: actorOutput.contentType,
        };
    }

    return result;
}

export interface CallTaskOptions {
    /**
     * User API token that is used to run the actor. By default, it is taken from the `APIFY_TOKEN` environment variable.
     */
    token?: string;

    /**
     * Memory in megabytes which will be allocated for the new actor task run.
     * If not provided, the run uses memory of the default actor run configuration.
     */
    memoryMbytes?: number;

    /**
     * Timeout for the actor task run in seconds. Zero value means there is no timeout.
     * If not provided, the run uses timeout of the default actor run configuration.
     */
    timeoutSecs?: number;

    /**
     * Tag or number of the actor build to run (e.g. `beta` or `1.2.345`).
     * If not provided, the run uses build tag or number from the default actor run configuration (typically `latest`).
     */
    build?: string;

    /**
     * Maximum time to wait for the actor task run to finish, in seconds.
     * If the limit is reached, the returned promise is resolved to a run object that will have
     * status `READY` or `RUNNING` and it will not contain the actor run output.
     * If `waitSecs` is null or undefined, the function waits for the actor task to finish (default behavior).
     */
    waitSecs?: number;

    /**
     * If `false` then the function does not fetch output of the actor.
     * @default true
     */
    fetchOutput?: boolean;

    /**
     * If `true` then the function will not attempt to parse the
     * actor's output and will return it in a raw `Buffer`.
     * @default false
     */
    disableBodyParser?: boolean;

    /**
     * Specifies optional webhooks associated with the actor run, which can be used
     * to receive a notification e.g. when the actor finished or failed, see
     * [ad hook webhooks documentation](https://docs.apify.com/webhooks/ad-hoc-webhooks) for detailed description.
     */
    webhooks?: readonly WebhookOptions[];
}

/**
 * Runs an actor task on the Apify platform using the current user account (determined by the `APIFY_TOKEN` environment variable),
 * waits for the task to finish and fetches its output.
 *
 * By passing the `waitSecs` option you can reduce the maximum amount of time to wait for the run to finish.
 * If the value is less than or equal to zero, the function returns immediately after the run is started.
 *
 * The result of the function is an {@link ActorRun} object
 * that contains details about the actor run and its output (if any).
 * If the actor run failed, the function fails with {@link ApifyCallError} exception.
 *
 * Note that an actor task is a saved input configuration and options for an actor.
 * If you want to run an actor directly rather than an actor task, please use the
 * {@link Apify.call} function instead.
 *
 * For more information about actor tasks, read the [documentation](https://docs.apify.com/tasks).
 *
 * **Example usage:**
 *
 * ```javascript
 * const run = await Apify.callTask('bob/some-task');
 * console.log(`Received message: ${run.output.body.message}`);
 * ```
 *
 * Internally, the `callTask()` function calls the
 * [Run task](https://apify.com/docs/api/v2#/reference/actor-tasks/run-collection/run-task)
 * and several other API endpoints to obtain the output.
 *
 * @param taskId
 *  Allowed formats are `username/task-name`, `userId/task-name` or task ID.
 * @param [input]
 *  Input overrides for the actor task. If it is an object, it will be stringified to
 *  JSON and its content type set to `application/json; charset=utf-8`.
 *  Provided input will be merged with actor task input.
 * @param [options]
 * @throws {ApifyCallError} If the run did not succeed, e.g. if it failed or timed out.
 */
export async function callTask(taskId: string, input?: Dictionary | string, options: CallTaskOptions = {}): Promise<ActorRun> {
    ow(taskId, ow.string);
    ow(input, ow.optional.any(ow.string, ow.object));
    ow(options, ow.object.exactShape({
        token: ow.optional.string,
        memoryMbytes: ow.optional.number.not.negative,
        timeoutSecs: ow.optional.number.not.negative,
        build: ow.optional.string,
        waitSecs: ow.optional.number.not.negative,
        fetchOutput: ow.optional.boolean,
        disableBodyParser: ow.optional.boolean,
        webhooks: ow.optional.array.ofType(ow.object),
    }));

    const {
        token,
        fetchOutput = true,
        disableBodyParser = false,
        memoryMbytes,
        timeoutSecs,
        ...callTaskOpts
    } = options;

    // @ts-ignore should this be public?
    callTaskOpts.memory = memoryMbytes;
    // @ts-ignore should this be public?
    callTaskOpts.timeout = timeoutSecs;

    const client = token ? newClient({ token }) : apifyClient;
    // Start task and wait for run to finish if waitSecs is provided
    let run;
    try {
        // FIXME we should probably get rid of the `JsonObject` in client types as its not compatible with `Record`
        run = await client.task(taskId).call(input as any, callTaskOpts);
    } catch (err) {
        if (err.message.startsWith('Waiting for run to finish')) {
            throw new ApifyCallError({ id: run.id, actId: run.actId }, 'Apify.call() failed, cannot fetch actor run details from the server');
        }
        throw err;
    }

    if (isRunUnsuccessful(run.status)) {
        // TODO It should be callTask in the message, but I'm keeping it this way not to introduce a breaking change.
        const message = `The actor task ${taskId} invoked by Apify.call() did not succeed. For details, see https://my.apify.com/view/runs/${run.id}`;
        throw new ApifyCallError(run, message);
    }

    // Finish if output is not requested or run haven't finished.
    if (!fetchOutput || run.status !== ACT_JOB_STATUSES.SUCCEEDED) return run;

    // Fetch output.
    let getRecordOptions = {} as { buffer: true };
    if (disableBodyParser) getRecordOptions = { buffer: true };

    const actorOutput = await client.keyValueStore(run.defaultKeyValueStoreId).getRecord('OUTPUT', getRecordOptions);
    const result = { ...run };
    if (actorOutput) {
        result.output = {
            body: actorOutput.value,
            contentType: actorOutput.contentType,
        };
    }

    return result;
}

function isRunUnsuccessful(status) {
    return status !== ACT_JOB_STATUSES.SUCCEEDED
        && status !== ACT_JOB_STATUSES.RUNNING
        && status !== ACT_JOB_STATUSES.READY;
}

/**
 * Transforms this actor run to an actor run of a given actor. The system stops the current container and starts the new container
 * instead. All the default storages are preserved and the new input is stored under the `INPUT-METAMORPH-1` key in the same default key-value store.
 *
 * @param targetActorId
 *  Either `username/actor-name` or actor ID of an actor to which we want to metamorph.
 * @param [input]
 *  Input for the actor. If it is an object, it will be stringified to
 *  JSON and its content type set to `application/json; charset=utf-8`.
 *  Otherwise the `options.contentType` parameter must be provided.
 * @param [options]
 */
export async function metamorph(targetActorId: string, input: Dictionary | string, options: MetamorphOptions = {}): Promise<void> {
    ow(targetActorId, ow.string);
    // input can be anything, no reason to validate
    ow(options, ow.object.exactShape({
        contentType: ow.optional.string.nonEmpty,
        build: ow.optional.string,
        customAfterSleepMillis: ow.optional.number.not.negative,
    }));

    const {
        customAfterSleepMillis,
        ...metamorphOpts
    } = options;

    const actorId = process.env[ENV_VARS.ACTOR_ID];
    const runId = process.env[ENV_VARS.ACTOR_RUN_ID];
    if (!actorId) throw new Error(`Environment variable ${ENV_VARS.ACTOR_ID} must be provided!`);
    if (!runId) throw new Error(`Environment variable ${ENV_VARS.ACTOR_RUN_ID} must be provided!`);

    if (input) {
        metamorphOpts.contentType = addCharsetToContentType(metamorphOpts.contentType);
        input = maybeStringify(input, metamorphOpts);
    }

    // @ts-ignore run has only one argument?
    await apifyClient.run(runId, actorId).metamorph(targetActorId, input, metamorphOpts);

    // Wait some time for container to be stopped.
    // NOTE: option.customAfterSleepMillis is used in tests
    await sleep(customAfterSleepMillis || METAMORPH_AFTER_SLEEP_MILLIS);
}

export interface WebhookRun {
    id: string;
    createdAt: string;
    modifiedAt: string;
    userId: string;
    isAdHoc: boolean;
    eventTypes: readonly EventType[];
    condition: any;
    ignoreSslErrors: boolean;
    doNotRetry: boolean;
    requestUrl: string;
    payloadTemplate: string;
    lastDispatch: any;
    stats: any;
}

export interface WebhookOptions {
    /**
     * Array of event types, which you can set for actor run, see
     * the [actor run events](https://docs.apify.com/webhooks/events#actor-run) in the Apify doc.
     */
    eventTypes: readonly EventType[];

    /**
     * URL which will be requested using HTTP POST request, when actor run will reach the set event type.
     */
    requestUrl: string;

    /**
     * Payload template is a JSON-like string that describes the structure of the webhook POST request payload.
     * It uses JSON syntax, extended with a double curly braces syntax for injecting variables `{{variable}}`.
     * Those variables are resolved at the time of the webhook's dispatch, and a list of available variables with their descriptions
     * is available in the [Apify webhook documentation](https://docs.apify.com/webhooks).
     * If `payloadTemplate` is omitted, the default payload template is used
     * ([view docs](https://docs.apify.com/webhooks/actions#payload-template)).
     */
    payloadTemplate?: string;

    /**
     * Idempotency key enables you to ensure that a webhook will not be added multiple times in case of
     * an actor restart or other situation that would cause the `addWebhook()` function to be called again.
     * We suggest using the actor run ID as the idempotency key. You can get the run ID by calling
     * {@link Apify.getEnv} function.
     */
    idempotencyKey?: string;
}

/**
 * Creates an ad-hoc webhook for the current actor run, which lets you receive a notification when the actor run finished or failed.
 * For more information about Apify actor webhooks, please see the [documentation](https://docs.apify.com/webhooks).
 *
 * Note that webhooks are only supported for actors running on the Apify platform.
 * In local environment, the function will print a warning and have no effect.
 *
 * @param options
 * @return {Promise<WebhookRun | undefined>} The return value is the Webhook object.
 * For more information, see the [Get webhook](https://apify.com/docs/api/v2#/reference/webhooks/webhook-object/get-webhook) API endpoint.
 */
export async function addWebhook(options: WebhookOptions): Promise<WebhookRun | undefined> {
    ow(options, ow.object.exactShape({
        eventTypes: ow.array.ofType(ow.string),
        requestUrl: ow.string,
        payloadTemplate: ow.optional.string,
        idempotencyKey: ow.optional.string,
    }));

    const { eventTypes, requestUrl, payloadTemplate, idempotencyKey } = options;

    if (!isAtHome()) {
        log.warning('Apify.addWebhook() is only supported when running on the Apify platform. The webhook will not be invoked.');
        return undefined;
    }

    const runId = process.env[ENV_VARS.ACTOR_RUN_ID];
    if (!runId) {
        throw new Error(`Environment variable ${ENV_VARS.ACTOR_RUN_ID} is not set!`);
    }

    // @ts-ignore client types for `eventTypes` are wrong, we want to use the same fixed definition as here in the SDK
    return apifyClient.webhooks().create({
        isAdHoc: true,
        // @ts-ignore ow is messing up the types
        eventTypes,
        condition: {
            actorRunId: runId,
        },
        requestUrl,
        payloadTemplate,
        idempotencyKey,
    });
}
