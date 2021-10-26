import { BasicCrawlerOptions } from 'apify';

describe('BasicCrawler TS', () => {
    describe('generics', () => {
        test('options', () => {
            const requestQueue: any = {
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                addRequest: () => {},
            };

            const options: BasicCrawlerOptions = {
                handleRequestFunction: null as any,
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

            options.requestQueue!.addRequest({
                url: '',
                userData: {
                    myValue: 'asdf',
                },
            });

            options.requestQueue!.addRequest({
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
