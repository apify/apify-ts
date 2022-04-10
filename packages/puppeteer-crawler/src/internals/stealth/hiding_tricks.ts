/* istanbul ignore file */
import type { Dictionary } from '@crawlee/utils';

export const hackPermissions = () => {
    const originalQuery = window.navigator.permissions.query;
    // @ts-ignore
    window.navigator.permissions.__proto__.query = parameters => parameters.name === 'notifications' // eslint-disable-line
        ? Promise.resolve({ state: Notification.permission }) //eslint-disable-line
        : originalQuery(parameters);

    // Inspired by: https://github.com/ikarienator/phantomjs_hide_and_seek/blob/master/5.spoofFunctionBind.js
    const oldCall = Function.prototype.call;
    function call() {
        // @ts-ignore
        return oldCall.apply(this, arguments); //eslint-disable-line
    }
    // eslint-disable-next-line
    Function.prototype.call = call;

    const nativeToStringFunctionString = Error.toString().replace(
        /Error/g,
        'toString',
    );
    const oldToString = Function.prototype.toString;

    function functionToString() {
        // @ts-ignore
        if (this === window.navigator.permissions.query) {
            return 'function query() { [native code] }';
        }
        // @ts-ignore
        if (this === functionToString) {
            return nativeToStringFunctionString;
        }

        // @ts-ignore
        return oldCall.call(oldToString, this);
    }
    // eslint-disable-next-line
    Function.prototype.toString = functionToString
};

export const addLanguage = () => {
    Object.defineProperty(Object.getPrototypeOf(navigator), 'languages', {
        get: () => ['en-US', 'en'],
    });
};

export const emulateWebGL = () => {
    try {
        // @ts-ignore
        const getParameterOld = WebGLRenderingContext.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) {
                return 'Intel Inc.';
            }
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) {
                return 'Intel(R) Iris(TM) Plus Graphics 640';
            }

            return getParameterOld(parameter);
        };
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error('hiding_tricks: Could not emulate WebGL');
    }
};

export const emulateWindowFrame = () => {
    if (window.outerWidth && window.outerHeight) {
        return; // nothing to do here
    }
    const windowFrame = 85; // probably OS and WM dependent
    // @ts-ignore
    window.outerWidth = window.innerWidth;
    // @ts-ignore
    window.outerHeight = window.innerHeight + windowFrame;
};

export const addPlugins = () => {
    function mockPluginsAndMimeTypes() {
        // Disguise custom functions as being native
        const makeFnsNative = (fns: Dictionary[] = []) => {
            const oldCall = Function.prototype.call;
            function call() {
                // @ts-ignore
                return oldCall.apply(this, arguments); // eslint-disable-line
            }
            // eslint-disable-next-line
            Function.prototype.call = call;

            const nativeToStringFunctionString = Error.toString().replace(
                /Error/g,
                'toString',
            );
            const oldToString = Function.prototype.toString;

            function functionToString() {
                for (const fn of fns) {
                    // @ts-ignore
                    if (this === fn.ref) {
                        return `function ${fn.name}() { [native code] }`;
                    }
                }

                // @ts-ignore
                if (this === functionToString) {
                    return nativeToStringFunctionString;
                }

                // @ts-ignore
                return oldCall.call(oldToString, this);
            }
            // eslint-disable-next-line
            Function.prototype.toString = functionToString
        };

        const mockedFns: any[] = [];

        const fakeData = {
            mimeTypes: [
                {
                    type: 'application/pdf',
                    suffixes: 'pdf',
                    description: '',
                    __pluginName: 'Chrome PDF Viewer',
                },
                {
                    type: 'application/x-google-chrome-pdf',
                    suffixes: 'pdf',
                    description: 'Portable Document Format',
                    __pluginName: 'Chrome PDF Plugin',
                },
                {
                    type: 'application/x-nacl',
                    suffixes: '',
                    description: 'Native Client Executable',
                    enabledPlugin: window.Plugin,
                    __pluginName: 'Native Client',
                },
                {
                    type: 'application/x-pnacl',
                    suffixes: '',
                    description: 'Portable Native Client Executable',
                    __pluginName: 'Native Client',
                },
            ],
            plugins: [
                {
                    name: 'Chrome PDF Plugin',
                    filename: 'internal-pdf-viewer',
                    description: 'Portable Document Format',
                },
                {
                    name: 'Chrome PDF Viewer',
                    filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
                    description: '',
                },
                {
                    name: 'Native Client',
                    filename: 'internal-nacl-plugin',
                    description: '',
                },
            ],
            fns: {
                namedItem: (instanceName: string) => {
                    // Returns the Plugin/MimeType with the specified name.
                    const fn = function (name: string) {
                        if (!arguments.length) {
                            throw new TypeError(
                                `Failed to execute 'namedItem' on '${instanceName}': 1 argument required, but only 0 present.`,
                            );
                        }

                        // @ts-ignore
                        return this[name] || null;
                    };
                    mockedFns.push({ ref: fn, name: 'namedItem' });
                    return fn;
                },
                item: (instanceName: string) => {
                    // Returns the Plugin/MimeType at the specified index into the array.
                    const fn = function (index: number) {
                        if (!arguments.length) {
                            throw new TypeError(
                                `Failed to execute 'namedItem' on '${instanceName}': 1 argument required, but only 0 present.`,
                            );
                        }

                        // @ts-ignore
                        return this[index] || null;
                    };
                    mockedFns.push({ ref: fn, name: 'item' });
                    return fn;
                },
                refresh: () => {
                    // Refreshes all plugins on the current page, optionally reloading documents.
                    const fn = function (): undefined {
                        return undefined;
                    };
                    mockedFns.push({ ref: fn, name: 'refresh' });
                    return fn;
                },
            },
        };
        // Poor mans _.pluck
        const getSubset = <T extends Dictionary, Keys extends keyof T>(keys: Keys[], obj: T) => keys.reduce(
            (a, c) => ({ ...a, [c]: obj[c] }), {} as { [K in Keys]: T[K] },
        );

        function generateMimeTypeArray() {
            const arr = fakeData.mimeTypes
                .map((obj) => getSubset(['type', 'suffixes', 'description'], obj))
                .map((obj) => Object.setPrototypeOf(obj, MimeType.prototype));
            arr.forEach((obj) => {
                arr[obj.type] = obj;
            });

            // Mock functions
            const arr2 = arr as unknown as MimeTypeArray;
            arr2.namedItem = fakeData.fns.namedItem('MimeTypeArray');
            arr2.item = fakeData.fns.item('MimeTypeArray');

            return Object.setPrototypeOf(arr, MimeTypeArray.prototype);
        }

        const mimeTypeArray = generateMimeTypeArray();
        Object.defineProperty(window.navigator, 'mimeTypes', {
            get: () => mimeTypeArray,
        });

        function generatePluginArray() {
            const arr = fakeData.plugins
                .map((obj) => getSubset(['name', 'filename', 'description'], obj))
                .map((obj): { description: string; name: string; filename: string; length: number } => {
                    const mimes = fakeData.mimeTypes.filter(
                        m => m.__pluginName === obj.name, // eslint-disable-line
                    );
                    // Add mimetypes
                    mimes.forEach((mime, index) => {
                        // @ts-expect-error mimeTypes can be indexed by number and string too
                        window.navigator.mimeTypes[mime.type].enabledPlugin = obj;
                        // @ts-expect-error mimeTypes can be indexed by number and string too
                        obj[mime.type] = window.navigator.mimeTypes[mime.type];
                        // @ts-expect-error mimeTypes can be indexed by number and string too
                        obj[index] = window.navigator.mimeTypes[mime.type];
                    });

                    return {
                        ...obj,
                        length: mimes.length,
                    };
                })
                .map((obj) => {
                    // Mock functions
                    return {
                        ...obj,
                        namedItem: fakeData.fns.namedItem('Plugin'),
                        item: fakeData.fns.item('Plugin'),
                    };
                })
                .map((obj) => Object.setPrototypeOf(obj, window.Plugin.prototype));

            arr.forEach((obj) => {
                arr[obj.name] = obj;
            });

            // Mock functions
            const arr2 = arr as unknown as MimeTypeArray & { refresh: any };
            arr2.namedItem = fakeData.fns.namedItem('PluginArray');
            arr2.item = fakeData.fns.item('PluginArray');
            arr2.refresh = fakeData.fns.refresh();

            return Object.setPrototypeOf(arr, PluginArray.prototype);
        }

        const pluginArray = generatePluginArray();
        Object.defineProperty(window.navigator, 'plugins', {
            get: () => pluginArray,
        });

        // Make mockedFns toString() representation resemble a native function
        makeFnsNative(mockedFns);
    }
    const isPluginArray = window.navigator.plugins instanceof PluginArray;
    const hasPlugins = isPluginArray && window.navigator.plugins.length > 0;
    if (isPluginArray && hasPlugins) {
        return; // nothing to do here
    }
    mockPluginsAndMimeTypes();
};

export const emulateConsoleDebug = () => {
    window.console.debug = () => {
        return null;
    };
};

// Should be mocked more properly - this one will bypass only some stupid tests
export const mockChrome = () => {
    // @ts-ignore
    if (!window.chrome) {
        Object.defineProperty(window, 'chrome', {
            value: {
                runtime: {},
            },
        });
    }
};

// not sure if this hack does not broke iframe on websites... Should figure out how to test properly
// Should cover that it is custom function same as the permission query
export const mockChromeInIframe = () => {
    const oldCreate = document.createElement.bind(document);
    const newCreate = (...args: Parameters<Document['createElement']>) => {
        if (args[0] === 'iframe') {
            const iframe = oldCreate(...args) as HTMLIFrameElement;
            if (!iframe.contentWindow) {
                Object.defineProperty(iframe, 'contentWindow', {
                    configurable: true,
                    value: { chrome: {} },
                });
            }

            // @ts-expect-error
            if (!iframe.contentWindow?.chrome) {
                Object.defineProperty(iframe.contentWindow, 'chrome', {
                    value: {},
                    configurable: true,
                });
            }
            return iframe;
        }
        return oldCreate(...args);
    };

    newCreate.toString = () => 'function createElement() { [native code] }';

    document.createElement = newCreate;

    const oldCall = Function.prototype.call;
    function call() {
        // @ts-ignore
        return oldCall.apply(this, arguments); //eslint-disable-line
    }
    // eslint-disable-next-line
    Function.prototype.call = call;

    const nativeToStringFunctionString = Error.toString().replace(
        /Error/g,
        'toString',
    );
    const oldToString = Function.prototype.toString;

    function functionToString() {
        // @ts-ignore
        if (this === window.document.createElement) {
            return 'function createElement() { [native code] }';
        }

        // @ts-ignore
        if (this === functionToString) {
            return nativeToStringFunctionString;
        }

        // @ts-ignore
        return oldCall.call(oldToString, this);
    }
    // eslint-disable-next-line
    Function.prototype.toString = functionToString
};

export const mockDeviceMemory = () => {
    // TODO: Count from env according to - https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory
    Object.defineProperty(navigator, 'deviceMemory', {
        value: 8,
    });
};
