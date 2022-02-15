/**
 * BLABLABLABLABLA
 *
 * The log instance enables level aware logging of messages and we advise
 * to use it instead of `console.log()` and its aliases in most development
 * scenarios.
 *
 * A very useful use case for `log` is using `log.debug` liberally throughout
 * the codebase to get useful logging messages only when appropriate log level is set
 * and keeping the console tidy in production environments.
 *
 * The available logging levels are, in this order: `DEBUG`, `INFO`, `WARNING`, `ERROR`, `OFF`
 * and can be referenced from the `log.LEVELS` constant, such as `log.LEVELS.ERROR`.
 *
 * To log messages to the system console, use the `log.level(message)` invocation,
 * such as `log.debug('this is a debug message')`.
 *
 * To prevent writing of messages above a certain log level to the console, simply
 * set the appropriate level. The default log level is `INFO`, which means that
 * `DEBUG` messages will not be printed, unless enabled.
 *
 * **Example:**
 * ```js
 * const Apify = require('apify');
 * const { log } = Apify.utils;
 *
 * log.info('Information message', { someData: 123 }); // prints message
 * log.debug('Debug message', { debugData: 'hello' }); // doesn't print anything
 *
 * log.setLevel(log.LEVELS.DEBUG);
 * log.debug('Debug message'); // prints message
 *
 * log.setLevel(log.LEVELS.ERROR);
 * log.debug('Debug message'); // doesn't print anything
 * log.info('Info message'); // doesn't print anything
 *
 * log.error('Error message', { errorDetails: 'This is bad!' }); // prints message
 * try {
 *   throw new Error('Not good!');
 * } catch (e) {
 *   log.exception(e, 'Exception occurred', { errorDetails: 'This is really bad!' }); // prints message
 * }
 *
 * log.setOptions({ prefix: 'My actor' });
 * log.info('I am running!'); // prints "My actor: I am running"
 *
 * const childLog = log.child({ prefix: 'Crawler' });
 * log.info('I am crawling!'); // prints "My actor:Crawler: I am crawling"
 * ```
 *
 * Another very useful way of setting the log level is by setting the `APIFY_LOG_LEVEL`
 * environment variable, such as `APIFY_LOG_LEVEL=DEBUG`. This way, no code changes
 * are necessary to turn on your debug messages and start debugging right away.
 *
 * To add timestamps to your logs, you can override the default logger settings:
 * ```js
 * log.setOptions({
 *     logger: new log.LoggerText({ skipTime: false }),
 * });
 * ```
 * You can customize your logging further by extending or replacing the default
 * logger instances with your own implementations.
 *
 * @module log
 */

import log, { Log, LoggerOptions, LogLevel, Logger, LoggerJson, LoggerText } from '@apify/log';

// TODO move this to @apify/log? check if we still need this, probably yes
Object.assign(log, { Log, LogLevel, Logger, LoggerJson, LoggerText });

export { Log, LoggerOptions, LogLevel, Logger, LoggerJson, LoggerText };
export { log };
