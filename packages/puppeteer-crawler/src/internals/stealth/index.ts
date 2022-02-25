import { Page, Browser } from 'puppeteer';
import { cryptoRandomObjectId } from '@apify/utilities';
import _log from '@apify/log';
import { keys } from '@crawlers/utils';
import * as hidingTricks from './hiding_tricks';

const log = _log.child({ prefix: 'Stealth' });

/**
 * Configuration of stealth tricks for a proper hiding effect all of them should be set to true.
 * These tricks are applied only when the `stealth` option is set to `true`.
 */
export interface StealthOptions {
    /** If plugins should be added to the navigator. */
    addPlugins?: boolean;
    /** Emulates window Iframe. */
    emulateWindowFrame?: boolean;
    /** Emulates graphic card. */
    emulateWebGL?: boolean;
    /** Emulates console.debug to return null. */
    emulateConsoleDebug?: boolean;
    /** Adds languages to the navigator. */
    addLanguage?: boolean;
    /** Hides the webdriver by changing the navigator proto. */
    hideWebDriver?: boolean;
    /** Fakes interaction with permissions. */
    hackPermissions?: boolean;
    /** Adds the chrome runtime properties. */
    mockChrome?: boolean;
    /** Adds the chrome runtime properties inside the every newly created iframe. */
    mockChromeInIframe?: boolean;
    /** Sets device memory to other value than 0. */
    mockDeviceMemory?: boolean;
}

const DEFAULT_STEALTH_OPTIONS = {
    addPlugins: true,
    emulateWindowFrame: true,
    emulateWebGL: true,
    emulateConsoleDebug: true,
    addLanguage: true,
    hackPermissions: true,
    mockChrome: true,
    mockChromeInIframe: true,
    mockDeviceMemory: true,
};

const STEALTH_ERROR_MESSAGE_PREFIX = 'StealthError';
const MAX_IFRAMES = 10;
const alreadyWrapped = Symbol('alreadyWrapped');

/**
 *  The main purpose of this function is to override newPage function and attach selected tricks.
 * @param browser puppeteer browser instance
 * @param options
 * @returns Instance of Browser from puppeteer package
 */
export function applyStealthToBrowser(browser: Browser, options: StealthOptions): Browser {
    const modifiedBrowser = browser;
    const opts = { ...DEFAULT_STEALTH_OPTIONS, ...options };
    const defaultContext = browser.defaultBrowserContext();
    const contextPrototype = Object.getPrototypeOf(defaultContext);

    const prevNewPage = contextPrototype.newPage;

    if (!contextPrototype.newPage[alreadyWrapped]) {
        contextPrototype.newPage = async function (...args: unknown[]) {
            const page = await prevNewPage.bind(this)(...args);

            const evaluationDebugMessage = generateEvaluationDebugMessage();

            addStealthDebugToPage(page, evaluationDebugMessage);
            await applyStealthTricks(page, evaluationDebugMessage, opts);

            return page;
        };

        contextPrototype.newPage[alreadyWrapped] = true;
    }

    return modifiedBrowser;
}

function generateEvaluationDebugMessage() {
    const minLength = 6;
    const maxLength = 10;
    const randomLength = Math.random() * (maxLength - minLength) + minLength;

    return cryptoRandomObjectId(randomLength);
}
/**
 * Logs the stealth errors in browser to the node stdout.
 * @param page puppeteer page instance
 * @param evaluationDebugMessage debug message
 */
function addStealthDebugToPage(page: Page, evaluationDebugMessage: string): void {
    let warningLogged = false;
    let counter = 1;
    page.on('console', (msg) => {
        const text = msg.text();
        if (text.includes(STEALTH_ERROR_MESSAGE_PREFIX)) {
            log.error(text);
        } else if (text.includes(evaluationDebugMessage)) {
            if (counter > MAX_IFRAMES && !warningLogged) {
                log.warning(
                    `Evaluating hiding tricks in too many iframes (limit: ${MAX_IFRAMES}).`
                    + 'You might experience some performance issues. Try setting \'stealth\' false',
                );

                warningLogged = true;
            }
            counter++;
            log.debug('Tricks evaluated', { counter });
        }
    });
}

/**
 * Applies stealth tricks to the puppeteer page
 * @internal
 */
export function applyStealthTricks(page: Page, evaluationDebugMessage: string, options: StealthOptions): Promise<void> {
    const functions = keys(options)
        .filter((key) => {
            return options[key];
        })
        .map((key) => hidingTricks[key as keyof typeof hidingTricks].toString());

    /* istanbul ignore next */
    const addFunctions = (functionsArr: string[], errorMessagePrefix: string, debugMessage: string) => {
        // eslint-disable-next-line no-console
        console.log(debugMessage);
        // add functions
        for (const func of functionsArr) {
            try {
                eval(func)(); // eslint-disable-line
            } catch (e) {
                const err = e as Error;
                // eslint-disable-next-line no-console
                console.error(`${errorMessagePrefix}: Failed to apply stealth trick reason: ${err.message}`);
            }
        }
    };

    return page.evaluateOnNewDocument(addFunctions, functions, STEALTH_ERROR_MESSAGE_PREFIX, evaluationDebugMessage);
}
