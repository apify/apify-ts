import ow from 'ow';
import { Dictionary } from './typedefs';

export const validators = {
    // Naming it browser page for future proofing with Playwright
    browserPage: (value: Dictionary<any>) => ({
        validator: ow.isValid(value, ow.object.hasKeys('goto', 'evaluate', '$', 'on')),
        message: (label: string) => `Expected argument '${label}' to be a Puppeteer Page, got something else.`,
    }),
    proxyConfiguration: (value: Dictionary<any>) => ({
        validator: ow.isValid(value, ow.object.hasKeys('newUrl', 'newProxyInfo')),
        message: (label: string) => `Expected argument '${label}' to be a ProxyConfiguration, got something else.`,
    }),
    requestList: (value: Dictionary<any>) => ({
        validator: ow.isValid(value, ow.object.hasKeys('fetchNextRequest', 'persistState')),
        message: (label: string) => `Expected argument '${label}' to be a RequestList, got something else.`,
    }),
    requestQueue: (value: Dictionary<any>) => ({
        validator: ow.isValid(value, ow.object.hasKeys('fetchNextRequest', 'addRequest')),
        message: (label: string) => `Expected argument '${label}' to be a RequestQueue, got something else.`,
    }),
    pseudoUrl: (value: Dictionary<any>) => ({
        validator: ow.isValid(value, ow.object.hasKeys('regex', 'requestTemplate')),
        message: (label: string) => `Expected argument '${label}' to be a PseudoUrl, got something else.`,
    }),
};
