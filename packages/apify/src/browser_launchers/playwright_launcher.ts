import ow from 'ow';
import { Browser, BrowserType, LaunchOptions } from 'playwright';
import { PlaywrightPlugin } from 'browser-pool';
import { BrowserLaunchContext, BrowserLauncher } from './browser_launcher';

/**
 * Apify extends the launch options of Playwright.
 * You can use any of the Playwright compatible
 * [`LaunchOptions`](https://playwright.dev/docs/api/class-browsertype#browsertypelaunchoptions)
 * options by providing the `launchOptions` property.
 *
 * **Example:**
 * ```js
 * // launch a headless Chrome (not Chromium)
 * const launchContext = {
 *     // Apify helpers
 *     useChrome: true,
 *     proxyUrl: 'http://user:password@some.proxy.com'
 *     // Native Playwright options
 *     launchOptions: {
 *         headless: true,
 *         args: ['--some-flag'],
 *     }
 * }
 * ```
 */
export interface PlaywrightLaunchContext extends BrowserLaunchContext<LaunchOptions> {
    /** `browserType.launch` [options](https://playwright.dev/docs/api/class-browsertype?_highlight=launch#browsertypelaunchoptions) */
    launchOptions?: LaunchOptions;

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
     * If you want to use a different browser you can pass it by this property as e.g. `require("playwright").firefox`
     */
    launcher?: BrowserType;
}

/**
 * `PlaywrightLauncher` is based on the `BrowserLauncher`. It launches `playwright` browser instance.
 * @ignore
 */
export class PlaywrightLauncher extends BrowserLauncher<PlaywrightPlugin> {
    protected static override optionsShape = {
        ...BrowserLauncher.optionsShape,
        launcher: ow.optional.object,
    };

    /**
     * All `PlaywrightLauncher` parameters are passed via this launchContext object.
     */
    constructor(launchContext: PlaywrightLaunchContext = {}) {
        ow(launchContext, 'PlaywrightLauncherOptions', ow.object.exactShape(PlaywrightLauncher.optionsShape));

        const {
            launcher = BrowserLauncher.requireLauncherOrThrow<{ chromium: unknown }>('playwright', 'apify/actor-node-playwright-*').chromium,
        } = launchContext;

        const { launchOptions = {}, ...rest } = launchContext;

        super({
            ...rest,
            launchOptions: {
                ...launchOptions,
                executablePath: getDefaultExecutablePath(launchContext),
            }, // TODO maybe list executablePath in options?
            launcher,
        });

        this.Plugin = PlaywrightPlugin;
    }
}

/**
 * @returns {string | undefined} default path to browser.
 * If actor-node-playwright-* image is used the APIFY_DEFAULT_BROWSER_PATH is considered as default.
 * @ignore
 */
function getDefaultExecutablePath(launchContext: PlaywrightLaunchContext): string | undefined {
    const pathFromPlaywrightImage = process.env.APIFY_DEFAULT_BROWSER_PATH;
    const { launchOptions = {} } = launchContext;

    if (launchOptions.executablePath) {
        return launchOptions.executablePath;
    }

    if (launchContext.useChrome) {
        return undefined;
    }

    if (pathFromPlaywrightImage) {
        return pathFromPlaywrightImage;
    }

    return undefined;
}

/**
 * Launches headless browsers using Playwright pre-configured to work within the Apify platform.
 * The function has the same return value as `browserType.launch()`.
 * See [Playwright documentation](https://playwright.dev/docs/api/class-browsertype) for more details.
 *
 * The `launchPlaywright()` function alters the following Playwright options:
 *
 * - Passes the setting from the `APIFY_HEADLESS` environment variable to the `headless` option,
 *   unless it was already defined by the caller or `APIFY_XVFB` environment variable is set to `1`.
 *   Note that Apify Actor cloud platform automatically sets `APIFY_HEADLESS=1` to all running actors.
 * - Takes the `proxyUrl` option, validates it and adds it to `launchOptions` in a proper format.
 *   The proxy URL must define a port number and have one of the following schemes: `http://`,
 *   `https://`, `socks4://` or `socks5://`.
 *   If the proxy is HTTP (i.e. has the `http://` scheme) and contains username or password,
 *   the `launchPlaywright` functions sets up an anonymous proxy HTTP
 *   to make the proxy work with headless Chrome. For more information, read the
 *   [blog post about proxy-chain library](https://blog.apify.com/how-to-make-headless-chrome-and-puppeteer-use-a-proxy-server-with-authentication-249a21a79212).
 *
 * To use this function, you need to have the [Playwright](https://www.npmjs.com/package/playwright)
 * NPM package installed in your project.
 * When running on the Apify Platform, you can achieve that simply
 * by using the `apify/actor-node-playwright-*` base Docker image for your actor - see
 * [Apify Actor documentation](https://docs.apify.com/actor/build#base-images)
 * for details.
 *
 * @param [launchContext]
 *   Optional settings passed to `browserType.launch()`. In addition to
 *   [Playwright's options](https://playwright.dev/docs/api/class-browsertype?_highlight=launch#browsertypelaunchoptions)
 *   the object may contain our own  {@link PlaywrightLaunchContext} that enable additional features.
 * @returns
 *   Promise that resolves to Playwright's `Browser` instance.
 */
export async function launchPlaywright(launchContext?: PlaywrightLaunchContext): Promise<Browser> {
    const playwrightLauncher = new PlaywrightLauncher(launchContext);

    return playwrightLauncher.launch();
}
