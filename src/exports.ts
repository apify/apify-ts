/**
 * The following section describes all functions and properties provided by the `apify` package,
 * except individual classes and namespaces that have their separate, detailed, documentation pages
 * accessible from the left sidebar. To learn how Apify SDK works, we suggest following
 * the [Getting Started](../guides/getting-started) tutorial.
 *
 * **Important:**
 * > The following functions: `addWebhook`, `call`, `callTask` and `newClient` invoke features of the
 * > [Apify platform](../guides/apify-platform) and require your scripts to be authenticated.
 * > See the [authentication guide](../guides/apify-platform#logging-into-apify-platform-from-apify-sdk) for instructions.
 *
 * ## `Apify` Class
 *
 * As opposed to those helper functions, there is an alternative approach using `Apify` class (a named export).
 * It has mostly the same API, but the methods on `Apify` instance will use the configuration provided in the constructor.
 * Environment variables will have precedence over this configuration.
 *
 * ```js
 * const { Apify } = require('apify'); // use named export to get the class
 *
 * const sdk = new Apify({ token: '123' });
 * console.log(sdk.config.get('token')); // '123'
 *
 * // the token will be passed to the `call` method automatically
 * const run = await sdk.call('apify/hello-world', { myInput: 123 });
 * console.log(`Received message: ${run.output.body.message}`);
 * ```
 *
 * Another example shows how the default dataset name can be changed:
 *
 * ```js
 * const { Apify } = require('apify'); // use named export to get the class
 *
 * const sdk = new Apify({ defaultDatasetId: 'custom-name' });
 * await sdk.pushData({ myValue: 123 });
 * ```
 *
 * is equivalent to:
 * ```js
 * const Apify = require('apify'); // use default export to get the helper functions
 *
 * const dataset = await Apify.openDataset('custom-name');
 * await dataset.pushData({ myValue: 123 });
 * ```
 *
 * See {@link Configuration} for details about what can be configured and what are the default values.
 *
 * @packageDocumentation
 * @module Apify
 */
export * from './main';
export * from './actor';
export * from './configuration';
export * from './crawlers/basic_crawler';
export * from './crawlers/cheerio_crawler';
export * from './crawlers/playwright_crawler';
export * from './crawlers/puppeteer_crawler';
export * from './crawlers/statistics';
export * from './storages/request_queue';
export * from './storages/dataset';
export * from './storages/storage_manager';
export * from './storages/key_value_store';
export * from './utils_log';
export * from './request_list';
export * from './request';
export * from './session_pool/session';
export * from './session_pool/session_pool';
export * from './proxy_configuration';
export * from './autoscaling/autoscaled_pool';
export * from './autoscaling/snapshotter';
export * from './autoscaling/system_status';
