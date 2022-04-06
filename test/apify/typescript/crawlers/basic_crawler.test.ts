import { BasicCrawlerOptions } from '@crawlers/basic';

describe('BasicCrawler TS', () => {
    describe('generics', () => {
        test('options', async () => {
            const requestQueue: any = {
                addRequest: () => {},
            };

            const options: BasicCrawlerOptions = {
                requestHandler: null as any,
                requestQueue,
                sessionPoolOptions: {
                    sessionOptions: {
                        sessionPool: null as any,
                        userData: {
                            userAgent: 'user-agent',
                        },
                    },
                },
            };

            await options.requestQueue!.addRequest({
                url: '',
                userData: {
                    myValue: 'asdf',
                },
            });

            await options.requestQueue!.addRequest({
                url: '',
                userData: {
                    myValue: 'asdf',
                    myMaybeValue: false,
                },
            }, { forefront: true });

            // eslint-disable-next-line no-unused-expressions
            options.sessionPoolOptions!.sessionOptions!.userData.userAgent === 'user-agent';
        });
    });
});
