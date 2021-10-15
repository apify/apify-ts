import ow from 'ow';

export const validators = {
    // Naming it browser page for future proofing with Playwright
    browserPage: (value: Record<string, unknown>) => ({
        validator: ow.isValid(value, ow.object.hasKeys('goto', 'evaluate', '$', 'on')),
        message: (label: string) => `Expected argument '${label}' to be a Puppeteer Page, got something else.`,
    }),
    proxyConfiguration: (value: Record<string, unknown>) => ({
        validator: ow.isValid(value, ow.object.hasKeys('newUrl', 'newProxyInfo')),
        message: (label: string) => `Expected argument '${label}' to be a ProxyConfiguration, got something else.`,
    }),
    requestList: (value: Record<string, unknown>) => ({
        validator: ow.isValid(value, ow.object.hasKeys('fetchNextRequest', 'persistState')),
        message: (label: string) => `Expected argument '${label}' to be a RequestList, got something else.`,
    }),
    requestQueue: (value: Record<string, unknown>) => ({
        validator: ow.isValid(value, ow.object.hasKeys('fetchNextRequest', 'addRequest')),
        message: (label: string) => `Expected argument '${label}' to be a RequestQueue, got something else.`,
    }),
    pseudoUrl: (value: Record<string, unknown>) => ({
        validator: ow.isValid(value, ow.object.hasKeys('regex', 'requestTemplate')),
        message: (label: string) => `Expected argument '${label}' to be a PseudoUrl, got something else.`,
    }),
};
