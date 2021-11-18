import ow from 'ow';
import { ENV_VARS } from '@apify/consts';
import { getTypicalChromeExecutablePath, isAtHome } from '../utils';
import { BrowserPlugin } from './browser_plugin';
import { Constructor } from '../typedefs';
import { StealthOptions } from '../stealth/stealth';

export interface BrowserLaunchContext<TOptions> {
    /**
     * `Options` passed to the browser launcher function. Options are based on underlying library.
     */
    launchOptions?: TOptions;

    /**
     * URL to a HTTP proxy server. It must define the port number,
     * and it may also contain proxy username and password.
     *
     * Example: `http://bob:pass123@proxy.example.com:1234`.
     */
    proxyUrl?: string;

    /**
     * If `true` and `executablePath` is not set,
     * Playwright will launch full Google Chrome browser available on the machine
     * rather than the bundled Chromium. The path to Chrome executable
     * is taken from the `APIFY_CHROME_EXECUTABLE_PATH` environment variable if provided,
     * or defaults to the typical Google Chrome executable location specific for the operating system.
     * By default, this option is `false`.
     * @default false
     */
    useChrome?: boolean;

    /**
     * By default this function uses `require("playwright").chromium`.
     * If you want to use a different browser you can pass it by this property as `require("playwright").firefox`
     */
    launcher?: any;

    // TODO: this needs proper documentation strings
    /**
     * If the browser should use incognito pages
     */
    useIncognitoPages?: boolean;

    // TODO: this needs proper documentation strings
    /**
     * Where browsers should store their data
     */
    userDataDir?: string;
}

/**
 * Abstract class for creating browser launchers, such as `PlaywrightLauncher` and `PuppeteerLauncher`.
 * @ignore
 */
export abstract class BrowserLauncher<
    Plugin extends BrowserPlugin,
    T extends Constructor<Plugin> = Constructor<Plugin>,
    LaunchOptions = Partial<Parameters<Plugin['launch']>[0]>
> {
    launcher: T;
    proxyUrl?: string;
    useChrome?: boolean;
    launchOptions: Record<string, any>;
    otherLaunchContextProps: Record<string, any>;
    Plugin?: T; // to be provided by child classes;
    userAgent?: string;
    stealth?: boolean;
    stealthOptions: StealthOptions;

    protected static optionsShape = {
        proxyUrl: ow.optional.string.url,
        useChrome: ow.optional.boolean,
        useIncognitoPages: ow.optional.boolean,
        userDataDir: ow.optional.string,
        launchOptions: ow.optional.object,
    };

    static requireLauncherOrThrow<T>(launcher: string, apifyImageName: string): T {
        try {
            return require(launcher); // eslint-disable-line
        } catch (err) {
            if (err.code === 'MODULE_NOT_FOUND') {
                const msg = `Cannot find module '${launcher}'. Did you you install the '${launcher}' package?\n`
                    + `Make sure you have '${launcher}' in your package.json dependencies and in your package-lock.json, if you use it.`;
                err.message = isAtHome()
                    ? `${msg}\nOn the Apify platform, '${launcher}' can only be used with the ${apifyImageName} Docker image.`
                    : msg;
            }

            throw err;
        }
    }

    /**
     * All `BrowserLauncher` parameters are passed via an launchContext object.
     */
    constructor(launchContext: BrowserLaunchContext<LaunchOptions>) {
        const {
            launcher,
            proxyUrl,
            useChrome,
            launchOptions = {},
            ...otherLaunchContextProps
        } = launchContext;

        this._validateProxyUrlProtocol(proxyUrl);

        // those need to be reassigned otherwise they are {} in types
        this.launcher = launcher;
        this.proxyUrl = proxyUrl;
        this.useChrome = useChrome;
        this.launchOptions = launchOptions;
        this.otherLaunchContextProps = otherLaunchContextProps;
    }

    /**
     * @ignore
     */
    createBrowserPlugin(): Plugin {
        return new this.Plugin!(this.launcher, {
            proxyUrl: this.proxyUrl,
            launchOptions: this.createLaunchOptions(),
            ...this.otherLaunchContextProps,
        });
    }

    /**
     * Launches a browser instance based on the plugin.
     * @returns {Promise<unknown>} Browser instance.
     */
    async launch(): Promise<unknown> {
        const plugin = this.createBrowserPlugin();
        const context = await plugin.createLaunchContext();
        return plugin.launch(context);
    }

    createLaunchOptions(): { args?: string[] } & Record<string, unknown> {
        const launchOptions = {
            ...this.launchOptions,
        };

        if (launchOptions.headless == null) {
            launchOptions.headless = this._getDefaultHeadlessOption();
        }

        if (this.useChrome && !launchOptions.executablePath) {
            launchOptions.executablePath = this._getChromeExecutablePath();
        }

        return launchOptions;
    }

    protected _getDefaultHeadlessOption(): boolean {
        return process.env[ENV_VARS.HEADLESS] === '1' && process.env[ENV_VARS.XVFB] !== '1';
    }

    protected _getChromeExecutablePath(): string {
        return process.env[ENV_VARS.CHROME_EXECUTABLE_PATH] || getTypicalChromeExecutablePath();
    }

    protected _validateProxyUrlProtocol(proxyUrl?: string): void {
        if (!proxyUrl) return;

        if (!/^(http|https|socks4|socks5)/i.test(proxyUrl)) {
            throw new Error(`Invalid "proxyUrl". Unsupported protocol: ${proxyUrl}.`);
        }

        const url = new URL(proxyUrl);

        if (url.username || url.password) {
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                throw new Error('Invalid "proxyUrl" option: authentication is only supported for HTTP proxy type.');
            }
        }
    }
}
