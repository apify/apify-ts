import { APIFY_PROXY_VALUE_REGEX, ENV_VARS } from '@apify/consts';
import ow from 'ow';
import { COUNTRY_CODE_REGEX } from './constants';
import { apifyClient } from './utils';
import { requestAsBrowser, RequestAsBrowserOptions } from './utils_request';
import defaultLog from './utils_log';
import { Configuration } from './configuration';

// CONSTANTS
const PROTOCOL = 'http';
// https://docs.apify.com/proxy/datacenter-proxy#username-parameters
const MAX_SESSION_ID_LENGTH = 50;
const CHECK_ACCESS_REQUEST_TIMEOUT_MILLIS = 4_000;
const CHECK_ACCESS_MAX_ATTEMPTS = 2;

export interface ProxyConfigurationFunction {
    (sessionId: string | number): string;
}

export interface ProxyConfigurationOptions {
    /**
     * User's password for the proxy. By default, it is taken from the `APIFY_PROXY_PASSWORD`
     * environment variable, which is automatically set by the system when running the actors.
     */
    password?: string;

    /**
     * An array of proxy groups to be used by the [Apify Proxy](https://docs.apify.com/proxy).
     * If not provided, the proxy will select the groups automatically.
     */
    groups?: string[];

    /**
     * If set and relevant proxies are available in your Apify account, all proxied requests will
     * use IP addresses that are geolocated to the specified country. For example `GB` for IPs
     * from Great Britain. Note that online services often have their own rules for handling
     * geolocation and thus the country selection is a best attempt at geolocation, rather than
     * a guaranteed hit. This parameter is optional, by default, each proxied request is assigned
     * an IP address from a random country. The country code needs to be a two letter ISO country code. See the
     * [full list of available country codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#Officially_assigned_code_elements).
     * This parameter is optional, by default, the proxy uses all available proxy servers from all countries.
     * on the Apify cloud, or when using the [Apify CLI](https://github.com/apify/apify-cli).
     */
    countryCode?: string;

    /**
     * Same option as `groups` which can be used to
     * configurate the proxy by UI input schema. You should use the `groups` option in your crawler code.
     */
    apifyProxyGroups?: string[];

    /**
     * Same option as `countryCode` which can be used to
     * configurate the proxy by UI input schema. You should use the `countryCode` option in your crawler code.
     */
    apifyProxyCountry?: string;

    /**
     * An array of custom proxy URLs to be rotated.
     * Custom proxies are not compatible with Apify Proxy and an attempt to use both
     * configuration options will cause an error to be thrown on initialize.
     */
    proxyUrls?: string[];

    /**
     * Custom function that allows you to generate the new proxy URL dynamically. It gets the `sessionId` as a parameter
     * and should always return stringified proxy URL.
     * This function is used to generate the URL when {@link ProxyConfiguration.newUrl} or {@link ProxyConfiguration.newProxyInfo} is called.
     */
    newUrlFunction?: ProxyConfigurationFunction;
}

/**
 * The main purpose of the ProxyInfo object is to provide information
 * about the current proxy connection used by the crawler for the request.
 * Outside of crawlers, you can get this object by calling {@link ProxyConfiguration.newProxyInfo}.
 *
 * **Example usage:**
 *
 * ```javascript
 *
 * const proxyConfiguration = await Apify.createProxyConfiguration({
 *   groups: ['GROUP1', 'GROUP2'] // List of Apify Proxy groups
 *   countryCode: 'US',
 * });
 *
 * // Getting proxyInfo object by calling class method directly
 * const proxyInfo = proxyConfiguration.newProxyInfo();
 *
 * // In crawler
 * const crawler = new Apify.CheerioCrawler({
 *   // ...
 *   proxyConfiguration,
 *   handlePageFunction: ({ proxyInfo }) => {
 *      // Getting used proxy URL
 *       const proxyUrl = proxyInfo.url;
 *
 *      // Getting ID of used Session
 *       const sessionIdentifier = proxyInfo.sessionId;
 *   }
 * })
 *
 * ```
 */
export interface ProxyInfo {
    /**
     * The identifier of used {@link Session}, if used.
     */
    sessionId?: string;

    /**
     * The URL of the proxy.
     */
    url: string;

    /**
     * An array of proxy groups to be used by the [Apify Proxy](https://docs.apify.com/proxy).
     * If not provided, the proxy will select the groups automatically.
     */
    groups: string[];

    /**
     * If set and relevant proxies are available in your Apify account, all proxied requests will
     * use IP addresses that are geolocated to the specified country. For example `GB` for IPs
     * from Great Britain. Note that online services often have their own rules for handling
     * geolocation and thus the country selection is a best attempt at geolocation, rather than
     * a guaranteed hit. This parameter is optional, by default, each proxied request is assigned
     * an IP address from a random country. The country code needs to be a two letter ISO country code. See the
     * [full list of available country codes](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2#Officially_assigned_code_elements).
     * This parameter is optional, by default, the proxy uses all available proxy servers from all countries.
     */
    countryCode?: string;

    /**
     * User's password for the proxy. By default, it is taken from the `APIFY_PROXY_PASSWORD`
     * environment variable, which is automatically set by the system when running the actors
     * on the Apify cloud, or when using the [Apify CLI](https://github.com/apify/apify-cli).
     */
    password: string;

    /**
     * Hostname of your proxy.
     */
    hostname: string;

    /**
     * Proxy port.
     */
    port: string;
}

/**
 * Configures connection to a proxy server with the provided options. Proxy servers are used to prevent target websites from blocking
 * your crawlers based on IP address rate limits or blacklists. Setting proxy configuration in your crawlers automatically configures
 * them to use the selected proxies for all connections. You can get information about the currently used proxy by inspecting
 * the {@link ProxyInfo} property in your crawler's page function. There, you can inspect the proxy's URL and other attributes.
 *
 * The proxy servers are managed by [Apify Proxy](https://docs.apify.com/proxy). To be able to use Apify Proxy,
 * you need an Apify account and access to the selected proxies. If you provide no configuration option,
 * the proxies will be managed automatically using a smart algorithm.
 *
 * If you want to use your own proxies, use the {@link ProxyConfigurationOptions.proxyUrls} option. Your list of proxy URLs will
 * be rotated by the configuration if this option is provided.
 *
 * **Example usage:**
 *
 * ```javascript
 *
 * const proxyConfiguration = await Apify.createProxyConfiguration({
 *   groups: ['GROUP1', 'GROUP2'] // List of Apify Proxy groups
 *   countryCode: 'US',
 * });
 *
 * const crawler = new Apify.CheerioCrawler({
 *   // ...
 *   proxyConfiguration,
 *   handlePageFunction: ({ proxyInfo }) => {
 *      const usedProxyUrl = proxyInfo.url; // Getting the proxy URL
 *   }
 * })
 *
 * ```
 * @category Scaling
 */
export class ProxyConfiguration {
    private groups: string[];
    private countryCode?: string;
    private password?: string;
    private hostname: string;
    private port?: number;
    private nextCustomUrlIndex = 0;
    private proxyUrls: string[];
    private usedProxyUrls = new Map<string, string>();
    private newUrlFunction?: ProxyConfigurationFunction;
    private usesApifyProxy?: boolean;
    public isManInTheMiddle = false;
    private log = defaultLog.child({ prefix: 'ProxyConfiguration' });

    /**
     * @internal
     */
    constructor(options: ProxyConfigurationOptions = {}, readonly config = Configuration.getGlobalConfig()) {
        ow(options, ow.object.exactShape({
            groups: ow.optional.array.ofType(ow.string.matches(APIFY_PROXY_VALUE_REGEX)),
            apifyProxyGroups: ow.optional.array.ofType(ow.string.matches(APIFY_PROXY_VALUE_REGEX)),
            countryCode: ow.optional.string.matches(COUNTRY_CODE_REGEX),
            apifyProxyCountry: ow.optional.string.matches(COUNTRY_CODE_REGEX),
            proxyUrls: ow.optional.array.nonEmpty.ofType(ow.string.url),
            password: ow.optional.string,
            newUrlFunction: ow.optional.function,
        }));

        const {
            groups = [],
            apifyProxyGroups = [],
            countryCode,
            apifyProxyCountry,
            proxyUrls,
            password = config.get('proxyPassword'),
            newUrlFunction,
        } = options;

        const groupsToUse = groups.length ? groups : apifyProxyGroups;
        const countryCodeToUse = countryCode || apifyProxyCountry;
        const hostname = config.get('proxyHostname');
        const port = config.get('proxyPort');

        // Validation
        if (((proxyUrls || newUrlFunction) && ((groupsToUse.length) || countryCodeToUse))) {
            this._throwCannotCombineCustomWithApify();
        }
        if (proxyUrls && newUrlFunction) this._throwCannotCombineCustomMethods();

        this.groups = groupsToUse;
        this.countryCode = countryCodeToUse;
        this.password = password;
        this.hostname = hostname!;
        this.port = port;
        this.proxyUrls = proxyUrls;
        this.newUrlFunction = newUrlFunction;
        this.usesApifyProxy = !this.proxyUrls && !this.newUrlFunction;

        if (proxyUrls && proxyUrls.some((url) => url.includes('apify.com'))) {
            this.log.warning(
                'Some Apify proxy features may work incorrectly. Please consider setting up Apify properties instead of `proxyUrls`.\n'
                + 'See https://sdk.apify.com/docs/guides/proxy-management#apify-proxy-configuration',
            );
        }
    }

    /**
     * Loads proxy password if token is provided and checks access to Apify Proxy and provided proxy groups
     * if Apify Proxy configuration is used.
     * Also checks if country has access to Apify Proxy groups if the country code is provided.
     *
     * You should use the {@link Apify.createProxyConfiguration} function to create a pre-initialized
     * `ProxyConfiguration` instance instead of calling this manually.
     */
    async initialize(): Promise<void> {
        if (this.usesApifyProxy) {
            await this._setPasswordIfToken();

            await this._checkAccess();
        }
    }

    /**
     * This function creates a new {@link ProxyInfo} info object.
     * It is used by CheerioCrawler and PuppeteerCrawler to generate proxy URLs and also to allow the user to inspect
     * the currently used proxy via the handlePageFunction parameter: proxyInfo.
     * Use it if you want to work with a rich representation of a proxy URL.
     * If you need the URL string only, use {@link ProxyConfiguration.newUrl}.
     * @param [sessionId]
     *  Represents the identifier of user {@link Session} that can be managed by the {@link SessionPool} or
     *  you can use the Apify Proxy [Session](https://docs.apify.com/proxy#sessions) identifier.
     *  When the provided sessionId is a number, it's converted to a string. Property sessionId of
     *  {@link ProxyInfo} is always returned as a type string.
     *
     *  All the HTTP requests going through the proxy with the same session identifier
     *  will use the same target proxy server (i.e. the same IP address).
     *  The identifier must not be longer than 50 characters and include only the following: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
     * @return {ProxyInfo} represents information about used proxy and its configuration.
     */
    newProxyInfo(sessionId?: string | number): ProxyInfo {
        if (typeof sessionId === 'number') sessionId = `${sessionId}`;
        ow(sessionId, ow.optional.string.maxLength(MAX_SESSION_ID_LENGTH).matches(APIFY_PROXY_VALUE_REGEX));
        const url = this.newUrl(sessionId);

        const { groups, countryCode, password, port, hostname } = (this.usesApifyProxy ? this : new URL(url)) as ProxyConfiguration;

        return {
            sessionId,
            url,
            groups,
            countryCode,
            password: password!, // TODO maybe should be optional in ProxyInfo? or empty string default?
            hostname,
            // TODO should it be really a string in the response, maybe string|number would be better?
            port: port as unknown as string,
        };
    }

    /**
     * Returns a new proxy URL based on provided configuration options and the `sessionId` parameter.
     * @param [sessionId]
     *  Represents the identifier of user {@link Session} that can be managed by the {@link SessionPool} or
     *  you can use the Apify Proxy [Session](https://docs.apify.com/proxy#sessions) identifier.
     *  When the provided sessionId is a number, it's converted to a string.
     *
     *  All the HTTP requests going through the proxy with the same session identifier
     *  will use the same target proxy server (i.e. the same IP address).
     *  The identifier must not be longer than 50 characters and include only the following: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
     * @return {string} A string with a proxy URL, including authentication credentials and port number.
     *  For example, `http://bob:password123@proxy.example.com:8000`
     */
    newUrl(sessionId?: string | number): string {
        if (typeof sessionId === 'number') sessionId = `${sessionId}`;
        ow(sessionId, ow.optional.string.maxLength(MAX_SESSION_ID_LENGTH).matches(APIFY_PROXY_VALUE_REGEX));
        if (this.newUrlFunction) {
            return this._callNewUrlFunction(sessionId)!;
        }
        if (this.proxyUrls) {
            return this._handleCustomUrl(sessionId);
        }
        const username = this._getUsername(sessionId);
        const { password, hostname, port } = this;

        return `${PROTOCOL}://${username}:${password}@${hostname}:${port}`;
    }

    /**
     * Returns proxy username.
     */
    protected _getUsername(sessionId?: string): string {
        let username;
        const { groups, countryCode } = this;
        const parts: string[] = [];

        if (groups && groups.length) {
            parts.push(`groups-${groups.join('+')}`);
        }
        if (sessionId) {
            parts.push(`session-${sessionId}`);
        }
        if (countryCode) {
            parts.push(`country-${countryCode}`);
        }

        username = parts.join(',');

        if (parts.length === 0) username = 'auto';

        return username;
    }

    /**
     * Checks if Apify Token is provided in env and gets the password via API and sets it to env
     */
    protected async _setPasswordIfToken(): Promise<void> {
        const token = this.config.get('token');
        if (token) {
            const { proxy } = await apifyClient.user().get();
            const { password } = proxy!;

            if (this.password) {
                if (this.password !== password) {
                    this.log.warning('The Apify Proxy password you provided belongs to'
                    + ' a different user than the Apify token you are using. Are you sure this is correct?');
                }
            } else {
                this.password = password;
            }
        }
        if (!this.password) {
            throw new Error(`Apify Proxy password must be provided using options.password or the "${ENV_VARS.PROXY_PASSWORD}" environment variable.`
                + `If you add the "${ENV_VARS.TOKEN}" environment variable, the password will be automatically inferred.`);
        }
    }

    /**
     * Checks whether the user has access to the proxies specified in the provided ProxyConfigurationOptions.
     * If the check can not be made, it only prints a warning and allows the program to continue. This is to
     * prevent program crashes caused by short downtimes of Proxy.
     */
    protected async _checkAccess(): Promise<void> {
        const status = await this._fetchStatus();
        if (status) {
            const { connected, connectionError, isManInTheMiddle } = status;
            this.isManInTheMiddle = isManInTheMiddle;

            if (!connected) this._throwApifyProxyConnectionError(connectionError);
        } else {
            this.log.warning('Apify Proxy access check timed out. Watch out for errors with status code 407. '
                + 'If you see some, it most likely means you don\'t have access to either all or some of the proxies you\'re trying to use.');
        }
    }

    /**
     * Apify Proxy can be down for a second or a minute, but this should not crash processes.
     */
    protected async _fetchStatus(): Promise<{ connected: boolean; connectionError: string; isManInTheMiddle: boolean } | undefined> {
        const requestOpts: RequestAsBrowserOptions = {
            url: `${this.config.get('proxyStatusUrl')}/?format=json`,
            proxyUrl: this.newUrl(),
            timeout: { request: CHECK_ACCESS_REQUEST_TIMEOUT_MILLIS },
            responseType: 'json',
        };

        for (let attempt = 1; attempt <= CHECK_ACCESS_MAX_ATTEMPTS; attempt++) {
            try {
                const response = await requestAsBrowser<{ connected: boolean; connectionError: string; isManInTheMiddle: boolean }>(requestOpts);
                return response.body;
            } catch {
                // retry connection errors
            }
        }

        return undefined;
    }

    /**
     * Handles custom url rotation with session
     */
    protected _handleCustomUrl(sessionId?: string): string {
        let customUrlToUse: string;

        if (!sessionId) {
            return this.proxyUrls[this.nextCustomUrlIndex++ % this.proxyUrls.length];
        }

        if (this.usedProxyUrls.has(sessionId)) {
            customUrlToUse = this.usedProxyUrls.get(sessionId)!;
        } else {
            customUrlToUse = this.proxyUrls[this.nextCustomUrlIndex++ % this.proxyUrls.length];
            this.usedProxyUrls.set(sessionId, customUrlToUse);
        }

        return customUrlToUse;
    }

    /**
     * Calls the custom newUrlFunction and checks format of its return value
     */
    protected _callNewUrlFunction(sessionId?: string) {
        let proxyUrl: string | undefined;

        try {
            proxyUrl = this.newUrlFunction!(sessionId!);
            new URL(proxyUrl); // eslint-disable-line no-new
        } catch (err) {
            this._throwNewUrlFunctionInvalid(err as Error);
        }

        return proxyUrl;
    }

    /**
     * Throws invalid custom newUrlFunction return
     * @internal
     */
    protected _throwNewUrlFunctionInvalid(err: Error) {
        throw new Error(`The provided newUrlFunction did not return a valid URL.\nCause: ${err.message}`);
    }

    /**
     * Throws Apify Proxy is not connected
     * @internal
     */
    protected _throwApifyProxyConnectionError(errorMessage: string) {
        throw new Error(errorMessage);
    }

    /**
     * Throws cannot combine custom proxies with Apify Proxy
     * @internal
     */
    protected _throwCannotCombineCustomWithApify() {
        throw new Error('Cannot combine custom proxies with Apify Proxy!'
            + 'It is not allowed to set "options.proxyUrls" or "options.newUrlFunction" combined with '
            + '"options.groups" or "options.apifyProxyGroups" and "options.countryCode" or "options.apifyProxyCountry".');
    }

    /**
     * Throws cannot combine custom 2 custom methods
     * @internal
     */
    protected _throwCannotCombineCustomMethods() {
        throw new Error('Cannot combine custom proxies "options.proxyUrls" with custom generating function "options.newUrlFunction".');
    }
}

/**
 * Creates a proxy configuration and returns a promise resolving to an instance
 * of the {@link ProxyConfiguration} class that is already initialized.
 *
 * Configures connection to a proxy server with the provided options. Proxy servers are used to prevent target websites from blocking
 * your crawlers based on IP address rate limits or blacklists. Setting proxy configuration in your crawlers automatically configures
 * them to use the selected proxies for all connections.
 *
 * For more details and code examples, see the {@link ProxyConfiguration} class.
 *
 * ```javascript
 *
 * // Returns initialized proxy configuration class
 * const proxyConfiguration = await Apify.createProxyConfiguration({
 *     groups: ['GROUP1', 'GROUP2'] // List of Apify proxy groups
 *     countryCode: 'US'
 * });
 *
 * const crawler = new Apify.CheerioCrawler({
 *   // ...
 *   proxyConfiguration,
 *   handlePageFunction: ({ proxyInfo }) => {
 *       const usedProxyUrl = proxyInfo.url; // Getting the proxy URL
 *   }
 * })
 *
 * ```
 *
 * For compatibility with existing Actor Input UI (Input Schema), this function
 * returns `undefined` when the following object is passed as `proxyConfigurationOptions`.
 *
 * ```
 * { useApifyProxy: false }
 * ```
 */
export async function createProxyConfiguration(
    proxyConfigurationOptions: ProxyConfigurationOptions & { useApifyProxy?: boolean } = {},
): Promise<ProxyConfiguration | undefined> {
    // Compatibility fix for Input UI where proxy: None returns { useApifyProxy: false }
    // Without this, it would cause proxy to use the zero config / auto mode.
    const { useApifyProxy, ...options } = proxyConfigurationOptions;
    const dontUseApifyProxy = useApifyProxy === false;
    const dontUseCustomProxies = !proxyConfigurationOptions.proxyUrls;
    if (dontUseApifyProxy && dontUseCustomProxies) return undefined;

    const proxyConfiguration = new ProxyConfiguration(options);
    await proxyConfiguration.initialize();

    return proxyConfiguration;
}
