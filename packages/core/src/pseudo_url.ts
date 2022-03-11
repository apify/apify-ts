import ow from 'ow';
import { log } from './log';
import { Request, RequestOptions } from './request';

/**
 * Parses PURL into Regex string.
 * @ignore
 */
const parsePurl = (purl: string) => {
    const trimmedPurl = purl.trim();
    if (trimmedPurl.length === 0) throw new Error(`Cannot parse PURL '${trimmedPurl}': it must be an non-empty string`);

    let regex = '^';

    try {
        let openBrackets = 0;
        for (let i = 0; i < trimmedPurl.length; i++) {
            const ch = trimmedPurl.charAt(i);

            if (ch === '[' && ++openBrackets === 1) {
                // Beginning of '[regex]' section
                // Enclose regex in () brackets to enforce operator priority
                regex += '(';
            } else if (ch === ']' && openBrackets > 0 && --openBrackets === 0) {
                // End of '[regex]' section
                regex += ')';
            } else if (openBrackets > 0) {
                // Inside '[regex]' section
                regex += ch;
            } else {
                // Outside '[regex]' section, parsing the URL part
                const code = ch.charCodeAt(0);
                if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
                    // Alphanumeric character => copy it.
                    regex += ch;
                } else {
                    // Special character => escape it
                    const hex = code < 16 ? `0${code.toString(16)}` : code.toString(16);
                    regex += `\\x${hex}`;
                }
            }
        }
        regex += '$';
    } catch (err) {
        throw new Error(`Cannot parse PURL '${purl}': ${err}`);
    }

    return regex;
};

/**
 * Represents a pseudo-URL (PURL) - an URL pattern used by web crawlers
 * to specify which URLs should the crawler visit.
 * This class is used by the {@link enqueueLinks} function.
 *
 * A PURL is simply a URL with special directives enclosed in `[]` brackets.
 * Currently, the only supported directive is `[RegExp]`,
 * which defines a JavaScript-style regular expression to match against the URL.
 *
 * The `PseudoUrl` class can be constructed either using a pseudo-URL string
 * or a regular expression (an instance of the `RegExp` object).
 * With a pseudo-URL string, the matching is always case-insensitive.
 * If you need case-sensitive matching, use an appropriate `RegExp` object.
 *
 * For example, a PURL `http://www.example.com/pages/[(\w|-)*]` will match all of the following URLs:
 *
 * - `http://www.example.com/pages/`
 * - `http://www.example.com/pages/my-awesome-page`
 * - `http://www.example.com/pages/something`
 *
 * Be careful to correctly escape special characters in the pseudo-URL string.
 * If either `[` or `]` is part of the normal query string, it must be encoded as `[\x5B]` or `[\x5D]`,
 * respectively. For example, the following PURL:
 * ```http
 * http://www.example.com/search?do[\x5B]load[\x5D]=1
 * ```
 * will match the URL:
 * ```http
 * http://www.example.com/search?do[load]=1
 * ```
 *
 * If the regular expression in the pseudo-URL contains a backslash character (\),
 * you need to escape it with another back backslash, as shown in the example below.
 *
 * **Example usage:**
 *
 * ```javascript
 * // Using a pseudo-URL string
 * const purl = new PseudoUrl('http://www.example.com/pages/[(\\w|-)+]', {
 *   userData: { foo: 'bar' },
 * });
 *
 * // Using a regular expression
 * const purl2 = new PseudoUrl(/http:\/\/www\.example\.com\/pages\/(\w|-)+/);
 *
 * if (purl.matches('http://www.example.com/pages/my-awesome-page')) console.log('Match!');
 * ```
 * @category Sources
 */
export class PseudoUrl {
    private readonly regex: RegExp;

    /**
     * @param purl
     *   A pseudo-URL string or a regular expression object.
     *   Using a `RegExp` instance enables more granular control,
     *   such as making the matching case sensitive.
     * @param requestTemplate
     *   Options for the new {@link Request} instances created for matching URLs
     *   by the {@link enqueueLinks} function.
     */
    constructor(purl: string | RegExp, readonly requestTemplate: Partial<RequestOptions> = {}) {
        ow(purl, ow.any(ow.string, ow.regExp));
        ow(requestTemplate, ow.object);

        if (purl instanceof RegExp) {
            this.regex = purl;
        } else {
            const regex = parsePurl(purl);
            log.debug('PURL parsed', { purl, regex });
            this.regex = new RegExp(regex, 'i');
        }
    }

    /**
     * Determines whether a URL matches this pseudo-URL pattern.
     *
     * @param url URL to be matched.
     * @return Returns `true` if given URL matches pseudo-URL.
     */
    matches(url: string): boolean {
        return typeof url as unknown === 'string' && url.match(this.regex) !== null;
    }

    /**
     * Creates a Request object from a provided `requestTemplate` and a given URL
     * or an object that specifies ${@link Request} properties. In case of a collision
     * the properties will override the template, except for `userData`, which will
     * be merged together, with the `userData` property having preference over the template.
     * This enables dynamic overriding of the template.
     */
    createRequest(urlOrProps: string | RequestOptions): Request {
        const props: Partial<RequestOptions> = typeof urlOrProps === 'string' ? { url: urlOrProps } : urlOrProps;
        props.userData = { ...this.requestTemplate.userData, ...props.userData };
        const options = { ...this.requestTemplate, ...props } as RequestOptions; // props.userData will override template with merged data.

        return new Request(options);
    }
}

export type PseudoUrlObject = Pick<RequestOptions, 'headers' | 'method' | 'payload' | 'userData'> & {
    purl: string | RegExp;
}
