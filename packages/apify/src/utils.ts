import { log } from '@crawlers/core';
import { ENV_VARS } from '@apify/consts';
import { type } from 'node:os';
import semver from 'semver';

// @ts-expect-error if we enable resolveJsonModule, we end up with `src` folder in `dist`
import { version as apifyClientVersion } from 'apify-client/package.json';
// @ts-expect-error if we enable resolveJsonModule, we end up with `src` folder in `dist`
import { version as apifyVersion } from '../package.json';

/**
 * Logs info about system, node version and apify package version.
 * @internal
 */
export function logSystemInfo() {
    log.info('System info', {
        apifyVersion,
        apifyClientVersion,
        osType: type(),
        nodeVersion: process.version,
    });
};

/**
 * Returns `true` when code is running on Apify platform and `false` otherwise (for example locally).
 */
export function isAtHome(): boolean {
    return !!process.env[ENV_VARS.IS_AT_HOME];
}

/**
 * Prints a warning if this version of Apify SDK is outdated.
 * @ignore
 */
export function printOutdatedSdkWarning() {
    if (process.env[ENV_VARS.DISABLE_OUTDATED_WARNING]) return;
    const latestApifyVersion = process.env[ENV_VARS.SDK_LATEST_VERSION];
    if (!latestApifyVersion || !semver.lt(apifyVersion, latestApifyVersion)) return;

    log.warning(`You are using an outdated version (${apifyVersion}) of Apify SDK. We recommend you to update to the latest version (${latestApifyVersion}).
         Read more about Apify SDK versioning at: https://help.apify.com/en/articles/3184510-updates-and-versioning-of-apify-sdk`);
}
