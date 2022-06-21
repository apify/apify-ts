import { EVENT_SESSION_RETIRED, ProxyConfiguration, Session, SessionPool, STATUS_CODES_BLOCKED } from '@crawlee/core';
import type { Dictionary } from '@crawlee/utils';
import { entries, sleep } from '@crawlee/utils';

describe('Session - testing session behaviour ', () => {
    let sessionPool: SessionPool;
    let session: Session;

    beforeEach(() => {
        sessionPool = new SessionPool();
        session = new Session({ sessionPool });
    });

    test('should markGood session and lower the errorScore', () => {
        // @ts-expect-error Private property
        expect(session.usageCount).toBe(0);
        // @ts-expect-error Private property
        expect(session.errorScore).toBe(0);
        session.markGood();
        // @ts-expect-error Private property
        expect(session.usageCount).toBe(1);
        // @ts-expect-error Private property
        expect(session.errorScore).toBe(0);
        // @ts-expect-error Private property
        session.errorScore = 1;
        session.markGood();
        // @ts-expect-error Private property
        expect(session.errorScore).toBe(0.5);
    });

    test('should throw error when param sessionPool is not EventEmitter instance', () => {
        let err;
        try {
            // @ts-expect-error JS-side validation
            new Session({ sessionPool: {} }); // eslint-disable-line
        } catch (e) {
            err = e;
        }
        expect(err).toBeDefined();
        expect((err as Error).message.includes('object `sessionPool` `{}` to be of type `SessionPool`')).toBe(true);
    });

    test('should mark session markBad', () => {
        session.markBad();
        // @ts-expect-error Private property
        expect(session.errorScore).toBe(1);
        // @ts-expect-error Private property
        expect(session.usageCount).toBe(1);
    });

    test('should expire session', async () => {
        session = new Session({ maxAgeSecs: 1 / 100, sessionPool });
        await sleep(101);
        expect(session.isExpired()).toBe(true);
        expect(session.isUsable()).toBe(false);
    });

    test('should max out session usage', () => {
        // @ts-expect-error Private property
        session.maxUsageCount = 1;
        session.markGood();
        expect(session.isMaxUsageCountReached()).toBe(true);
        expect(session.isUsable()).toBe(false);
    });

    test('should block session', () => {
        // @ts-expect-error Private property
        session.errorScore += session.maxErrorScore;
        expect(session.isBlocked()).toBe(true);
        expect(session.isUsable()).toBe(false);
    });
    test('should not throw on invalid Cookie header', () => {
        let error;

        try {
            session.setCookiesFromResponse({ headers: { Cookie: 'invaldi*{*{*{*-----***@s' }, url: 'http://localhost:1337' });
        } catch (e) {
            error = e;
        }

        expect(error).toBeUndefined();
    });

    test('should markGood session', () => {
        session.markGood();
        // @ts-expect-error Private property
        expect(session.usageCount).toBe(1);
        expect(session.isUsable()).toBe(true);
    });

    test('should retire session', () => {
        let discarded = false;
        sessionPool.on(EVENT_SESSION_RETIRED, (ses) => {
            expect(ses instanceof Session).toBe(true);
            discarded = true;
        });
        session.retire();
        expect(discarded).toBe(true);
        // @ts-expect-error Private property
        expect(session.usageCount).toBe(1);
    });

    test('should retire session after marking bad', () => {
        // @ts-expect-error Private property
        jest.spyOn(session, '_maybeSelfRetire');
        jest.spyOn(session, 'retire');
        session.markBad();
        expect(session.retire).toBeCalledTimes(0);
        session.isUsable = () => false;
        session.markBad();
        expect(session.retire).toBeCalledTimes(1);
    });

    test('should retire session after marking good', () => {
        // @ts-expect-error Private property
        jest.spyOn(session, '_maybeSelfRetire');
        jest.spyOn(session, 'retire');

        session.markGood();
        expect(session.retire).toBeCalledTimes(0);

        session.isUsable = () => false;
        session.markGood();
        expect(session.retire).toBeCalledTimes(1);
    });

    test('should reevaluate usability of session after marking the session', () => {
        // @ts-expect-error Private property
        jest.spyOn(session, '_maybeSelfRetire');
        session.markGood();
        // @ts-expect-error Private property
        expect(session._maybeSelfRetire).toBeCalledTimes(1);
        session.markBad();
        // @ts-expect-error Private property
        expect(session._maybeSelfRetire).toBeCalledTimes(2);
    });

    test('should get state', () => {
        const state = session.getState();

        expect(state.id).toBeDefined();
        expect(state.cookieJar).toBeDefined();
        expect(state.userData).toBeDefined();
        expect(state.maxErrorScore).toBeDefined();
        expect(state.errorScoreDecrement).toBeDefined();
        expect(state.expiresAt).toBeDefined();
        expect(state.createdAt).toBeDefined();
        expect(state.usageCount).toBeDefined();
        expect(state.errorScore).toBeDefined();

        entries(state).forEach(([key, value]) => {
            if (session[key] instanceof Date) {
                expect((session[key] as Date).toISOString()).toEqual(value);
            } else if (key === 'cookieJar') {
                expect(value).toEqual(session[key].toJSON());
            } else {
                expect(session[key]).toEqual(value);
            }
        });
    });

    test('should be valid proxy session', async () => {
        const proxyConfiguration = new ProxyConfiguration({ proxyUrls: ['http://localhost:1234'] });
        session = new Session({ sessionPool });
        let error;
        try {
            await proxyConfiguration.newUrl(session.id);
        } catch (e) {
            error = e;
        }

        expect(error).toBeUndefined();
    });

    test('should use cookieJar', () => {
        session = new Session({ sessionPool });
        // @ts-expect-error Private property
        expect(session.cookieJar.setCookie).toBeDefined();
    });

    test('should checkStatus work', () => {
        session = new Session({ sessionPool });
        expect(session.retireOnBlockedStatusCodes(100)).toBeFalsy();
        expect(session.retireOnBlockedStatusCodes(200)).toBeFalsy();
        expect(session.retireOnBlockedStatusCodes(400)).toBeFalsy();
        expect(session.retireOnBlockedStatusCodes(500)).toBeFalsy();
        STATUS_CODES_BLOCKED.forEach((status) => {
            const sess = new Session({ sessionPool });
            let isCalled;
            const call = () => { isCalled = true; };
            sess.retire = call;
            expect(sess.retireOnBlockedStatusCodes(status)).toBeTruthy();
            expect(isCalled).toBeTruthy();
        });
    });

    test('should checkStatus work with custom codes', () => {
        session = new Session({ sessionPool });
        const customStatusCodes = [100, 202, 300];
        expect(session.retireOnBlockedStatusCodes(100, customStatusCodes)).toBeTruthy();
        expect(session.retireOnBlockedStatusCodes(101, customStatusCodes)).toBeFalsy();
        expect(session.retireOnBlockedStatusCodes(200, customStatusCodes)).toBeFalsy();
        expect(session.retireOnBlockedStatusCodes(202, customStatusCodes)).toBeTruthy();
        expect(session.retireOnBlockedStatusCodes(300, customStatusCodes)).toBeTruthy();
        expect(session.retireOnBlockedStatusCodes(400, customStatusCodes)).toBeFalsy();
    });

    test('setPuppeteerCookies should work', () => {
        const url = 'https://example.com';
        const cookies = [
            { name: 'cookie1', value: 'my-cookie' },
            { name: 'cookie2', value: 'your-cookie' },
        ];

        session = new Session({ sessionPool });
        session.setPuppeteerCookies(cookies, url);
        expect(session.getCookieString(url)).toBe('cookie1=my-cookie; cookie2=your-cookie');
    });

    test('setPuppeteerCookies should work for session (with expiration date: -1) cookies', () => {
        const url = 'https://example.com';
        const cookies = [
            { name: 'session_cookie', value: 'session-cookie-value', expires: -1 },
        ];

        session = new Session({ sessionPool });
        session.setPuppeteerCookies(cookies, url);
        expect(session.getCookieString(url)).toBe('session_cookie=session-cookie-value');
    });

    test('setPuppeteerCookies works with leading dots in domains', () => {
        const url = 'https://www.example.com';
        const cookies = [
            { name: 'cookie1', value: 'my-cookie', domain: 'abc.example.com' },
            { name: 'cookie2', value: 'your-cookie', domain: '.example.com' },
        ];

        session = new Session({ sessionPool });
        session.setPuppeteerCookies(cookies, url);
        expect(session.getCookieString(url)).toBe('cookie2=your-cookie');
    });

    describe('.putResponse & .getCookieString', () => {
        test('should set and update cookies from "set-cookie" header', () => {
            const headers: Dictionary<string | string[]> = {};

            headers['set-cookie'] = [
                'CSRF=e8b667; Domain=example.com; Secure ',
                'id=a3fWa; Expires=Wed, Domain=example.com; 21 Oct 2015 07:28:00 GMT',
            ];
            const newSession = new Session({ sessionPool: new SessionPool() });
            const url = 'https://example.com';
            newSession.setCookiesFromResponse({ headers, url });
            let cookies = newSession.getCookieString(url);
            expect(cookies).toEqual('CSRF=e8b667; id=a3fWa');

            const newCookie = 'ABCD=1231231213; Domain=example.com; Secure';

            newSession.setCookiesFromResponse({ headers: { 'set-cookie': newCookie }, url });
            cookies = newSession.getCookieString(url);
            expect(cookies).toEqual('CSRF=e8b667; id=a3fWa; ABCD=1231231213');
        });
    });

    test('should correctly persist and init cookieJar', () => {
        const headers: Dictionary<string | string[]> = {};

        headers['set-cookie'] = [
            'CSRF=e8b667; Domain=example.com; Secure ',
            'id=a3fWa; Expires=Wed, Domain=example.com; 21 Oct 2015 07:28:00 GMT',
        ];
        const newSession = new Session({ sessionPool: new SessionPool() });
        const url = 'https://example.com';
        newSession.setCookiesFromResponse({ headers, url });

        const old = newSession.getState();

        // @ts-expect-error Overriding string -> Date
        old.createdAt = new Date(old.createdAt);
        // @ts-expect-error Overriding string -> Date
        old.expiresAt = new Date(old.expiresAt);

        // @ts-expect-error string -> Date for createdAt has been overridden
        const reinitializedSession = new Session({ sessionPool, ...old });
        expect(reinitializedSession.getCookieString(url)).toEqual('CSRF=e8b667; id=a3fWa');
    });
});
