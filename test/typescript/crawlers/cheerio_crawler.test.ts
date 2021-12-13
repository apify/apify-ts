import * as cheerio from 'cheerio';
import Apify, {
    CheerioCrawler,
    CheerioHandlePage,
    CheerioHandlePageInputs,
    RequestList,
} from 'apify';

describe('CheerioCrawler TS', () => {
    describe('CheerioHandlePage', () => {
        let testInputs: CheerioHandlePageInputs;

        beforeEach(() => {
            const body = '<a href="#">';
            testInputs = {
                id: '123',
                $: cheerio.load(body),
                body,
                json: null as any,
                proxyInfo: null as any,
                session: null as any,
                request: new Apify.Request({ url: ' http://www.test1234.com' }),
                contentType: { type: 'text/html', encoding: 'utf-8' },
                response: null as any,
                crawler: null as any,
            };
        });

        test('Can pass around and call `handler(var: CheerioHandlePageInputs)`', async () => {
            // This form can be easily reused returning arbitrary type by passing `inputs` from another handler function and
            //   processing the return value there. If returning anything, this function can't be used directly in a crawler.
            // Auto-completion works on all input variables in parameter `inputs`.
            const x = async (inputs: CheerioHandlePageInputs) => {
                expect(inputs.$!('a').attr('href')).toEqual('#');
            };

            // @ts-expect-error
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const crawlerX = new CheerioCrawler({
                handlePageFunction: x,
                requestList: new RequestList({ sources: [] }),
            });

            await x(testInputs);
        });

        test('Can pass around and call `handler({ var }: { var: Type})`', async () => {
            // This form can also be easily reused as above.
            // Auto-completion works on defined input variables in parameter list.
            const y = async ({ $ }: { $?: cheerio.CheerioAPI }) => {
                expect($!('a').attr('href')).toEqual('#');
            };

            // @ts-expect-error
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const crawler = new CheerioCrawler({
                handlePageFunction: y,
                requestList: new RequestList({ sources: [] }),
            });

            await y(testInputs);
        });

        test('Can pass around and call `handler: CheerioHandlePage`', async () => {
            // In this form, the return type of the function is strictly enforced to be `Promise<void>`. This form can be reused
            //   if it produces the desired side-effects (or nothing) without returning a value. On the other hand, we can describe
            //   the parameter list in any of the above styles without attaching a typing to input variables.
            // Auto-completion works in both cases.
            // Type-checking guards from potential errors in logic, be raising an error if return type does not match what is
            //   expected by the crawler.
            const z: CheerioHandlePage = async ({ $ = null }) => {
                expect($!('a').attr('href')).toEqual('#');
            };

            // @ts-expect-error
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const crawler = new CheerioCrawler({
                handlePageFunction: z,
                requestList: new RequestList({ sources: [] }),
            });

            await z(testInputs);
        });
    });
});
