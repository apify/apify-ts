import { Dictionary } from '@crawlee/types';
import { IncomingMessage } from 'node:http';
import { HTTPResponse } from 'puppeteer';
import { Cookie } from 'tough-cookie';
import { CookieParseError } from './errors';

export function getCookiesFromResponse(response: IncomingMessage | HTTPResponse | { headers: Dictionary<string | string[]> }): Cookie[] {
    const headers = typeof response.headers === 'function' ? response.headers() : response.headers;
    const cookieHeader = headers['set-cookie'] || '';

    try {
        return Array.isArray(cookieHeader)
            ? cookieHeader.map((cookie) => Cookie.parse(cookie)!)
            : [Cookie.parse(cookieHeader)!];
    } catch (e) {
        throw new CookieParseError(cookieHeader);
    }
}
