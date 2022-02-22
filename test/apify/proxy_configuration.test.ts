import { ENV_VARS, LOCAL_ENV_VARS } from '@apify/consts';
import { createProxyConfiguration, ProxyConfiguration, requestAsBrowser } from '@crawlers/core';
import { UserClient } from 'apify-client';

const groups = ['GROUP1', 'GROUP2'];
const hostname = LOCAL_ENV_VARS[ENV_VARS.PROXY_HOSTNAME];
const port = Number(LOCAL_ENV_VARS[ENV_VARS.PROXY_PORT]);
const password = 'test12345';
const countryCode = 'CZ';
const sessionId = 538909250932;
const basicOpts = {
    groups,
    countryCode,
    password,
};
const basicOptsProxyUrl = 'http://groups-GROUP1+GROUP2,session-538909250932,country-CZ:test12345@proxy.apify.com:8000';
const proxyUrlNoSession = 'http://groups-GROUP1+GROUP2,country-CZ:test12345@proxy.apify.com:8000';

jest.mock('@crawlers/utils/src/internals/request', () => {
    const original: typeof import('@crawlers/utils/src/internals/request') = jest.requireActual('@crawlers/utils/src/internals/request');
    return {
        ...original,
        requestAsBrowser: jest.fn(),
    };
});

const requestAsBrowserSpy = requestAsBrowser as jest.MockedFunction<typeof requestAsBrowser>;

afterAll(() => {
    jest.unmock('@crawlers/utils/src/internals/request');
});

afterEach(() => {
    delete process.env[ENV_VARS.TOKEN];
    delete process.env[ENV_VARS.PROXY_PASSWORD];
    delete process.env[ENV_VARS.PROXY_HOSTNAME];
    delete process.env[ENV_VARS.PROXY_STATUS_URL];
});

describe('ProxyConfiguration', () => {
    test('should accept all options', () => {
        const proxyConfiguration = new ProxyConfiguration(basicOpts);

        expect(proxyConfiguration).toBeInstanceOf(ProxyConfiguration);
        // @ts-expect-error private property
        expect(proxyConfiguration.groups).toBe(groups);
        // @ts-expect-error private property
        expect(proxyConfiguration.countryCode).toBe(countryCode);
        // @ts-expect-error private property
        expect(proxyConfiguration.password).toBe(password);
        // @ts-expect-error private property
        expect(proxyConfiguration.hostname).toBe(hostname);
        // @ts-expect-error private property
        expect(proxyConfiguration.port).toBe(port);
    });

    test('newUrl() should return proxy URL', () => {
        const proxyConfiguration = new ProxyConfiguration(basicOpts);

        expect(proxyConfiguration.newUrl(sessionId)).toBe(basicOptsProxyUrl);
    });

    test('newProxyInfo() should return ProxyInfo object', () => {
        const proxyConfiguration = new ProxyConfiguration(basicOpts);
        const url = basicOptsProxyUrl;

        const proxyInfo = {
            sessionId: `${sessionId}`,
            url,
            groups,
            countryCode,
            password,
            hostname,
            port,
        };
        expect(proxyConfiguration.newProxyInfo(sessionId)).toStrictEqual(proxyInfo);
    });

    test('actor UI input schema should work', () => {
        const apifyProxyGroups = ['GROUP1', 'GROUP2'];
        const apifyProxyCountry = 'CZ';

        const input = {
            apifyProxyGroups,
            apifyProxyCountry,
        };

        const proxyConfiguration = new ProxyConfiguration(input);

        // @ts-expect-error
        expect(proxyConfiguration.groups).toStrictEqual(apifyProxyGroups);
        // @ts-expect-error
        expect(proxyConfiguration.countryCode).toStrictEqual(apifyProxyCountry);
    });

    test('should throw on invalid arguments structure', () => {
        // Group value
        const invalidGroups = ['GROUP1*'];
        let opts = { ...basicOpts };
        opts.groups = invalidGroups;

        expect(() => new ProxyConfiguration(opts)).toThrow('got `GROUP1*` in object');

        // Country code
        const invalidCountryCode = 'CZE';
        opts = { ...basicOpts };
        opts.countryCode = invalidCountryCode;
        expect(() => new ProxyConfiguration(opts)).toThrow('got `CZE` in object');
    });

    test('should throw on invalid groups and countryCode args', async () => {
        // @ts-expect-error invalid input
        expect(() => new ProxyConfiguration({ groups: [new Date()] })).toThrowError();
        // @ts-expect-error invalid input
        expect(() => new ProxyConfiguration({ groups: [{}, 'fff', 'ccc'] })).toThrowError();
        expect(() => new ProxyConfiguration({ groups: ['ffff', 'ff-hf', 'ccc'] })).toThrowError();
        expect(() => new ProxyConfiguration({ groups: ['ffff', 'fff', 'cc$c'] })).toThrowError();
        // @ts-expect-error invalid input
        expect(() => new ProxyConfiguration({ apifyProxyGroups: [new Date()] })).toThrowError();

        // @ts-expect-error invalid input
        expect(() => new ProxyConfiguration({ countryCode: new Date() })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: 'aa' })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: 'aB' })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: 'Ba' })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: '11' })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: 'DDDD' })).toThrow();
        expect(() => new ProxyConfiguration({ countryCode: 'dddd' })).toThrow();
        // @ts-expect-error invalid input
        expect(() => new ProxyConfiguration({ countryCode: 1111 })).toThrow();
    });

    test('newUrl() should throw on invalid session argument', () => {
        const proxyConfiguration = new ProxyConfiguration();

        expect(() => proxyConfiguration.newUrl('a-b')).toThrowError();
        expect(() => proxyConfiguration.newUrl('a$b')).toThrowError();
        // @ts-expect-error invalid input
        expect(() => proxyConfiguration.newUrl({})).toThrowError();
        // @ts-expect-error invalid input
        expect(() => proxyConfiguration.newUrl(new Date())).toThrowError();
        expect(() => proxyConfiguration.newUrl(Array(51).fill('x').join(''))).toThrowError();

        expect(() => proxyConfiguration.newUrl('a_b')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl('0.34252352')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl('aaa~BBB')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl('a_1_b')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl('a_2')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl('a')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl('1')).not.toThrowError();
        expect(() => proxyConfiguration.newUrl(123456)).not.toThrowError();
        expect(() => proxyConfiguration.newUrl(Array(50).fill('x').join(''))).not.toThrowError();
    });

    test('should throw on invalid newUrlFunction', async () => {
        const newUrlFunction = () => {
            return 'http://proxy.com:1111*invalid_url';
        };
        const proxyConfiguration = new ProxyConfiguration({
            newUrlFunction,
        });
        try {
            proxyConfiguration.newUrl();
            throw new Error('wrong error');
        } catch (err) {
            expect((err as Error).message).toMatch('The provided newUrlFunction did not return');
        }
    });

    test('newUrlFunction should correctly generate URLs', async () => {
        const customUrls = ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333',
            'http://proxy.com:4444', 'http://proxy.com:5555', 'http://proxy.com:6666'];
        const newUrlFunction = () => {
            return customUrls.pop();
        };
        const proxyConfiguration = new ProxyConfiguration({
            newUrlFunction,
        });

        // through newUrl()
        expect(proxyConfiguration.newUrl()).toEqual('http://proxy.com:6666');
        expect(proxyConfiguration.newUrl()).toEqual('http://proxy.com:5555');
        expect(proxyConfiguration.newUrl()).toEqual('http://proxy.com:4444');

        // through newProxyInfo()
        expect(proxyConfiguration.newProxyInfo().url).toEqual('http://proxy.com:3333');
        expect(proxyConfiguration.newProxyInfo().url).toEqual('http://proxy.com:2222');
        expect(proxyConfiguration.newProxyInfo().url).toEqual('http://proxy.com:1111');
    });

    describe('With proxyUrls options', () => {
        test('should rotate custom URLs correctly', async () => {
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            // @ts-expect-error private property
            const { proxyUrls } = proxyConfiguration;
            expect(proxyConfiguration.newUrl()).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newUrl()).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newUrl()).toEqual(proxyUrls[2]);
            expect(proxyConfiguration.newUrl()).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newUrl()).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newUrl()).toEqual(proxyUrls[2]);
        });

        test('newProxyInfo() should return correctly rotated URL', async () => {
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            // @ts-expect-error TODO private property?
            const { proxyUrls } = proxyConfiguration;
            expect(proxyConfiguration.newProxyInfo().url).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newProxyInfo().url).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newProxyInfo().url).toEqual(proxyUrls[2]);
            expect(proxyConfiguration.newProxyInfo().url).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newProxyInfo().url).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newProxyInfo().url).toEqual(proxyUrls[2]);
        });

        test('should rotate custom URLs with sessions correctly', async () => {
            const sessions = ['sesssion_01', 'sesssion_02', 'sesssion_03', 'sesssion_04', 'sesssion_05', 'sesssion_06'];
            const proxyConfiguration = new ProxyConfiguration({
                proxyUrls: ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'],
            });

            // @ts-expect-error TODO private property?
            const { proxyUrls } = proxyConfiguration;
            // should use same proxy URL
            expect(proxyConfiguration.newUrl(sessions[0])).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newUrl(sessions[0])).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newUrl(sessions[0])).toEqual(proxyUrls[0]);

            // should rotate different proxies
            expect(proxyConfiguration.newUrl(sessions[1])).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newUrl(sessions[2])).toEqual(proxyUrls[2]);
            expect(proxyConfiguration.newUrl(sessions[3])).toEqual(proxyUrls[0]);
            expect(proxyConfiguration.newUrl(sessions[4])).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newUrl(sessions[5])).toEqual(proxyUrls[2]);

            // should remember already used session
            expect(proxyConfiguration.newUrl(sessions[1])).toEqual(proxyUrls[1]);
            expect(proxyConfiguration.newUrl(sessions[3])).toEqual(proxyUrls[0]);
        });

        test('should throw cannot combine custom proxies with Apify Proxy', async () => {
            const proxyUrls = ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'];
            const newUrlFunction = () => {
                return proxyUrls[Math.floor(Math.random() * proxyUrls.length)];
            };
            try {
                // eslint-disable-next-line no-unused-vars
                const proxyConfiguration = new ProxyConfiguration({
                    groups: ['GROUP1'],
                    proxyUrls,
                });
                throw new Error('wrong error');
            } catch (err) {
                expect((err as Error).message).toMatch('Cannot combine custom proxies with Apify Proxy!');
            }

            try {
                // eslint-disable-next-line no-unused-vars
                const proxyConfiguration = new ProxyConfiguration({
                    groups: ['GROUP1'],
                    newUrlFunction,
                });
                throw new Error('wrong error');
            } catch (err) {
                expect((err as Error).message).toMatch('Cannot combine custom proxies with Apify Proxy!');
            }
        });

        test('should throw cannot combine custom methods', async () => {
            const proxyUrls = ['http://proxy.com:1111', 'http://proxy.com:2222', 'http://proxy.com:3333'];
            const newUrlFunction = () => {
                return proxyUrls[Math.floor(Math.random() * proxyUrls.length)];
            };
            try {
                // eslint-disable-next-line no-unused-vars
                const proxyConfiguration = new ProxyConfiguration({
                    proxyUrls,
                    newUrlFunction,
                });
                throw new Error('wrong error');
            } catch (err) {
                expect((err as Error).message).toMatch('Cannot combine custom proxies "options.proxyUrls"');
            }
        });

        test('should throw proxyUrls array is empty', async () => {
            try {
                // eslint-disable-next-line no-unused-vars
                const proxyConfiguration = new ProxyConfiguration({
                    proxyUrls: [],
                });
                throw new Error('wrong error');
            } catch (err) {
                expect((err as Error).message).toMatch('Expected property array `proxyUrls` to not be empty');
            }
        });

        test('should throw invalid custom URL form', async () => {
            try {
                // eslint-disable-next-line no-unused-vars
                const proxyConfiguration = new ProxyConfiguration({
                    proxyUrls: ['http://proxy.com:1111*invalid_url'],
                });
                throw new Error('wrong error');
            } catch (err) {
                expect((err as Error).message).toMatch('to be a URL, got `http://proxy.com:1111*invalid_url`');
            }
        });
    });
});

describe('Apify.createProxyConfiguration()', () => {
    const userData = { proxy: { password } };

    test('should work with all options', async () => {
        const status = { connected: true };
        const proxyUrl = proxyUrlNoSession;
        const url = 'http://proxy.apify.com/?format=json';
        requestAsBrowserSpy.mockResolvedValueOnce({ body: status } as any);

        const proxyConfiguration = await createProxyConfiguration(basicOpts);

        expect(proxyConfiguration).toBeInstanceOf(ProxyConfiguration);
        // @ts-expect-error private property
        expect(proxyConfiguration.groups).toBe(groups);
        // @ts-expect-error private property
        expect(proxyConfiguration.countryCode).toBe(countryCode);
        // @ts-expect-error private property
        expect(proxyConfiguration.password).toBe(password);
        // @ts-expect-error private property
        expect(proxyConfiguration.hostname).toBe(hostname);
        // @ts-expect-error private property
        expect(proxyConfiguration.port).toBe(port);

        expect(requestAsBrowserSpy).toBeCalledWith({ url, proxyUrl, timeout: { request: 4000 }, responseType: 'json' });
    });

    test('should work without password (with token)', async () => {
        process.env.APIFY_TOKEN = '123456789';
        const opts = { ...basicOpts };
        delete opts.password;

        const getUserSpy = jest.spyOn(UserClient.prototype, 'get');
        const status = { connected: true };

        requestAsBrowserSpy.mockResolvedValueOnce({ body: status } as any);
        getUserSpy.mockResolvedValueOnce(userData as any);

        const proxyConfiguration = await createProxyConfiguration(opts);

        expect(proxyConfiguration).toBeInstanceOf(ProxyConfiguration);
        // @ts-expect-error private property
        expect(proxyConfiguration.groups).toBe(groups);
        // @ts-expect-error private property
        expect(proxyConfiguration.countryCode).toBe(countryCode);
        // @ts-expect-error private property
        expect(proxyConfiguration.hostname).toBe(hostname);
        // @ts-expect-error private property
        expect(proxyConfiguration.port).toBe(port);

        requestAsBrowserSpy.mockRestore();
        getUserSpy.mockRestore();
    });

    test('should show warning log', async () => {
        process.env.APIFY_TOKEN = '123456789';

        const getUserSpy = jest.spyOn(UserClient.prototype, 'get');
        const status = { connected: true };
        const fakeUserData = { proxy: { password: 'some-other-users-password' } };
        getUserSpy.mockResolvedValueOnce(fakeUserData as any);
        requestAsBrowserSpy.mockResolvedValueOnce({ body: status } as any);

        // eslint-disable-next-line no-unused-vars
        const proxyConfiguration = new ProxyConfiguration(basicOpts);
        // @ts-expect-error
        const logMock = jest.spyOn(proxyConfiguration.log, 'warning');
        await proxyConfiguration.initialize();
        expect(logMock).toBeCalledTimes(1);

        logMock.mockRestore();
        getUserSpy.mockRestore();
        requestAsBrowserSpy.mockRestore();
    });

    test('should throw missing password', async () => {
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        delete process.env[ENV_VARS.TOKEN];

        const status = { connected: true };

        const fakeCall = async () => {
            return { body: status };
        };

        requestAsBrowserSpy.mockImplementationOnce(fakeCall as any);

        await expect(createProxyConfiguration()).rejects.toThrow('Apify Proxy password must be provided');

        requestAsBrowserSpy.mockRestore();
    });

    test('should throw when group is not available', async () => {
        delete process.env[ENV_VARS.PROXY_PASSWORD];
        process.env.APIFY_TOKEN = '123456789';
        const connectionError = 'Invalid username: proxy group "GROUP2"; not found or not accessible.';
        const status = { connected: false, connectionError };
        const getUserSpy = jest.spyOn(UserClient.prototype, 'get');
        getUserSpy.mockResolvedValue(userData as any);
        requestAsBrowserSpy.mockResolvedValueOnce({ body: status } as any);

        await expect(createProxyConfiguration({ groups })).rejects.toThrow(connectionError);

        requestAsBrowserSpy.mockRestore();
        getUserSpy.mockRestore();
    });

    test('should not throw when access check is unresponsive', async () => {
        process.env.APIFY_PROXY_PASSWORD = '123456789';
        requestAsBrowserSpy.mockRejectedValueOnce(new Error('some error'));
        requestAsBrowserSpy.mockRejectedValueOnce(new Error('some error'));

        const proxyConfiguration = new ProxyConfiguration();
        // @ts-expect-error private property
        const logMock = jest.spyOn(proxyConfiguration.log, 'warning');

        await proxyConfiguration.initialize();
        expect(logMock).toBeCalledTimes(1);

        requestAsBrowserSpy.mockRestore();
        logMock.mockRestore();
    });

    test('should connect to proxy in environments other than production', async () => {
        process.env.APIFY_PROXY_STATUS_URL = 'http://proxy-domain.apify.com';
        process.env.APIFY_PROXY_HOSTNAME = 'proxy-domain.apify.com';
        process.env.APIFY_PROXY_PASSWORD = password;

        requestAsBrowserSpy.mockResolvedValueOnce({ body: { connected: true } } as any);

        await createProxyConfiguration();
        expect(requestAsBrowserSpy).toBeCalledWith({
            url: `${process.env.APIFY_PROXY_STATUS_URL}/?format=json`,
            proxyUrl: `http://auto:${password}@${process.env.APIFY_PROXY_HOSTNAME}:8000`,
            responseType: 'json',
            timeout: {
                request: 4000,
            },
        });

        requestAsBrowserSpy.mockRestore();
    });
});
