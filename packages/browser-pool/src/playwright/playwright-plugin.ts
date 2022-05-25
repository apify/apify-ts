import type { Browser as PlaywrightBrowser, BrowserType } from 'playwright';
import { Browser as PlaywrightBrowserWithPersistentContext } from './browser';
import { PlaywrightController } from './playwright-controller';
import { BrowserController } from '../abstract-classes/browser-controller';
import { BrowserPlugin } from '../abstract-classes/browser-plugin';
import { LaunchContext } from '../launch-context';
import { log } from '../logger';
import { getLocalProxyAddress } from '../proxy-server';
import { anonymizeProxySugar } from '../anonymize-proxy';

/**
 * The default User Agent used by `PlaywrightCrawler` and `launchPlaywright` when Chromium is launched:
 *  - in headless mode,
 *  - without using a fingerprint,
 *  - without specifying a user agent,
 *  - without specifying an executable path.
 * Last updated on 2022-05-05.
 */
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.54 Safari/537.36';

export class PlaywrightPlugin extends BrowserPlugin<BrowserType, Parameters<BrowserType['launch']>[0], PlaywrightBrowser> {
    private _browserVersion?: string;

    protected async _launch(launchContext: LaunchContext<BrowserType>): Promise<PlaywrightBrowser> {
        const {
            launchOptions,
            useIncognitoPages,
            userDataDir,
            proxyUrl,
            fingerprint,
        } = launchContext;
        // @ts-expect-error Property 'userAgent' does not exist on type 'LaunchOptions'
        const { headless, userAgent, executablePath } = launchOptions!;
        // When User-Agent is not set, and we're using Chromium in headless mode,
        // it is better to use DEFAULT_USER_AGENT to reduce chance of detection,
        // as otherwise 'HeadlessChrome' is present in User-Agent string.
        if (this._isChromiumBasedBrowser() && headless && !fingerprint && !userAgent && !executablePath) {
            // @ts-expect-error Property 'userAgent' does not exist on type 'LaunchOptions'
            launchOptions!.userAgent = DEFAULT_USER_AGENT;
            if (Array.isArray(launchOptions!.args)) {
                launchOptions!.args.push(`--user-agent=${DEFAULT_USER_AGENT}`);
            } else {
                launchOptions!.args = [`--user-agent=${DEFAULT_USER_AGENT}`];
            }
        }

        let browser: PlaywrightBrowser;

        // Required for the `proxy` context option to work.
        launchOptions!.proxy = {
            server: await getLocalProxyAddress(),
            ...launchOptions!.proxy,
        };

        const [anonymizedProxyUrl, close] = await anonymizeProxySugar(proxyUrl);
        if (anonymizedProxyUrl) {
            launchOptions!.proxy = {
                server: anonymizedProxyUrl,
                bypass: launchOptions!.proxy.bypass,
            };
        }

        try {
            if (useIncognitoPages) {
                browser = await this.library.launch(launchOptions);

                if (anonymizedProxyUrl) {
                    browser.on('disconnected', async () => {
                        await close();
                    });
                }
            } else {
                const browserContext = await this.library.launchPersistentContext(userDataDir, launchOptions);

                if (anonymizedProxyUrl) {
                    browserContext.on('close', async () => {
                        await close();
                    });
                }

                if (!this._browserVersion) {
                    // Launches unused browser just to get the browser version.
                    const inactiveBrowser = await this.library.launch(launchOptions);
                    this._browserVersion = inactiveBrowser.version();

                    inactiveBrowser.close().catch((error) => {
                        log.exception(error, 'Failed to close browser.');
                    });
                }

                browser = new PlaywrightBrowserWithPersistentContext({ browserContext, version: this._browserVersion });
            }
        } catch (error) {
            await close();

            throw error;
        }

        return browser;
    }

    protected _createController(): BrowserController<BrowserType, Parameters<BrowserType['launch']>[0], PlaywrightBrowser> {
        return new PlaywrightController(this);
    }

    protected async _addProxyToLaunchOptions(launchContext: LaunchContext<BrowserType>): Promise<void> {
        launchContext.launchOptions ??= {};

        const { launchOptions, proxyUrl } = launchContext;

        if (proxyUrl) {
            const url = new URL(proxyUrl);

            launchOptions.proxy = {
                server: url.origin,
                username: decodeURIComponent(url.username),
                password: decodeURIComponent(url.password),
            };
        }
    }

    protected _isChromiumBasedBrowser(): boolean {
        const name = this.library.name();
        return name === 'chromium';
    }
}
