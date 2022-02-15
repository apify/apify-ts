import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { ENV_VARS, ACTOR_EVENT_NAMES } from '@apify/consts';
import { ACTOR_EVENT_NAMES_EX } from './constants';
import { log as defaultLog } from './utils_log';
import { Configuration } from './configuration';

/**
 * Gets an instance of a Node.js'
 * [EventEmitter](https://nodejs.org/api/events.html#events_class_eventemitter)
 * class that emits various events from the SDK or the Apify platform.
 * The event emitter is initialized by calling the {@link Apify.main} function.
 *
 * **Example usage:**
 *
 * ```javascript
 * Apify.events.on('cpuInfo', (data) => {
 *   if (data.isCpuOverloaded) console.log('Oh no, the CPU is overloaded!');
 * });
 * ```
 *
 * The following events are emitted:
 *
 * - `cpuInfo`: `{ "isCpuOverloaded": Boolean }`
 *   The event is emitted approximately every second
 *   and it indicates whether the actor is using the maximum of available CPU resources.
 *   If that's the case, the actor should not add more workload.
 *   For example, this event is used by the {@link AutoscaledPool} class.
 * - `migrating`: `void`
 *   Emitted when the actor running on the Apify platform is going to be migrated to another worker server soon.
 *   You can use it to persist the state of the actor and abort the run, to speed up migration.
 *   For example, this is used by the {@link RequestList} class.
 * - `aborting`: `void`
 *   When a user aborts an actor run on the Apify platform, they can choose to abort gracefully to allow
 *   the actor some time before getting killed. This graceful abort emits the `aborting` event which the SDK
 *   uses to gracefully stop running crawls and you can use it to do your own cleanup as well.
 * - `persistState`: `{ "isMigrating": Boolean }`
 *   Emitted in regular intervals (by default 60 seconds) to notify all components of Apify SDK that it is time to persist
 *   their state, in order to avoid repeating all work when the actor restarts.
 *   This event is automatically emitted together with the `migrating` event,
 *   in which case the `isMigrating` flag is set to `true`. Otherwise the flag is `false`.
 *   Note that the `persistState` event is provided merely for user convenience,
 *   you can achieve the same effect using `setInterval()` and listening for the `migrating` event.
 */
export const events = new EventEmitter();

/**
 * Websocket connection to actor events.
 * @ignore
 */
let eventsWs: WebSocket | null = null;

/**
 * Interval that emits persist state events.
 * @type {*}
 * @ignore
 */
let persistStateInterval: any = null;

/**
 * Emits event telling all components that they should persist their state at regular intervals and also when an actor is being
 * migrated to another worker.
 *
 * @ignore
 */
const emitPersistStateEvent = (isMigrating = false) => {
    events.emit(ACTOR_EVENT_NAMES_EX.PERSIST_STATE, { isMigrating });
};

/**
 * Initializes `Apify.events` event emitter by creating a connection to a websocket that provides them.
 * This is an internal function that is automatically called by `Apify.main()`.
 * @ignore
 */
export function initializeEvents(config = Configuration.getGlobalConfig()) {
    if (eventsWs) return;

    const log = defaultLog.child({ prefix: 'Events' });

    if (!persistStateInterval) {
        const intervalMillis = config.get('persistStateIntervalMillis');
        persistStateInterval = setInterval(() => emitPersistStateEvent(), intervalMillis);
    }

    const eventsWsUrl = config.get('actorEventsWsUrl');

    // Locally there is no web socket to connect, so just print a log message.
    if (!eventsWsUrl) {
        log.debug(`Environment variable ${ENV_VARS.ACTOR_EVENTS_WS_URL} is not set, no events from Apify platform will be emitted.`);
        return;
    }

    eventsWs = new WebSocket(eventsWsUrl);
    eventsWs.on('message', (message) => {
        if (!message) return;

        try {
            const { name, data } = JSON.parse(String(message));

            events.emit(name, data);

            if (name === ACTOR_EVENT_NAMES.MIGRATING) {
                clearInterval(persistStateInterval); // Don't send any other persist state event.
                emitPersistStateEvent(true);
            }
        } catch (err) {
            log.exception(err as Error, 'Cannot parse actor event');
        }
    });
    eventsWs.on('error', (err) => {
        // Don't print this error as this happens in the case of very short Apify.main().
        if (err.message === 'WebSocket was closed before the connection was established') return;

        log.exception(err, 'web socket connection failed');
    });
    eventsWs.on('close', () => {
        log.warning('web socket has been closed');
        eventsWs = null;
    });
}

/**
 * Closes websocket providing events from Actor infrastructure and also stops sending internal events
 * of Apify package such as `persistState`.
 * This is automatically called at the end of `Apify.main()`.
 * @ignore
 */
export function stopEvents() {
    if (eventsWs) eventsWs.close();
    clearInterval(persistStateInterval);
    persistStateInterval = null;
}
