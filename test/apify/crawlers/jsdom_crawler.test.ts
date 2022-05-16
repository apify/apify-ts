import http from 'http';
import { AddressInfo } from 'net';
import { JSDOMCrawler, RequestList } from '../../../packages/jsdom-crawler/src/index';

const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(`<!DOCTYPE html><html><head><title>foobar</title></head><body><p>Hello, world!</p></body></html>`);
});

let url: string;

beforeAll((callback) => {
    server.listen(0, () => {
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

        callback();
    });
});

afterAll((callback) => {
    server.close(callback);
});

describe('window', () => {
    test('selector', async () => {
        let failPromise = Promise.resolve();

        expect.assertions(2);

        const requestList = new RequestList({
            sources: [
                { url },
            ],
        });

        await requestList.initialize();

        const crawler = new JSDOMCrawler({
            maxRequestRetries: 0,
            requestList,
            requestHandler: ({
                window,
            }) => {
                expect(window.document.title).toBe('foobar');
                expect(window.document.querySelector('p').textContent).toBe('Hello, world!');
            },
            failedRequestHandler: ({ error }) => {
                failPromise = Promise.reject(error);
            },
        });

        await crawler.run();
        await failPromise;
    });
});
