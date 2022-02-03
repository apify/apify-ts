import os from 'os';
import ow from 'ow';
import { ENV_VARS } from '@apify/consts';
import {
    Dictionary,
    Constructor,
    isAtHome,
} from '@crawlers/core';
import {
    BrowserPlugin,
    BrowserPluginOptions,
} from 'browser-pool';

export interface BrowserLaunchContext<TOptions, Launcher> extends BrowserPluginOptions<TOptions> {
    /**
     * If `true` and `executablePath` is not set,
     * the launcher will launch full Google Chrome browser available on the machine
     * rather than the bundled Chromium. The path to Chrome executable
     * is taken from the `APIFY_CHROME_EXECUTABLE_PATH` environment variable if provided,
     * or defaults to the typical Google Chrome executable location specific for the operating system.
     * By default, this option is `false`.
     * @default false
     */
    useChrome?: boolean;
    launcher?: Launcher;
}

/**
 * Abstract class for creating browser launchers, such as `PlaywrightLauncher` and `PuppeteerLauncher`.
 * @ignore
 */
export abstract class BrowserLauncher<
    Plugin extends BrowserPlugin,
    Launcher = Plugin['library'],
    T extends Constructor<Plugin> = Constructor<Plugin>,
    LaunchOptions = Partial<Parameters<Plugin['launch']>[0]>,
    LaunchResult extends ReturnType<Plugin['launch']> = ReturnType<Plugin['launch']>,
> {
    launcher: Launcher;
    proxyUrl?: string;
    useChrome?: boolean;
    launchOptions: Dictionary;
    otherLaunchContextProps: Dictionary;
    // to be provided by child classes;
    Plugin!: T;
    userAgent?: string;

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
            const e = err as Error & { code: string };
            if (e.code === 'MODULE_NOT_FOUND') {
                const msg = `Cannot find module '${launcher}'. Did you you install the '${launcher}' package?\n`
                    + `Make sure you have '${launcher}' in your package.json dependencies and in your package-lock.json, if you use it.`;
                e.message = isAtHome()
                    ? `${msg}\nOn the Apify platform, '${launcher}' can only be used with the ${apifyImageName} Docker image.`
                    : msg;
            }

            throw err;
        }
    }

    /**
     * All `BrowserLauncher` parameters are passed via an launchContext object.
     */
    constructor(launchContext: BrowserLaunchContext<LaunchOptions, Launcher>) {
        const {
            launcher,
            proxyUrl,
            useChrome,
            launchOptions = {},
            ...otherLaunchContextProps
        } = launchContext;

        this._validateProxyUrlProtocol(proxyUrl);

        // those need to be reassigned otherwise they are {} in types
        this.launcher = launcher!;
        this.proxyUrl = proxyUrl;
        this.useChrome = useChrome;
        this.launchOptions = launchOptions;
        this.otherLaunchContextProps = otherLaunchContextProps as Dictionary;
    }

    /**
     * @ignore
     */
    createBrowserPlugin(): Plugin {
        return new this.Plugin(this.launcher, {
            proxyUrl: this.proxyUrl,
            launchOptions: this.createLaunchOptions(),
            ...this.otherLaunchContextProps,
        });
    }

    /**
     * Launches a browser instance based on the plugin.
     * @returns Browser instance.
     */
    launch(): LaunchResult {
        const plugin = this.createBrowserPlugin();
        const context = plugin.createLaunchContext();

        return plugin.launch(context) as LaunchResult;
    }

    createLaunchOptions(): { args?: string[] } & Dictionary {
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
        return process.env[ENV_VARS.CHROME_EXECUTABLE_PATH] || this._getTypicalChromeExecutablePath();
    }

    /**
     * Gets a typical path to Chrome executable, depending on the current operating system.
     */
    protected _getTypicalChromeExecutablePath(): string {
        switch (os.platform()) {
            case 'darwin':
                return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
            case 'win32':
                return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
            default:
                return '/usr/bin/google-chrome';
        }
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
