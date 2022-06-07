import { Dictionary } from '@crawlee/types';
import { Log } from '../log';
import { ProxyInfo } from '../proxy_configuration';
import { Request } from '../request';
import { Session } from '../session_pool/session';

export interface CrawlingContext<UserData extends Dictionary = Dictionary> extends Record<PropertyKey, unknown> {
    id: string;
    /**
     * The original {@link Request} object.
     */
    request: Request<UserData>;
    session?: Session;

    /**
     * An object with information about currently used proxy by the crawler
     * and configured by the {@link ProxyConfiguration} class.
     */
    proxyInfo?: ProxyInfo;
    log: Log;
}

export interface FailedRequestContext<Crawler = unknown, UserData extends Dictionary = Dictionary> extends CrawlingContext<UserData> {
    /**
     * The Error thrown by `requestHandler`.
     */
    error: Error;

    /**
     * Current crawler instance.
     */
    crawler: Crawler;
}
