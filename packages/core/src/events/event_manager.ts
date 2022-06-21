import log from '@apify/log';
import { EventEmitter } from 'node:events';
import type { BetterIntervalID } from '@apify/utilities';
import { betterClearInterval, betterSetInterval } from '@apify/utilities';
import { Configuration } from '../configuration';

export const enum EventType {
    PERSIST_STATE = 'persistState',
    SYSTEM_INFO = 'systemInfo',
    MIGRATING = 'migrating',
    ABORTING = 'aborting',
    EXIT = 'exit',
}

export type EventTypeName = EventType | 'systemInfo' | 'persistState' | 'migrating' | 'aborting' | 'exit';

interface Intervals {
    persistState?: BetterIntervalID;
    systemInfo?: BetterIntervalID;
}

export abstract class EventManager {
    protected events = new EventEmitter();
    protected initialized = false;
    protected intervals: Intervals = {};
    protected log = log.child({ prefix: 'Events' });

    constructor(readonly config = Configuration.getGlobalConfig()) {}

    /**
     * Initializes `Actor.events` event emitter by creating a connection to a websocket that provides them.
     * This is an internal function that is automatically called by `Actor.main()`.
     */
    async init() {
        if (this.initialized) {
            return;
        }

        const persistStateIntervalMillis = this.config.get('persistStateIntervalMillis')!;
        this.intervals.persistState = betterSetInterval((intervalCallback: () => unknown) => {
            this.emit(EventType.PERSIST_STATE, { isMigrating: false });
            intervalCallback();
        }, persistStateIntervalMillis);
        this.initialized = true;
    }

    /**
     * Closes websocket providing events from Actor infrastructure and also stops sending internal events
     * of Apify package such as `persistState`. This is automatically called at the end of `Actor.main()`.
     */
    async close() {
        if (!this.initialized) {
            return;
        }

        betterClearInterval(this.intervals.persistState!);
        this.initialized = false;
    }

    on(event: EventTypeName, listener: (...args: any[]) => any): void {
        this.events.on(event, listener);
    }

    off(event: EventTypeName, listener?: (...args: any[]) => any): void {
        if (listener) {
            this.events.removeListener(event, listener);
        } else {
            this.events.removeAllListeners(event);
        }
    }

    emit(event: EventTypeName, ...args: unknown[]): void {
        this.events.emit(event, ...args);
    }

    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * @internal
     */
    listenerCount(event: EventTypeName): number {
        return this.events.listenerCount(event);
    }

    /**
     * @internal
     */
    listeners(event: EventTypeName): (() => Promise<unknown>)[] {
        return this.events.listeners(event) as (() => Promise<unknown>)[];
    }
}
