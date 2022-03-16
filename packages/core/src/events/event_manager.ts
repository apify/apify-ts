import log from '@apify/log';
import { EventEmitter } from 'events';
import { betterClearInterval, BetterIntervalID, betterSetInterval } from '@apify/utilities';
import { Configuration } from '../configuration';

export enum EventType {
    PERSIST_STATE = 'persistState',
    SYSTEM_INFO = 'systemInfo',
    MIGRATING = 'migrating',
    ABORTING = 'aborting',
}

export abstract class EventManager {
    protected events = new EventEmitter();
    protected initialized = false;
    protected persistStateInterval?: BetterIntervalID;
    protected log = log.child({ prefix: 'Events' });

    constructor(readonly config = Configuration.getGlobalConfig()) {}

    /**
     * Initializes `Actor.events` event emitter by creating a connection to a websocket that provides them.
     * This is an internal function that is automatically called by `Actor.main()`.
     */
    async start() {
        if (this.initialized) {
            return;
        }

        const persistStateIntervalMillis = this.config.get('persistStateIntervalMillis')!;
        this.persistStateInterval = betterSetInterval((intervalCallback: () => unknown) => {
            this.emit(EventType.PERSIST_STATE, { isMigrating: false });
            intervalCallback();
        }, persistStateIntervalMillis);
        this.initialized = true;
    }

    /**
     * Closes websocket providing events from Actor infrastructure and also stops sending internal events
     * of Apify package such as `persistState`. This is automatically called at the end of `Actor.main()`.
     */
    async stop() {
        if (!this.initialized) {
            return;
        }

        betterClearInterval(this.persistStateInterval!);
        this.initialized = false;
    }

    on(event: EventType, listener: (...args: any[]) => any): void {
        this.events.on(event, listener);
    }

    off(event: EventType, listener?: (...args: any[]) => any): void {
        if (listener) {
            this.events.removeListener(event, listener);
        } else {
            this.events.removeAllListeners(event);
        }
    }

    emit(event: EventType, ...args: unknown[]): void {
        this.events.emit(event, ...args);
    }

    /**
     * @internal
     */
    listenerCount(event: EventType): number {
        return this.events.listenerCount(event);
    }
}
