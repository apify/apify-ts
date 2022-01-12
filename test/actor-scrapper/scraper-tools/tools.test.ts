import Apify from 'apify';

const tools = require('@apify/scraper-tools/tools');
const { META_KEY } = require('@apify/scraper-tools/consts');

describe('tools.', () => {
    describe('ensureMetaData()', () => {
        it('should work', () => {
            const request = new Apify.Request({ url: 'https://www.example.com' });
            tools.ensureMetaData(request);

            expect(typeof request.userData[META_KEY]).toBe('object');

            // TODO: type this correctly
            const meta = request.userData[META_KEY] as { depth: number; parentRequestId: null };

            expect(meta.depth).toBe(0);
            expect(meta.parentRequestId).toBeNull();
        });
    });
});
