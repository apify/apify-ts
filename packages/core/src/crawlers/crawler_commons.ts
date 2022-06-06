import { Log } from '../log';
import { ProxyInfo } from '../proxy_configuration';
import { Request } from '../request';
import { Session } from '../session_pool/session';
import { Dictionary } from '../typedefs';

export interface CrawlingContext<UserData extends Dictionary<any> = Dictionary<any>> extends Record<PropertyKey, unknown> {
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

export interface CrawlerHandleFailedRequestInput extends CrawlingContext {
    /**
     * The Error thrown by `requestHandler`.
     */
    error: Error;
}
